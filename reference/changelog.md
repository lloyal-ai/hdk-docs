---
title: "Changelog"
description: "Public-API renames and removals. Append-only — when a name changes in @lloyal-labs/* it lands here so docs and downstream code don't accumulate stale references silently."
---

This page tracks renames, removals, and notable shape changes in the public API surface of `@lloyal-labs/lloyal-agents`, `@lloyal-labs/sdk`, and `@lloyal-labs/rig`. New entries are appended at the top.

## v0.2

- **`spawnAgents()` removed.** Pool orchestration moved to a callback interface. Use `agentPool({ orchestrate: ... })` or `useAgentPool({ orchestrate: ... })` instead. The `orchestrate` argument accepts an `Orchestrator = (ctx: PoolContext) => Operation<void>` — typically one of the built-in combinators (`parallel`, `chain`, `fanout`, `dag`, `dagWithEvents`).
- **`PoolContext` introduced** as the orchestrator-facing API: `root`, `spawn()`, `waitFor()`, `extendRoot()`, `canFit()`. Custom orchestrators are now ~10–30 line implementations of the `Orchestrator` shape.

## v0.1

- **`Source` decoupled from orchestration.** Sources now expose data-access tools and chunks (`tools`, `bind`, `getChunks`); the harness drives orchestration via `agentPool()`. A source no longer owns prompts, recursion shape, or policy.
- **`Agent` stabilized as first-class API.** Internal `AgentState` shape is no longer exported; introspect via the `Agent` class (`status`, `result`, `branch`, `traceBuffer`, `currentTool`).
- **`useAgent` / `useAgentPool` introduced** as the dual resource layers; `agent()` is a convenience alias for `useAgent()` with N=1.

## How to use this page

When you see a name in older code or docs that doesn't appear in `@lloyal-labs/*/src/index.ts`, check here first. If it's not listed, the name is either current or was renamed before this changelog began — open an issue.

For the canonical export list, see the package README or generated typedoc. This page is curated, not exhaustive: it focuses on names that downstream code likely references.
