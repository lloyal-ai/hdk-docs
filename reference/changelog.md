---
title: "Changelog"
description: "Public-API renames and removals. Append-only — when a name changes in @lloyal-labs/* it lands here so docs and downstream code don't accumulate stale references silently."
---

This page tracks renames, removals, and notable shape changes in the public API surface of `@lloyal-labs/lloyal-agents`, `@lloyal-labs/sdk`, and `@lloyal-labs/rig`. New entries are appended at the top.

## v0.4 (2026-05-16)

Agent termination vocabulary renamed from "report" to "return" — framework-internal only. **The model-facing protocol is unchanged**: the model still emits standard `<tool_call>{"name": "report", "arguments": {"result": "..."}}</tool_call>` syntax via the same chat-parser pipeline. The rename touches the framework's *internal* names for what was happening: an agent emitting a terminal value is a *return*, not a *report*. The new vocabulary is domain-neutral (works for code-generation, planning, classification agents — not just research) and matches the function-call execution model the runtime already follows.

Ships in the same npm release as v0.3 (no version bump between the two; both renames consolidate into `@lloyal-labs/lloyal-agents@2.1.0`, `@lloyal-labs/sdk@2.1.0`, `@lloyal-labs/rig@2.1.0`).

### Renames

- **`agent:report` event → `agent:return` event.** Fires only for voluntary completion (the model called the terminal tool). See behavior split below.
- **NEW event `agent:recovered`** (no predecessor — split out from the prior conflated `agent:report`). Fires when recovery extraction salvaged findings from a killed agent.
- **`{ type: 'report' }` policy action → `{ type: 'return' }`.**
- **`{ type: 'free_text_report' }` policy action → `{ type: 'free_text_return' }`.**
- **`handleReport(...)` → `handleReturn(...)`** + **`handleFreeTextReport(...)` → `handleFreeTextReturn(...)`** (framework-internal handlers).
- **`pruneOnReport: boolean` option → `pruneOnReturn: boolean`** (on `AgentPoolOptions`, `CreateAgentPoolOpts`, `useAgent`).
- **`'report_tool'` ResultSource literal → `'voluntary_return'`.**
- **`agent.reportResult(value, source)` setter → `agent.setResult(value, source)`.** "Return" describes the act; "result" stays as the noun for the data.
- **`pool:recoveryReport` trace event → `pool:recoveryReturn`.**
- **`terminalTool: string` option field → `terminalToolName: string`.** It's a name pointer into the toolkit (matched against `parsedToolCall.name`), not a Tool instance. The rename makes the field's semantic explicit.
- **`PolicyConfig.terminalTool` and `DefaultAgentPolicyOpts.terminalTool` → `terminalToolName`.**
- **`DefaultAgentPolicyOpts.minToolCallsBeforeReport` → `minToolCallsBeforeReturn`.**
- **`IdleReason: 'reported'` → `'returned'`.**

### Behavior change: voluntary vs recovery split

Previously `agent:report` fired for BOTH voluntary completion (via `handleReport`) AND recovery extraction (via `recoverInline`). Consumers couldn't tell apart "agent voluntarily produced this value" from "framework salvaged a value from a killed agent."

After the rename:

- **`agent:return`** — fires only when the model voluntarily called the terminal tool and `handleReturn` ran. `ResultSource` = `'voluntary_return'`.
- **`agent:recovered`** — fires only when `recoverInline` extracted findings via grammar-constrained generation after the agent was killed. `ResultSource` = `'scratchpad'`.
- Both still populate `agent.result` and fire `agent:done` for lifecycle.

**Consumer migration:** code that previously listened for `agent:report` to capture any agent's value should subscribe to BOTH `agent:return` and `agent:recovered` (or to `agent:done` and read `agent.result` directly). The lloyal-sdk examples and reasoning.run use case-fall-through (`case 'agent:return': case 'agent:recovered': { ... }`) to preserve the prior union semantics.

### What stayed the same

- **`reportTool` exported from `@lloyal-labs/rig`** — research-domain helper. The harness imports it and assigns `terminalToolName: 'report'`. The string `'report'` as a tool name is the harness's choice; other domains can choose `'submit_code'`, `'plan'`, etc.
- **The model-facing protocol.** The model still sees a tool named whatever the harness chooses (typically `'report'`), still emits standard `<tool_call>...</tool_call>` syntax via llama.cpp's native chat parser. Nothing about generation behavior changes.
- **`agent.result`, `agent.resultSource`** field names — the noun stays; only the act renames.
- **`agent:tool_call` event** — still fires for terminal-tool calls (the model emitted a parsed tool call from its POV; the interception happens at the policy layer, not the event layer).
- **`agent:done`** — lifecycle event, always fires.
- **`'free_text'`, `'scratchpad'`, `'tool_error'`, `'nudge'`** ResultSource literals — unchanged.

### Why

The internal vocabulary echoed the model's tool-call mental model when it should have described what was happening. "Report" carries a domain assumption (research findings); "return" describes the *semantic* (function exit with value) and works for any agent regardless of what it produces. The split between voluntary and recovery makes the framework honest about *how* a value was obtained — both paths produce `agent.result` but only one is the model's own work.

### Spine toolkit unification

- **`SpineOptions.toolsJson: string` → `SpineOptions.tools: Tool[]`.** `withSpine` now accepts the same `Tool[]` shape as `agentPool({ tools })`. Schema decoding (`createToolkit`) happens inside `withSpine`; callers pass tools as tools, not as pre-serialized JSON.

Before:

```typescript
const toolkit = createToolkit(tools);
yield* withSpine(
  { systemPrompt, toolsJson: toolkit.toolsJson },
  function*(spine) {
    return yield* agentPool({ orchestrate, tools, parent: spine, ... });
  },
);
```

After:

```typescript
yield* withSpine(
  { systemPrompt, tools },
  function*(spine) {
    return yield* agentPool({ orchestrate, tools, parent: spine, ... });
  },
);
```

`createToolkit` is still exported for callers who need a pre-built `{ toolMap, toolsJson }` directly (custom dispatchers, sub-toolkits inside delegate tools). The `agentPool({ tools })` field is unchanged — it remains explicit so the reader sees tools at both the prefix-share layer (`withSpine`) and the dispatch layer (`agentPool`).

Why: the prior asymmetry (`toolsJson` on `withSpine`, `tools` on `agentPool`) leaked an implementation detail (the model-facing JSON schema string) into a layer whose job is "give me your tools." Two arguments named `tools` and `toolsJson` invited the question "why pass tools to both?" — the new shape answers it: tools at the spine for schema decoding into shared KV, tools at the pool for runtime dispatch. Same input shape, two consumers.

## v0.3 (2026-05-16)

Pool-anchor API renamed to "spine" terminology. The agents-package internals already used `spine` consistently (`spine:extend` trace event, `extractSpineCheckpoint`, "spine extension" in orchestrator docs); this aligns the public surface with that vocabulary.

- **`withSharedRoot` → `withSpine`.** The function name was misleading on the cold path (no parent, no `systemPrompt` → nothing "shared"). `withSpine` describes what it creates.
- **`SharedRootOptions` → `SpineOptions`.** Body callback signature changes from `(root, sharedPrefixLength)` to `(spine, prefixLength)`.
- **`PoolContext.root` → `PoolContext.spine`** and **`PoolContext.extendRoot` → `PoolContext.extendSpine`.**
- **`AgentPoolOptions.root` → `AgentPoolOptions.spine`.**
- **`RootFmt` (Effection context) → `SpineFmt`.** Context id string `'lloyal.rootFmt'` → `'lloyal.spineFmt'`.
- **Replay primitives:** `extractRootCheckpoint` → `extractSpineSeed`; `BranchCheckpoint.rootPrompt` → `BranchCheckpoint.seedPrompt`. `extractSpineCheckpoint` and `reconstructBranch` keep their names.
- **Trace event role strings:** `role: 'sharedRoot'` → `role: 'spine'`; `role: 'sharedPrefix'` → `role: 'spineHeader'`. The `spine:extend` event type was already correctly named.
- **File rename in the agents package:** `packages/agents/src/shared-root.ts` → `packages/agents/src/spine.ts`.

Why: the SDK's `Branch.create(ctx, 0)` returns a "root branch" in the KV-topology sense (parent === null, position === 0), but the agents-package "root" was something else — the pool's spine anchor, which on the warm path is a fork of the caller's parent and therefore not topologically a root at all. Reserving "root" for the SDK meaning and using "spine" for the pool meaning gives a clean three-noun taxonomy: `Session.trunk` (across-turn line) → pool `spine` (within-pool extensible line) → agent `branch` (per-agent fork).

Old `.jsonl` traces written with `role: 'sharedRoot'` / `'sharedPrefix'` will not round-trip through the renamed replay primitives. Acceptable per the no-backward-compat rule.

## v0.2

- **`spawnAgents()` removed.** Pool orchestration moved to a callback interface. Use `agentPool({ orchestrate: ... })` or `useAgentPool({ orchestrate: ... })` instead. The `orchestrate` argument accepts an `Orchestrator = (ctx: PoolContext) => Operation<void>` — typically one of the built-in combinators (`parallel`, `chain`, `fanout`, `dag`, `dagWithEvents`).
- **`PoolContext` introduced** as the orchestrator-facing API: `spine`, `spawn()`, `waitFor()`, `extendSpine()`, `canFit()`. Custom orchestrators are now ~10–30 line implementations of the `Orchestrator` shape.

## v0.1

- **`Source` decoupled from orchestration.** Sources now expose data-access tools and chunks (`tools`, `bind`, `getChunks`); the harness drives orchestration via `agentPool()`. A source no longer owns prompts, recursion shape, or policy.
- **`Agent` stabilized as first-class API.** Internal `AgentState` shape is no longer exported; introspect via the `Agent` class (`status`, `result`, `branch`, `traceBuffer`, `currentTool`).
- **`useAgent` / `useAgentPool` introduced** as the dual resource layers; `agent()` is a convenience alias for `useAgent()` with N=1.

## How to use this page

When you see a name in older code or docs that doesn't appear in `@lloyal-labs/*/src/index.ts`, check here first. If it's not listed, the name is either current or was renamed before this changelog began — open an issue.

For the canonical export list, see the package README or generated typedoc. This page is curated, not exhaustive: it focuses on names that downstream code likely references.
