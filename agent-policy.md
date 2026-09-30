---
title: "Agent policy"
description: "Set the numbers every agent obeys — turns, context, time, recovery — as one budget row, and decide what happens at each boundary with hooks or a policy of your own."
lede: "Set the numbers every agent obeys as one row of data, and change a single decision without rewriting the rest."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/agents/src/AgentPolicy.ts   Budget, policyFromBudget, DefaultAgentPolicyOpts, AgentPolicy, NudgeInput, PromptOf
  lloyal-sdk  packages/agents/src/pressure.ts      DEFAULT_SOFT_LIMIT 1024, DEFAULT_HARD_LIMIT 512
  lloyal-sdk  packages/agents/src/create-agent-pool.ts  CreateAgentPoolOpts: budget | policy (never both; guards/hooks/acceptFreeText only with budget)
  lloyal-sdk  packages/agents/src/context.ts       WindDown (drain + recover; retry parks abandoned), CancelAgent (discard, no recovery), Pause
  lloyal-sdk  packages/rig/src/initialize-harness.ts  sets WindDown/CancelAgent/Pause from the runner
  lloyal-sdk  packages/rig/src/execution.ts         run.wrapUp / cancel / pause / resume / stop
  lloyal-sdk  packages/rig/src/settings-protocol.ts RunCommand = stop | wrap_up | pause | resume | cancel_agent
  lloyal      templates/research/src/harness/brief.ts  the handlers; dev-tools react.tsx sends wrap_up / cancel_agent
  lloyal      templates/basic/src/harness/wiki.ts   Budget { maxTurns, nudge }, NUDGE, EVIDENCE_FIRST, SynthPolicy
  lloyal      templates/research/src/harness/budgets.ts   BUDGETS rows per effort level
-->

Every agent in a pool obeys a **budget**: how many turns it may take, how much of the shared context it may use, how long it may run, and what happens to it if it is stopped before it reports. You give those numbers as one row of data, and the framework derives the policy that enforces them.

## When to use what {#when-to-use}

| You want to | Use |
|---|---|
| Set limits — turns, context, time — and what an agent is told when it hits one | A **`budget`** row on `agentPool` or `useAgent` |
| Add a rule at one moment of a tool call — refuse a call, retry a failure, refuse an early report | **`hooks`** — see [Tool hooks and guards](/tool-hooks) |
| Change a decision the numbers cannot express — "stop only for room, never for time" | A **policy of your own**, extending `DefaultAgentPolicy` |

Start with a budget. Most harnesses never need more.

## Quickstart {#quickstart}

```ts label="src/harness/wiki.ts"
import { agentPool } from "@lloyal-labs/lloyal-agents";
import type { Budget, NudgeInput } from "@lloyal-labs/lloyal-agents";

/** What an agent is told when it must wind up. The framework supplies `reason` and `words`; the sentence is yours. */
const NUDGE = ({ reason, words }: NudgeInput): string =>
  reason === "result" ? `Tool result too large for the remaining context. Report your findings now within ${words} words.`
  : `Report your findings now within ${words} words.`;

const budget: Budget = {
  maxTurns: 8,
  context: { softLimit: 2048, hardLimit: 1024 },
  time: { softLimit: 90_000, hardLimit: 150_000 },
  nudge: NUDGE,
};

const pool = yield* agentPool({ tools, parent: spine, terminal: citedReport.tool, budget, orchestrate });
```

`useAgent({ budget, … })` takes the same row for a single agent.

## What a budget row holds {#the-budget-row}

Every field is optional; the framework's default stands where the row is silent.

| Field | What it decides | Default |
|---|---|---|
| `maxTurns` | Tool-use turns before the hard cut | 100 |
| `context` | `softLimit`: tokens remaining at which agents are nudged to report and new work stops. `hardLimit`: the floor at which an agent must stop — at least 512, the decode batch, or the pool refuses to start | 1024 / 512 |
| `time` | The same two limits in milliseconds since the agent started | none |
| `nudge` | The words an agent is told when it must wind up, given `{ reason, terminal, words }`. **Without it nothing is said**: an agent over budget goes idle, and a result that will not fit is dropped | none |
| `recovery` | For an agent stopped before it reported: `prompt` (its words, given the report's word budget), and the floors `minTokens` (100) and `minToolCalls` (2) below which it is not worth asking | pruned |
| `recoveryShape` | `"staggered"` recovers one agent at a time, each with all the room freed so far; `"parallel"` recovers them together inside the loop, each capped | `"staggered"` |
| `recoveryBudget` | The token cap for a recovery report, and for a voluntary report in flight | adaptive |
| `shouldExplore` | When retrieval tightens from explore to exploit: `context` (fraction of context still free) and `time` (fraction of the time limit used) | 0.4 / 0.5 |
| `maxToolRetries` | Retries of a transient tool failure before the call fails | 1 |

The framework speaks no words of its own to the model: the nudge and the recovery prompt are always yours. A row may also carry numbers of your own beside these — the research template keeps `maxTasks` in the same row.

::: owns
The soft and hard limits are not a weaker and a stronger version of one cutoff. **Soft** stops new work and asks agents to report. **Hard** is the floor below which an agent may not decode another token — and recovery is budgeted from the space above it, so raising `softLimit` nudges earlier but never shortens a recovery report. [Adaptive compute](/agent-policy-and-context-pressure#the-two-limits-are-not-symmetric) is the whole account.
:::

## Keep a table of rows {#keep-a-table}

A harness with several kinds of agent keeps its rows in one table and hands the right one to each pool. The research template keeps one per effort level, plus one per stage:

```ts label="src/harness/budgets.ts"
export const BUDGETS = {
  effort: {
    high: {
      maxTasks: 6, maxTurns: 10,
      context: { softLimit: 2048, hardLimit: 1024 },
      time: { softLimit: 240_000, hardLimit: 360_000 },
      shouldExplore: { context: 0.4 },
      recoveryShape: "staggered",   // serial, full-headroom, lossless
    },
    low: {
      maxTasks: 2, maxTurns: 10,
      context: { softLimit: 10240, hardLimit: 8192 },
      time: { softLimit: 90_000, hardLimit: 150_000 },
      shouldExplore: { context: 1.0 }, // always exploit: strict on-topic retrieval from the first turn
      recoveryShape: "parallel",
    },
  },
  /** The settling pass: a turn cap and nothing else, so it writes for as long as the answer needs. */
  settle: { maxTurns: 10 },
} as const;
```

## Accept prose as a result {#accept-prose}

An agent with tools normally finishes by calling its terminal tool; prose before any tool call is an idle stop, which keeps an agent from answering without evidence. An agent whose prose **is** its result — a settling pass, a passthrough answer — says so:

```ts label="TypeScript"
const agent = yield* useAgent({ parent: spine, ...prompt, budget: BUDGETS.settle, acceptFreeText: true });
```

## Write a policy of your own {#custom-policy}

When a decision cannot be written as numbers, extend `DefaultAgentPolicy` and override that one decision. Hand the policy to the pool **in place of** the row: with `policy`, the pool takes no `budget` or `guards`, and `hooks` and `acceptFreeText` go to the policy's constructor instead of the pool.

```ts label="TypeScript"
import { DefaultAgentPolicy } from "@lloyal-labs/lloyal-agents";
import type { Agent, ContextPressure } from "@lloyal-labs/lloyal-agents";

class Patient extends DefaultAgentPolicy {
  shouldExit(agent: Agent, pressure: ContextPressure): boolean {
    // Only ever for room, never for time.
    return pressure.critical && super.shouldExit(agent, pressure);
  }
}

const pool = yield* agentPool({ /* … */ policy: new Patient() });
```

The decisions a policy makes, and when the pool asks:

| Method | Asked | It answers |
|---|---|---|
| `onProduced(agent, parsed, pressure, config)` | The model stopped, after the gates admitted any call | Dispatch the call, return the result, nudge, or go idle |
| `shouldExplore(agent, pressure)` | Before a tool that admits content runs | Score results against the agent's own query (explore), or against the original question too (exploit) |
| `shouldExit(agent, pressure)` | Before the agent produces another token | Stop it now; its branch stays for recovery |
| `onRecovery(agent, pressure, budget?)` | An agent was stopped without a result | `extract` with a prompt, or `skip` |
| `recoveryShape`, `recoveryBudget`, `pressureThresholds` | Once, when the pool starts | The shape and cap of recovery; the soft and hard limits |
| `hooks`, `guardOverrides` | At every moment of a tool call | See [Tool hooks and guards](/tool-hooks) |

`DefaultAgentPolicy` takes the same options a budget row derives — `budget.context`, `budget.time`, `nudge`, `recovery`, `recoveryShape`, `recoveryBudget`, `shouldExplore`, `maxToolRetries`, `acceptFreeText`, `hooks`, `guardOverrides` — so `super` keeps every default you did not override.

::: owns
A policy returns **decisions**; the pool carries them out. A policy hook must not decode, prune a branch, run a tool or start asynchronous work: that is a second scheduler, and the pool already has one. Work that needs to wait belongs in an orchestrator, a tool or a source.
:::

## End work early {#end-work-early}

A reader's "Wrap up" is not the same event as a closed window. The platform already gives every pool the signals for each; your harness only needs to accept the commands and pass them to `run`, the execution from `useExecution()`:

| To | Command | Handler | What happens |
|---|---|---|---|
| Wrap up and keep what the agents have | `wrap_up` | `run.wrapUp()` | No new agents; tool calls in flight finish and settle; every agent is recovered into a report. A tool parked on a rate-limit retry is abandoned with an honest failure. |
| Drop one line of work | `cancel_agent` | `run.cancel(agentId)` | That agent's tool call is aborted, it ends with `user_cancel` and **no** recovery, and its branch is pruned so its siblings get the room |
| Pause, then resume | `pause`, `resume` | `run.pause()`, `run.resume()` | Decoding holds at the next tick; branches stay resident; paused time does not count against time budgets |
| Stop everything | `stop` | `run.stop()` | Everything the run started unwinds, with nothing recovered |

The basic template accepts only `stop`. To add the rest, widen its `Command` to the whole of rig's `RunCommand` and add the handlers, as the research template does:

```ts label="src/protocol.ts"
import type { RunCommand } from "@lloyal-labs/rig";

export type Command =
  | { type: "submit_query"; query: string }
  | { type: "open_doc"; docId: DocId | null }
  | RunCommand
  | { type: "quit" };
```

```ts label="src/harness/article.ts"
handlers: {
  // …
  *wrap_up() { run.wrapUp(); },
  *pause() { run.pause(); },
  *resume() { run.resume(); },
  *cancel_agent({ agentId }) { run.cancel(agentId); },
},
```

The dev pane (`LLOYAL_DEV=1`) already has a Wrap up button and a cancel on every agent's lane, and sends these commands.

## Common mistakes {#common-mistakes}

- **Treating the soft limit as a kill line.** It is the new-work and nudge boundary; recovery may use the reserve down to the hard limit.
- **Raising the soft limit to get longer recovery reports.** It nudges earlier; recovery stays bounded by the hard-limit reserve.
- **Leaving out `nudge` and expecting agents to be told to report.** Without it the framework says nothing: an over-budget agent goes idle.
- **Conflating exploit with exit.** `shouldExplore() === false` narrows retrieval; it does not end the agent.
- **Using a halt for "wrap up".** A halt removes the owner. Use `wrap_up` (`run.wrapUp()`) when the reader wants the best available result.

## Tuning by workload {#tuning-by-workload}

### Interactive assistant {#interactive-assistant}

Prefer:

-   fewer Agents;
-   earlier exploit;
-   tighter time limits;
-   parallel recovery;
-   modest report budgets;
-   low retry count.

### Broad research {#broad-research}

Prefer:

-   exploration while context is healthy;
-   enough soft reserve for synthesis;
-   `pruneOnReturn`;
-   terminal Tool contracts;
-   parallel recovery for lower effort levels.

### Deep research {#deep-research}

Prefer:

-   dynamic orchestration;
-   larger context;
-   later exploit thresholds;
-   staggered recovery;
-   generous hard time;
-   explicit downstream synthesis reserve.

### Casework {#casework}

Prefer:

-   policy guards for institutional rules;
-   domain-specific exit conditions;
-   recoverable intermediate findings;
-   protected action Tools;
-   grants and audit events;
-   procedural orchestration.

Policy should reflect the product’s meaning of **done**.

## Rules for coding agents {#rules-for-coding-agents}

```md label="Markdown"
## Lloyal AgentPolicy invariants

- AgentPolicy is a synchronous decision strategy, not a scheduler.
- BranchStore accounts, ContextPressure observes, policy decides, and
  AgentPool enforces.
- Do not mutate branches, prune KV, or call native decode from a policy hook.
- Treat ContextPressure as an immutable decision-boundary snapshot.
- `softLimit` is the new-work and nudge boundary.
- `hardLimit` is the mechanical decode floor and recovery boundary.
- Recovery budgets from `remaining - hardLimit`, not only from `headroom`.
- `shouldExplore` changes retrieval strategy; it does not terminate an Agent.
- `shouldExit` stops an Agent but leaves its branch available for recovery.
- `onRecovery` chooses extract or skip; AgentPool enforces grammar and budget.
- `beforeAdmit` is asked only at the stall-break, after ordinary deferral cannot resolve.
- Wind-down, per-Agent cancellation, and Effection scope halt are different.
- Prefer configuring or extending `DefaultAgentPolicy` over replacing it.
```

## Related {#related}

- [Adaptive compute](/agent-policy-and-context-pressure) — how pressure, limits, recovery and pruning work together.
- [Tool hooks and guards](/tool-hooks) — the five moments of a tool call.
