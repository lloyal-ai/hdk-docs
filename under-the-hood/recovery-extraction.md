---
title: "Recovery Extraction"
description: "Salvaging findings from agents killed by KV pressure, in-place on the agent's own branch."
---

When an agent is killed by KV pressure (its tool results overshot the soft limit, its turn budget ran out, or the policy force-cut it), the pool runs **recovery extraction** before the tick loop continues. One agent is sacrificed per critical tick, its findings are extracted, its branch is pruned, and the freed KV lets remaining agents keep researching.

Recovery is **in-place**: no fork. The agent's full KV context (system prompt, tool results, reasoning from prior turns) is already in the cache. An extraction prompt is prefilled directly onto the dying agent's own branch, eager grammar constrains output to `{"result": "..."}`, and a single-agent produce/commit loop generates the report.

## Under the App protocol

Recovery is what makes the reasoning.run **recon stage** work end-to-end:

- Recon agents probe their App's source via short tool sequences; the `ReconPolicy` caps turns hard.
- On force-kill, `recoverInline` runs with a `PREFLIGHT_RECOVER` prompt — the same mechanism documented below, just with a recon-shaped extraction prompt instead of the research one.
- The resulting `agent:recovered` event (split from the pre-v0.4 conflated `agent:report`) is the production trace marker for this path. Recon's joined coverage prose feeds back into the planner via `runPreflight` → `useCoverage` (memoized per query — see [App lifecycle & registry](/build-an-app/lifecycle-and-registry) for the context-scoped cache pattern).

## How it works

Each token of the recovery generation emits an `agent:produce` event (visible in the TUI stream) but is NOT accumulated into `rawOutput` and NOT written as an `agent:turn` trace event.

The grammar-constrained JSON output may contain `<think>` tags and tool-call XML as literal string content inside the `result` field. The harness extracts the `result` value via `JSON.parse` and prefills it into the spine. For cleaner spine content, strip structural markers from the extracted text before prefill.

The parse/finalize lifecycle is also relevant: at normal `isStop`, `agent.finalize(ctx)` runs a strict parse (replacing the standalone `parseChatOutput` call). During recovery, the pool runs its own produce/commit loop outside the normal tick flow — `finalize` is not called for recovery turns.

See [KV Pressure: Recovery extraction](/under-the-hood/kv-pressure#recovery-extraction-trailing-stop) for the full protocol.

Key properties:
- **No fork**: Uses the agent's own branch. Eliminates RESTRICT prune conflicts and redundant KV.
- **Eager grammar**: `setGrammar()` constrains from token 0. No tool calls possible, no model choice.
- **Inline trailing stop**: One agent recovered per critical tick. Remaining agents continue researching with freed KV.
- **Scoped error containment**: Runs inside `scoped()` with try/catch — decode failures tear down the scope cleanly without crashing the pool.
- **Pressure-gated**: Skipped if remaining KV can't fit the extraction prompt.

## Policy configuration

The policy's `onRecovery()` method decides per-agent whether to extract:

```typescript
const policy = new DefaultAgentPolicy({
  recovery: {
    prompt: {
      system: "You are a research reporter. Call the report tool with all findings.",
      user: "Report your findings with direct quotes and evidence.",
    },
    minTokens: 100,    // skip agents with fewer than 100 generated tokens
    minToolCalls: 2,   // skip agents with fewer than 2 tool calls
  },
});
```

The `minTokens` and `minToolCalls` guards prevent extraction from agents with insufficient context — an agent that generated 20 tokens and made 1 tool call would produce hallucinated findings.

## Result provenance

Recovered findings are stored with `resultSource: 'recovery'`. This is metadata only — no downstream code branches on the source. The harness reads `.result` and ignores `.resultSource`. The provenance is visible in trace output for debugging.
