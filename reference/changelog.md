---
title: "Changelog"
description: "Public-API renames and removals. Append-only — when a name changes in @lloyal-labs/* it lands here so docs and downstream code don't accumulate stale references silently."
---

This page tracks renames, removals, and notable shape changes in the public API surface of `@lloyal-labs/lloyal-agents`, `@lloyal-labs/sdk`, and `@lloyal-labs/rig`. New entries are appended at the top.

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
