---
title: "Fork a harness"
description: "Take an existing DAG harness, reshape the topology, swap Apps, and tune budget and recovery."
---

This guide walks through forking a working harness and reshaping it. We'll use the [compare example](/examples/compare) as the worked target because its topology is non-trivial (multi-parent edges, multi-child convergence) but small enough to read end-to-end.

<Note>
Compare is a pre-App-protocol mechanism primer — it predates `defineApp` / registry and assembles its sources and tools inline. For a production-grade harness that wires Apps via the registry, the **reasoning.run** harness is the reference. The patterns in this guide (DAG topology, policy, recovery) port directly; the source-and-tool plumbing is what changes once you adopt the App protocol — see [Lifecycle & registry](/build-an-app/lifecycle-and-registry).
</Note>

## Fork the harness

```bash
cp -r examples/compare/ examples/my-harness/
```

The key files:

| File | Purpose |
|---|---|
| `harness.ts` | DAG topology, orchestrator, pool setup |
| `main.ts` | CLI entry, model loading, source wiring |
| `prompts/*.eta` | Per-role system prompts |
| `tui/` | Ink TUI (optional — drop if you don't need a renderer) |

The harness is **source-agnostic** — sources are loaded in `main.ts` and passed into the harness. The DAG topology is hard-coded in `harness.ts` and easy to reshape.

## Reshape the DAG

The DAG is an array of `DAGNode` objects:

```typescript
const nodes: DAGNode[] = [
  { id: "research_web_X",   task: { ... }, userContent: `Research findings on ${x}:` },
  { id: "research_corp_Y",  task: { ... }, userContent: `Research findings on ${y}:` },
  ...axes.map<DAGNode>((axis, i) => ({
    id: `compare_axis_${i + 1}`,
    dependsOn: ["research_web_X", "research_corp_Y"],
    task: { ... },
    userContent: `Comparison along axis "${axis}":`,
  })),
  { id: "synthesize", dependsOn: ["compare_axis_1", "compare_axis_2", "compare_axis_3"], task: { ... } },
];
```

To customize:

- **Add a node** — append an entry; list dependencies in `dependsOn`. The orchestrator awaits each declared dep before spawning.
- **Remove a node** — delete the entry, drop its id from any downstream `dependsOn` lists.
- **Reshape edges** — change `dependsOn`. The orchestrator handles whatever acyclic topology you declare (cycles aren't checked but will deadlock).

`userContent` controls what gets prefilled onto the spine when the node completes. Omit it if you don't want a node's result to flow downstream as conversation history.

## Add a stage

Suppose you want a fact-check stage between `compare_axis_*` and `synthesize`:

```typescript
...axes.map<DAGNode>((axis, i) => ({
  id: `factcheck_axis_${i + 1}`,
  dependsOn: [`compare_axis_${i + 1}`],
  task: {
    content: `Verify claims in the comparison along axis "${axis}".`,
    systemPrompt: renderTemplate(FACTCHECK, { axis }),
    seed: 4000 + i,
  },
  userContent: `Fact-check on axis "${axis}":`,
})),
{
  id: "synthesize",
  dependsOn: ["factcheck_axis_1", "factcheck_axis_2", "factcheck_axis_3"],   // ← updated
  task: { ... },
},
```

Add a `FACTCHECK` template under `prompts/` and load it like the others. If the new role needs additional tools, include them in the harness's `tools` array.

## Per-role system prompts

Each `DAGNode`'s `task.systemPrompt` is the role assignment for that agent. In compare, per-role prompts live in `prompts/research-web.eta`, `compare.eta`, `synthesize.eta` etc., and each opens by stating which subset of tools is in scope for that role. The agent then forks from a shared spine that holds the full tool catalog, but only uses what its role authorizes.

When you adopt the App protocol, this convention moves up a level: each App ships its own `skill.eta` describing how an agent should use that App's tools, and the per-role prompt collapses into "use App `X`". See [What is an App](/build-an-app/what-is-an-app#skill) for the protocol.

## Swap sources

Sources are configured in `main.ts` and passed as a typed array. Compare's flow is `web + corpus`, but the `Source` contract is uniform — swap in any combination:

```typescript
const sources: Source<SourceContext, Chunk>[] = [];

if (corpusDir) {
  const resources = loadResources(corpusDir);
  const chunks = chunkResources(resources);
  sources.push(new CorpusSource(resources, chunks));
}

if (process.env.TAVILY_API_KEY) {
  sources.push(new WebSource(new TavilyProvider()));
}
// Add custom sources — vector stores, databases, internal APIs. Anything that
// implements Source<TCtx, TChunk> works. See /build-an-app/sources-and-retrieval.
```

If you only want one research lane, drop the corresponding research node from the DAG and remove the `dependsOn` on it from descendants. The orchestrator scales to whatever topology you declare.

## Choose an orchestrator

Compare inlines a custom `dagWithEvents` orchestrator that emits per-node lifecycle events for its Ink TUI. If you don't need a TUI, use the framework's stock `dag()`:

```typescript
import { dag } from "@lloyal-labs/lloyal-agents";

const pool = yield* withSpine({ ... }, function* (querySpine) {
  return yield* agentPool({
    orchestrate: dag(nodes),
    tools,
    parent: querySpine,
    terminal: reportTool,
    maxTurns,
  });
});
```

Other shapes if your pipeline isn't a DAG:

- `chain([spec1, spec2, ...], (spec, i) => { ... })` — sequential stages with `extendSpine` between them
- `parallel([spec1, spec2, ...])` — independent agents on shared KV
- `fanout(landscapeSpec, [domainSpec1, ...])` — landscape pass that informs N parallel domain agents

See [Concurrency](/under-the-hood/concurrency) for the full orchestrator catalog.

## Configure budget and recovery

Context pressure, time limits, and scratchpad recovery are configured on the policy:

```typescript
const policy = new DefaultAgentPolicy({
  budget: {
    context: { softLimit: 2048 },                            // nudge with 2k cells left
    time: { softLimit: 480_000, hardLimit: 600_000 },        // nudge at 8min, kill at 10min
  },
  recovery: { prompt: REPORT },                              // grammar-constrained extraction
});

const pool = yield* agentPool({
  // ...
  policy,
});
```

Higher `softLimit` means agents are nudged earlier, preserving room for downstream stages. Lower `softLimit` lets agents run longer but risks downstream stages running out of KV.

Rule of thumb: research pools (broad investigation, longer running) get a policy with budget + recovery. Reporter or synthesis pools that only need one `report()` call use the default policy.

## Warm vs cold

If your harness is reused across queries (REPL or server), wire `Session.commitTurn` to extend the trunk:

```typescript
const result = yield* handleCompare(session, sources, reranker, opts);
if (result.answer) {
  yield* call(() => session.commitTurn(query, result.answer));
}
```

Tomorrow's query forks from `session.trunk` and reads yesterday's Q&A through KV attention. See [Sessions](/build-a-harness/sessions) for the multi-turn lifecycle.

## Customize the TUI

If you want to keep the Ink TUI but render a different topology, the renderer is parameterized by `dag:topology` and `dag:node:spawn` events emitted by `dagWithEvents`. Adjust the layout in `tui/DagCanvas.tsx` to handle your new node shapes. If you don't need a TUI, delete `tui/` and drop the `emitDagEvent` plumbing from `harness.ts`.

## See also

- [Compare example](/examples/compare) — the worked DAG fork target (pre-App-protocol toy)
- [reasoning.run harness](https://github.com/lloyal-ai/reasoning.run) — the production reference harness on the App protocol
- [Lifecycle & registry](/build-an-app/lifecycle-and-registry) — how Apps register into a harness
- [Concurrency](/under-the-hood/concurrency) — orchestrator catalog and the five-phase tick loop
- [Sources & retrieval](/build-an-app/sources-and-retrieval) — `Source<TCtx, TChunk>` for custom backends
