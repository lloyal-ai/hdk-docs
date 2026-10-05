---
title: "Agents and orchestration"
description: "Run one agent or many over the one resident model: withSpine for a shared line of attention, agentPool with parallel, chain, fanout or dag — or your own orchestrator — and how to read what each agent found."
lede: "Decide which agents exist and how their work relates. The pool runs them together over one model."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/agents/src/orchestrators.ts  SpawnSpec (content, systemPrompt, seed, parent, key), PoolContext (spawn, waitFor,
                                                    extendSpine, canFit), parallel (+afterDone), chain (ChainStep), fanout, dag (DAGNode)
  lloyal-sdk  packages/agents/src/create-agent-pool.ts  agentPool options (capacity, maxTurns, pruneOnReturn, parent, session, …)
  lloyal-sdk  packages/agents/src/types.ts          AgentPoolResult (outcomes, byKey, agents, failure, totals), SpawnOutcome
  lloyal-sdk  packages/agents/src/use-agent.ts      useAgent (held open), agent (scoped)
  lloyal-sdk  packages/agents/src/spine.ts          withSpine: cold (no parent) / warm (fork from parent); pruned when the body ends
  scaffold    src/harness/wiki.ts, classify.ts      the shapes in use
-->

An agent in Lloyal is a **branch** of the model's live state with a task, a budget and a way to finish — not a request to an endpoint. Every agent forks from state the model has already read, and the pool advances all of them together, one batched step at a time, over the one resident model.

## When to use what {#when-to-use}

| You want | Use |
|---|---|
| One agent: plan, classify, write the answer | `agent({...})` — or `useAgent({...})` when later work must fork from it |
| Several agents at once, over shared context | `agentPool({ orchestrate: parallel(...) })` |
| Each step to build on the last | `orchestrate: chain(...)` |
| One survey, then independent follow-ups | `orchestrate: fanout(...)` |
| Steps with dependencies | `orchestrate: dag(...)` |
| Several pools that share one header — tools, instructions, evidence | `withSpine(...)` around them |
| An agent that recruits specialists mid-task | A tool that starts a pool from the caller's branch — see [Tools](/tools#tool-context) |

## Quickstart {#quickstart}

```ts label="src/harness/wiki.ts"
import { agentPool, parallel, withSpine } from "@lloyal-labs/lloyal-agents";
import { citedReport, renderSpine, taskKey } from "@lloyal-labs/rig";

return yield* withSpine(
  { parent: trunk ?? undefined, systemPrompt: renderSpine({ abilities }), tools },
  function* (spine) {
    const pool = yield* agentPool({
      tools,
      parent: spine,
      terminal: citedReport.tool,
      budget: { maxTurns: 8 },
      orchestrate: parallel(
        ANGLES.map((angle, i) => ({
          key: taskKey(i),
          content: `${query}\n\nFocus: ${angle}`,
          systemPrompt: agentPreamble(abilities[0], i),
          seed: 1000 + i,
        })),
      ),
    });
    return ANGLES.map((_, i) => citedReport.read(pool.byKey(taskKey(i)) ?? { result: null }) ?? "");
  },
);
```

`withSpine` decodes the shared header — the tools, the abilities' instructions — **once**; every agent forks from it instead of reading it again. The pool starts one agent per angle, and returns when they have all finished.

::: owns
The spine, and every agent forked from it, belong to the `withSpine` callback: when it returns, throws or is stopped, they are released. Only **data** should leave — strings, parsed values. Returning the spine or an agent's branch hands out something that is about to be pruned.
:::

## Choose a shape {#orchestrators}

| Orchestrator | Takes | Runs |
|---|---|---|
| `parallel(specs, { afterDone? })` | One `SpawnSpec` per agent | All at once, siblings off the spine. A wide list runs in waves as seats free. `afterDone(i, outcome)` fires as each settles. |
| `chain(items, toStep)` | `toStep(item, i)` → `{ task, userContent?, beforeSpawn?, afterExtend? }` | One after another. A step's finding extends the spine under `userContent`, so the next forks from what it found. |
| `fanout(landscape, domains)` | One `ChainStep`, then `SpawnSpec[]` | The landscape first (extending the spine), then every domain in parallel from there. Domains do not see each other. |
| `dag(nodes)` | `{ id, task, dependsOn?, userContent? }[]` | Each node when its dependencies have finished and extended the spine; independent nodes in parallel. |

A `SpawnSpec` is `{ content, systemPrompt, seed?, parent?, key? }`: the task, the agent's system prompt, a sampler seed for diversity, a branch to fork from other than the spine, and a label to read the result back by.

```ts label="A dag"
orchestrate: dag([
  { id: "facts", task: { content: `${q}\n\nEstablish the facts.`, systemPrompt: WORKER }, userContent: "Facts" },
  { id: "dispute", task: { content: `${q}\n\nWhere do sources disagree?`, systemPrompt: WORKER } },
  { id: "verdict", dependsOn: ["facts", "dispute"], task: { content: `${q}\n\nWeigh it.`, systemPrompt: WORKER } },
]),
```

## Write your own orchestrator {#custom}

An orchestrator is just a generator over the pool's context. JavaScript control flow is the orchestration language:

```ts label="TypeScript"
import type { Orchestrator } from "@lloyal-labs/lloyal-agents";

const untilSettled = (questions: string[]): Orchestrator => function* (ctx) {
  for (const q of questions) {
    if (!ctx.canFit(600)) break;                                   // stop opening work when the room is short
    const agent = yield* ctx.waitFor(yield* ctx.spawn({ content: q, systemPrompt: WORKER }));
    if (agent.result) yield* ctx.extendSpine(`Question: ${q}`, agent.result);
  }
};
```

| `ctx.` | Does |
|---|---|
| `spawn(spec)` | Requests an agent. It is seated when there is room — context, a free sequence, `capacity` — which may be several ticks later. Throws `SpawnRefused` when it can never be seated. |
| `waitFor(agent)` | Waits until it has finished, and returns the final agent |
| `extendSpine(user, assistant)` | Writes a turn onto the spine, so agents started after it inherit it |
| `canFit(tokens)` | Whether another agent of that size would fit under the current pressure |

## Read the results {#results}

`agentPool` returns when every agent has finished:

| Field | Holds |
|---|---|
| `outcomes` | One per spawn, in spawn order: `{ key?, agentId, result, exitReason?, failed }` |
| `byKey(key)` | The outcome of the spawn that carried `key` — use it rather than position, since agents finish in any order |
| `agents` | Per-agent detail, including any replacement for an agent that was restarted |
| `failure` | What ended the pool early, or `null` |
| `totalTokens`, `totalToolCalls` | Totals, for display |

An outcome's `failed` says why an agent ended without a result — refused a seat, or its own failure — so one agent's failure never ends its siblings.

## One agent {#one-agent}

```ts label="TypeScript"
import { agent, useAgent } from "@lloyal-labs/lloyal-agents";

const planner = yield* agent({ systemPrompt: PLAN, content: query, terminal: plan.tool });   // runs, finishes, released
const settle = yield* useAgent({ parent: spine, ...prompt, acceptFreeText: true });         // held open until the scope ends
```

`agent` runs a single agent in its own scope and returns it finished. `useAgent` keeps its branch alive for the rest of the enclosing scope, so later work can fork from what it read.

## Trunk and spine {#trunk-and-spine}

- The **trunk** (`session.trunk`) is the conversation's memory: what the next question starts from. It changes only where your harness commits a turn.
- A **spine** is a run's shared workspace. It may fork from the trunk (`parent: session.trunk`), so a follow-up's agents start from the conversation so far; it is released when the run ends.

Findings leave a run as data; the trunk takes only what the harness accepts. [Build your first harness](/build-your-first-harness#finality-and-continuity-are-explicit) shows the one place the basic template commits.

## Seats and waves {#capacity}

A pool seats as many agents as the context and its sequences hold. `capacity: n` caps it lower; spawns beyond it wait in order and are seated as others finish, so any shape runs in waves. The pool also frees an agent's branch as soon as it returns (the scaffold's default), so later agents get the room.

## Related {#related}

- [Agent policy](/agent-policy) — the budget every agent obeys.
- [Typed Decisions from LLMs](/typed-decisions) — agents that answer with a value.
- [Thinking in Lloyal](/thinking-in-lloyal) — why agents are branches, and what owns what.
