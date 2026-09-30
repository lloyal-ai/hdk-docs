---
title: "Tool hooks and guards"
description: "Every tool call passes through five moments — may it run, was it an attempt, does the result fit, it is in, may the turn end. A hook is a plain object with an opinion at any of them; a guard refuses a call before it runs."
lede: "Five moments in every tool call, and one rule for who decides at each: the tool, then your harness, then the framework."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/agents/src/Tool.ts    ToolLifecycleHooks (five positions), ToolGuard, GuardInput, Completion,
                                             ExecuteDecision, AdmitDecision, FollowUp, ReturnDecision
  lloyal-sdk  packages/agents/src/hooks.ts   makeFrame (auth_reject first, defaults last), decide* walk order,
                                             guardOverrides never apply to the frame, onReturn reject bound
  lloyal-sdk  packages/agents/src/create-agent-pool.ts   agentPool({ hooks, guards })
  lloyal      templates/basic/src/harness/wiki.ts        EVIDENCE_FIRST
  lloyal      templates/research/src/harness/brief.ts    guards: config().defaults.guards
Replaces the two partial treatments that were on Abilities ("the life of a tool call", four moments) and on
Adaptive compute ("the harness's part of a tool call's life"); `onReturn` is new since both were written.
-->

A tool call passes through five moments on its way from the model's output to the agent's context. At each one the pool asks one question, and anyone with an opinion may answer it: the tool itself, your harness, and the framework. **The first concrete answer wins; `undefined` abstains.**

## The five moments {#the-five-moments}

| Moment | The question | When | Answers | If nobody answers |
|---|---|---|---|---|
| `beforeDispatch` | May this call run? | The model emitted a call, before the policy routes it | A list of **guards**; one whose `reject` returns `true` refuses the call with its message | It runs |
| `afterExecute` | Was that an attempt? | The tool returned or threw | `attempt` · `retry { afterMs }` · `fail { message? }` | A `ToolRetryError` is retried once, then fails; anything else is an attempt |
| `beforeAdmit` | The result does not fit and nothing can free room — shrink it or stop the agent? | Only at a genuine stall | `nudge { message }` · `drop` | `drop` |
| `afterAdmit` | Anything to say next? | The result is on the agent's ledger | `followUp { message }` · `none` | `none` |
| `onReturn` | May the turn end, and what does the result become? | The agent called its terminal tool | `accept { result }` · `reject { message }` | Accept the captured result |

## Who decides, in what order {#who-decides}

```text label="Every moment"
the framework's authorization gate   — first, and never switched off
  ↓
the called tool's own hooks
  ↓
your harness's hooks, in order
  ↓
the framework's defaults             — last, so every call ends with a decision
```

Two rules are deliberately not uniform:

- **Authorization cannot be overridden.** A tool marked `protected` is refused unless the session holds a grant for it (see [Human approval](/human-approval)); that gate runs before every other and no override reaches it. Its refusal reads *"This action is protected and requires authorization that has not been granted for this session."*
- **At `onReturn`, any contributor may reject**, so your floor on evidence stands even when a later contributor would accept. The pool allows one rejected return per agent, and none once the context or the turn cap is exhausted — a second return stands.

## Add a hook to a pool {#add-a-hook}

A hook is a value of type `ToolLifecycleHooks` with an opinion at the moments it cares about. The basic template carries one: an agent may not report before it has read something.

```ts label="src/harness/wiki.ts"
import type { ToolLifecycleHooks } from "@lloyal-labs/lloyal-agents";

export const EVIDENCE_REJECTION = "Search or read a Wikipedia article before reporting.";

const EVIDENCE_FIRST: ToolLifecycleHooks = {
  onReturn: ({ agent }) =>
    agent.toolCallCount < 1 ? { type: "reject", message: EVIDENCE_REJECTION } : undefined,
};

const pool = yield* agentPool({ /* … */ hooks: [EVIDENCE_FIRST] });
```

The first early report is refused and the model reads the message in its place; a second report stands, so an agent that genuinely found nothing can still say so. `toolCallCount` does not count the terminal call itself, so it cannot satisfy its own floor.

## Refuse a call with a guard {#guards}

A guard is three things: a published `name`, a `reject` predicate, and the `message` the model reads in the call's place.

```ts label="TypeScript"
import type { ToolGuard } from "@lloyal-labs/lloyal-agents";

export const urlDedup: ToolGuard = {
  name: "url_dedup",
  reject: ({ args, attended }) => {
    const url = String(args.url ?? "").trim();
    return url !== "" && attended().some((a) => String(a.url ?? "").trim() === url);
  },
  message: "This URL was already attempted in this run. Try a different source.",
};
```

- **`attended()`** is the arguments of this tool's earlier calls whose results the agent actually read — computed only if you ask.
- **Declared on a tool** (`readonly hooks = { beforeDispatch: [urlDedup] }`), a guard gates that tool. **Contributed by a harness** (in `hooks`), it sees every call and selects by `i.tool`.
- **The name is published**: it is the key a harness overrides the guard by, and the value on the trace. Renaming it is a breaking change.

A refusal is booked on the agent as a nudge — the model reads your message as the tool's result and tries something else.

## Widen or switch off a guard {#override-a-guard}

A guard reads `attended()` in the agent's **own lineage** by default: itself and, through the fork, its ancestors. A harness may widen a guard to the **whole cohort**, or switch it off, by name. In `harness.yml`:

```yaml label="harness.yml"
defaults:
  guards:
    # the research template's siblings feed one synthesis: a URL any of them read is not fetched again
    url_dedup: { scope: cohort }
    query_dedup: { scope: cohort }
    # some_guard: false   # switches it off
```

…and hand the value to the pool:

```ts label="src/harness/brief.ts"
const pool = yield* agentPool({ /* … */ guards: config().defaults.guards });
```

Lineage is the default because it is the safe one: isolated rows of a spreadsheet, or a delegated sub-agent whose fork already holds its caller's reads, must not be deduplicated against their siblings. `auth_reject: false` does nothing.

## Retry a transient failure {#retry}

Throw `ToolRetryError(message, retryAfterMs)` from `execute` when a failure is temporary — a rate limit is the usual case:

```ts label="TypeScript"
import { call, useAbortSignal } from "effection";
import { ToolRetryError } from "@lloyal-labs/lloyal-agents";

*execute(args: { q: string }): Operation<unknown> {
  const signal = yield* useAbortSignal();
  const res = yield* call(() => fetch(url(args.q), { signal }));
  if (res.status === 429) throw new ToolRetryError("rate limited", 30_000);
  return yield* call(() => res.json());
}
```

The agent parks — no turns, no tokens, no context spent — and the same call runs again after the delay. The model never sees the wait. After the retry budget (`maxToolRetries` in the budget, default 1), an honest "unavailable" result settles in the tool's place, because at that point the outage is a fact the model needs. An `afterExecute` hook of your own can recognise a transient failure a provider wraps in a success — a 429 inside a 200 — and return `{ type: "retry", afterMs }`.

The throw must come from `execute` itself, never from a scope captured at construction time: that would crash that scope and everything it owns.

## Related {#related}

- [Tools](/tools) — writing the tool itself.
- [Agent policy](/agent-policy) — the budget and the policy the hooks sit beside.
