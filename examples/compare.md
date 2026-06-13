---
title: "Compare"
description: "A 6-node DAG harness — multi-parent dependencies. The smallest example that genuinely needs `dag()` over `chain` or `fanout`."
---

> **See also.** [Pipelines](/build-a-harness/orchestrators) explains the orchestrator spectrum (parallel / chain / fanout / dag / reduce). The **Fork it** section below walks through reshaping this harness.

<Note>
Compare is a **pre-AgentApp-protocol mechanism primer** — it wires sources and a shared catalog inline rather than via `defineApp` + the registry. The DAG mechanics on this page port directly into a 3.0 AgentApp-protocol harness; the source-and-tool plumbing is what changes. For the production reference that uses the AgentApp protocol, see [reasoning.run](https://github.com/lloyal-ai/reasoning.run) and the [Build an AgentApp](/build-an-app/what-is-an-app) track.
</Note>

A 6-node DAG that researches two subjects on different sources, compares them across three axes simultaneously, and synthesizes the result. The smallest topology that genuinely needs `dag()` instead of `chain` or `fanout` — three sibling nodes each depend on **both** research roots, and the synthesizer depends on all three siblings.

```
  research_web_X ──┐                          ┌──▶ compare_axis_1 ──┐
  (WebSource)      │                          │                     │
                   ├──────────────────────────┼──▶ compare_axis_2 ──┼──▶ synthesize
  research_corp_Y ─┘                          │                     │
  (CorpusSource)                              └──▶ compare_axis_3 ──┘

       roots                       fan-in / fan-out                  sink
   (parallel, no deps)          (3 siblings sharing deps)
```

**Source**: `examples/compare/`

## Prerequisites

- A GGUF instruction-tuned model with native tool calling
- A GGUF reranker model
- A directory of text/markdown files for the corpus side
- A Tavily API key for the web side (free tier at [tavily.com](https://tavily.com))

## Run it

```bash
export TAVILY_API_KEY=tvly-…

npx tsx examples/compare/main.ts \
  --x "Rust's ownership model" \
  --y "Swift's automatic reference counting" \
  --corpus ~/Documents/swift-docs \
  --reranker ~/.cache/lloyal/models/Qwen3-Reranker-0.6B-Q8_0.gguf \
  --axes "memory safety,runtime cost,ergonomics" \
  ~/.cache/lloyal/models/Qwen3.5-4B-Q4_K_M.gguf
```

Or via the workspace script: `npm run examples:compare -- --x "…" --y "…" …`

Required flags: `--x`, `--y`, `--corpus`, `--reranker`, `TAVILY_API_KEY`. Optional: `--axes` (default `accuracy,performance,complexity` — must be exactly three), `--max-turns`, `--n-ctx`, `--output-dir`, `--jsonl`.

## What it teaches

- **Multi-parent DAG dependencies** — each `compare_axis_*` node depends on **two** research nodes simultaneously. `chain` and `fanout` cannot express this.
- **Sibling parallelism with shared deps** — the three compare nodes fire the moment both research nodes complete, then run concurrently.
- **Multi-child convergence** — `synthesize` waits on all three siblings before spawning.
- **Spine extension is causal, not just sequential** — each node's `userContent` is prefilled onto the spine via `ctx.extendSpine`. The compare nodes don't merely *follow* the research nodes — they *attend to* them. The edge in the diagram is the spine.
- **Shared catalog, mixed roles** — researcher, comparer, synthesizer all draw from one tool catalog amortized at the root. Per-spec system prompts say which subset to use. (Under the AgentApp protocol, this collapses into per-AgentApp `skill.eta` — see [What is an AgentApp](/build-an-app/what-is-an-app#skill).)

## Code walkthrough

### `harness.ts` — DAG topology

The 6 nodes are declared as a flat array of `DAGNode`. Dependencies are explicit `dependsOn` strings:

```typescript
const nodes: DAGNode[] = [
  {
    id: "research_web_X",
    task: { content: `Research subject: ${x}`, systemPrompt: renderTemplate(RESEARCH_WEB, ...), seed: 1001 },
    userContent: `Research findings on ${x}:`,
  },
  {
    id: "research_corp_Y",
    task: { content: `Research subject: ${y}`, systemPrompt: renderTemplate(RESEARCH_CORPUS, ...), seed: 1002 },
    userContent: `Research findings on ${y}:`,
  },
  ...axes.map<DAGNode>((axis, i) => ({
    id: `compare_axis_${i + 1}`,
    dependsOn: ["research_web_X", "research_corp_Y"],   // ← multi-parent edge
    task: { content: `Compare ${x} vs ${y} on: ${axis}`, systemPrompt: renderTemplate(COMPARE, { x, y, axis }), seed: 2000 + i },
    userContent: `Comparison along axis "${axis}":`,
  })),
  {
    id: "synthesize",
    dependsOn: ["compare_axis_1", "compare_axis_2", "compare_axis_3"],
    task: { content: `Write the final compare-and-contrast report on ${x} vs ${y}.`, systemPrompt: renderTemplate(SYNTHESIZE, ...), seed: 3000 },
  },
];
```

Each `userContent` field is the curated turn that gets prefilled onto the spine when the node completes. Dependent nodes attend over those prefills as if they were prior conversation turns — the model sees `Research findings on X: <agent's report>` in its KV at the position where the edge fires.

### Pool setup — shared catalog at querySpine

The shared catalog (system prompt + tool schemas) is amortized at the harness's `querySpine` once. All six agents fork from there and inherit it via prefix-share:

```typescript
const pool = yield* withSpine(
  {
    parent: session.trunk ?? undefined,
    systemPrompt: SHARED_CATALOG,         // ← catalog at root
    tools,                                // ← tool schemas at root
  },
  function* (querySpine) {
    return yield* agentPool({
      orchestrate: dagWithEvents(nodes, emit),
      tools,
      parent: querySpine,
      terminal: reportTool,
      maxTurns,
      pruneOnReturn: true,
      scorer: primaryScorer,
      trace,
    });
  },
);
```

Per-spec system prompts inside the eta templates select which tool subset that role should use — the model still sees the full catalog at the spine but is steered by its role prompt. Under the AgentApp protocol, this convention moves up a level: the shared catalog becomes the registered AgentApps' catalogs, and per-spec prompts collapse to "use AgentApp X". See [What is an AgentApp](/build-an-app/what-is-an-app).

### `dagWithEvents` — orchestrator with TUI hooks

The example inlines a custom orchestrator that mirrors the framework's `dag()` (after the Task-as-Future refactor) but emits per-node lifecycle events so the Ink TUI can map agent ids back to DAG node ids:

```typescript
function dagWithEvents(nodes: DAGNode[], emit: (ev: DagEvent) => void): Orchestrator {
  return function* (ctx) {
    emit({ type: 'dag:topology', nodes: nodes.map(...) });

    const tasks = new Map<string, Task<void>>();

    function* runNode(n: DAGNode): Operation<void> {
      // Each declared dep awaited as a Task<T> — Task extends Future extends Operation,
      // so awaiting another task IS the cross-task rendezvous primitive.
      for (const depId of n.dependsOn ?? []) {
        yield* tasks.get(depId)!;
      }
      const agent = yield* ctx.spawn({ ...n.task, parent: n.task.parent ?? ctx.root });
      emit({ type: 'dag:node:spawn', id: n.id, agentId: agent.id });
      yield* ctx.waitFor(agent);
      if (agent.result && n.userContent) {
        yield* ctx.extendSpine(n.userContent, agent.result);   // ← spine extension
      }
    }

    for (const n of nodes) tasks.set(n.id, yield* spawn(() => runNode(n)));
    for (const t of tasks.values()) yield* t;
  };
}
```

A 25-line illustration of the canonical Effection DAG pattern: each node runs as a child Task; "A depends on B" becomes `yield* tasks.get(B)!` inside A's body. No mutable Sets. No race window. Failure in any node halts the rest via structured concurrency. For the framework's stock `dag()` orchestrator (without the event hooks), see [Concurrency — DAG](/under-the-hood/concurrency#dag).

### `prompts/`

The pre-AgentApp-protocol source ships these eta templates verbatim:

- `playbooks.eta` — the shared-catalog body rendered onto `querySpine`. (This is the pre-3.0 name for what would now be a registered AgentApp's catalog block.)
- `research-web.eta`, `research-corpus.eta` — per-role researcher prompts.
- `compare.eta` — per-axis comparison prompt.
- `synthesize.eta` — final synthesis prompt.

### TUI

`tui/` mounts an Ink renderer in TTY mode. Cards are laid out in topological layers connected by orthogonal box-drawing edges; pending cards show a dotted background; active cards stream tokens live; completed cards collapse to a one-line summary.

```
╭ DAG · Rust ownership vs Swift ARC · 0:32 ─────────────────────────╮
│ 1840 tok · 18 tools                                               │
╰───────────────────────────────────────────────────────────────────╯

[research_web_X]  ──┐
  searching…       │     [compare_axis_1] memory safety
                   ├───→ comparing…
[research_corp_Y] ─┘     [compare_axis_2] runtime cost
  reading…               [compare_axis_3] ergonomics
                              │
                              ↓
                         [synthesize] (pending)
```

In non-TTY mode (`--jsonl` or piped output), it falls back to one-line stderr events and a plain stdout final answer for scripting.

## Fork it

The fastest path to your own DAG harness is reshaping this one:

```bash
cp -r examples/compare/ examples/my-harness/
```

| File | Purpose |
|---|---|
| `harness.ts` | DAG topology, orchestrator, pool setup |
| `main.ts` | CLI entry, model loading, source wiring |
| `prompts/*.eta` | Per-role system prompts |
| `tui/` | Ink TUI (optional — delete it and the `emitDagEvent` plumbing if you don't need a renderer) |

**Reshape the topology.** Add a node: append an entry, list its `dependsOn`. Remove one: delete it and drop its id from downstream `dependsOn` lists. Reshape edges: change `dependsOn` — the orchestrator handles any acyclic topology you declare (the framework's `dag()` validates and rejects cycles). `userContent` controls what flows downstream onto the spine; omit it for nodes whose results shouldn't become conversation history. Simple knobs: `--axes "a,b,c"` changes the comparison axes; growing the axes array (plus `synthesize`'s `dependsOn`) scales the sibling fan-out arbitrarily.

**Add a stage.** A fact-check pass between `compare_axis_*` and `synthesize`:

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
{ id: "synthesize", dependsOn: ["factcheck_axis_1", "factcheck_axis_2", "factcheck_axis_3"], task: { /* ... */ } },
```

Add a `FACTCHECK` template under `prompts/`; if the new role needs extra tools, include them in the harness's `tools` array.

**Swap to AgentApps.** Production harnesses wire sources via the registry instead of inline construction — uniform across `lloyal/web`, `lloyal/corpus`, or anything you build with `harness.dev app`:

```typescript
yield* RerankerCtx.set(reranker);
const configStore = createInMemoryConfigStore();
if (corpusDir) yield* configStore.set("corpus", { corpusPath: corpusDir });
if (process.env.TAVILY_API_KEY) yield* configStore.set("web", { tavilyKey: process.env.TAVILY_API_KEY });

const registry = yield* createAppRegistry({ configStore });
if (corpusDir) yield* registry.enable(createCorpusApp);
yield* registry.enable(createWebApp);

const tools = registry.enabled().flatMap((app) => [...app.tools]);
```

Installed AgentApps (`harness.dev install <publisher>/<name>`) register the same way, and the per-role prompts collapse into each AgentApp's `skill.eta` — see [Lifecycle & registry](/build-an-app/lifecycle-and-registry).

**Pick the orchestrator for the shape.** If your pipeline isn't a DAG: `chain(items, toStep)` for sequential stages with spine extension, `parallel(specs)` for independent agents, `fanout(landscape, domains)` for a survey pass that informs N domain agents. Replace `dagWithEvents` with the stock `dag(nodes)` if you don't need the TUI hooks.

**Tune budget and recovery on the policy.** Research-style nodes (broad, long-running) get a policy with budgets + recovery; report-only nodes use the default:

```typescript
const policy = new DefaultAgentPolicy({
  budget: {
    context: { softLimit: 2048 },                     // nudge with 2k cells left
    time: { softLimit: 480_000, hardLimit: 600_000 }, // nudge at 8 min, kill at 10
  },
  recovery: { prompt: REPORT },
});
```

Higher `softLimit` nudges agents earlier and preserves KV for downstream stages; lower lets them run longer at the risk of starving the sink node. [Pressure & policy](/under-the-hood/kv-pressure) is the reference.

**Make it multi-turn.** Wire `session.commitTurn(query, answer)` after the pool — tomorrow's query forks from `session.trunk` and reads today's Q&A through attention ([Sessions](/build-a-harness/sessions)).

## Related pages

- [Continuous Context](/under-the-hood/continuous-context-spine) — what `extendSpine` writes and how forks attend to it
- [Concurrency](/under-the-hood/concurrency) — `dag()` orchestrator and the Task-as-Future pattern
- [What is an AgentApp](/build-an-app/what-is-an-app) — how the catalog + skill convention works under the 3.0 AgentApp protocol
