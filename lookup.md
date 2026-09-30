---
title: "Lookup"
description: "Signatures, enumerations, and floors — the facts you look up mid-task. Each entry derived from current source, with the file it came from."
lede: "Signatures, enumerations, and floors — the facts you look up mid-task"
---

It admits a fact only when you would look it up mid-task and could not derive it: a signature, an enumeration, a named constant, a threshold, a floor. Everything explaining *why* stays in the guides; the CLI surface stays in the [lloyal-ai README](https://www.npmjs.com/package/lloyal-ai). Each entry names the file it came from — read that file when the two disagree.

::: pull
Lookup material.  
Not a guide.
:::

### Runtime and hardware {#floors}

**Node 24 or newer**, declared by the CLI and by every scaffolded project. **16 GB of RAM or unified memory** is the working recommendation: the recommended trunk model is 2.6 GB of weights, the `research` template adds a 630 MB reranker, and the remainder covers KV at the recommended 32k context plus the OS and whichever surface is running.

| Model | Role | Size | Context |
| --- | --- | --- | --- |
| `qwen3.5-4b` · Q4\_K\_M | llm | 2.6 GB | 32768 |
| `qwen3-reranker-0.6b-q8` | reranker | 630 MB | — |

packages/rig/src/models.ts

> **Concurrent agents do not multiply this.** They share one context, so cost tracks KV *fullness*, not agent count — four agents is not four times the model.

### Retrieval and scoring {#scoring}

One cross-encoder serves four roles. Three different queries are in play — the per-call tool query, the per-agent task, and the original research query — and conflating them produces wrong scores.

```ts label="TypeScript"
interface EntailmentScorer {
  scoreEntailmentBatch(texts: string[]): Promise<number[]>;
  scoreRelevanceBatch(texts: string[], localQuery: string): Promise<number[]>;
  scoreSimilarityBatch(reference: string, texts: string[]): Promise<number[]>;
  shouldProceed(score: number): boolean;
}

interface ScorerReranker {
  scoreBatch(query: string, texts: string[]): Promise<number[]>;
}
```

| Method | Scores against | Used at |
| --- | --- | --- |
| `scoreEntailmentBatch` | the original query | content prefill boundaries |
| `scoreRelevanceBatch` | `min(local, original)` | exploit mode, when pressure tightens focus |
| `scoreSimilarityBatch` | an arbitrary reference | echo detection at delegation |
| `shouldProceed` | the floor | the gate itself |

The score is a **logit-diff** — `logit(yes) − logit(no)`, unbounded, with the sign carrying the meaning. `Source._entailmentFloor` defaults to **0**: a hit passes when the cross-encoder leans yes. Raise it for noise-heavy corpora, lower it for sparse ones.

The `<Instruct>` sentence is bound at construction, not per call. `createReranker` takes it, and every Ability sharing that instance asks the same question.

| Option | Default | Note |
| --- | --- | --- |
| `instruction` | `RETRIEVAL_INSTRUCTION` | Deep-frozen. Supplying one changes the criterion for every Ability on that reranker. |
| `typeK` / `typeV` | `q8_0` | KV precision bounds the smallest score difference worth treating as real; at `q4_0` close pairs invert. |
| `nSeqMax` | `10` | Parallel scoring slots — the group width of one batched dispatch. |
| `nCtx` | `4096` | `nBatch` derives as `floor(nCtx / nSeqMax)`. |

```ts label="TypeScript"
interface RerankInstruction {
  readonly text: string;
  readonly smokeTest: 'none' | {
    readonly query: string;
    readonly matching: string;
    readonly nonMatching: string;
    readonly minGap: number;
  };
}
```

Three gates run at `create()`. `"yes"` and `"no"` must each tokenise to exactly one token; a rendered probe must confirm the tokenizer did not merge across the prompt’s segment seams; and `matching` must outscore `nonMatching` by more than `minGap`, which must be finite and non-negative. Fixtures longer than the per-leaf document budget are rejected, not truncated. `smokeTest: 'none'` skips the third gate only — the seam probe still runs, against the retrieval fixture.

```ts label="TypeScript"
abstract class Source<TCtx = unknown, TChunk = unknown> {
  abstract readonly name: string;
  abstract get tools(): Tool[];
  protected _reranker: ScorerReranker | null;
  protected _entailmentFloor: number;          // default 0
  createScorer(originalQuery: string): EntailmentScorer;
  promptData(): Record<string, unknown>;
  getChunks(): TChunk[];
}
```

`promptData()` is what the per-spawn skill template reads, so an agent learns what kind of source it holds before it searches.

packages/rig/src/source.ts

### Consent and protected tools {#consent}

The gate for consequential actions runs at DISPATCH, inside the agent runtime — below any application or interface code that could misreport it.

```ts label="TypeScript"
interface GrantStore {
  has(toolName: string): Operation<boolean>;
  grant(toolName: string): Operation<void>;
  revoke(toolName: string): Operation<void>;
}

GrantStoreCtx  // createContext<GrantStore>('lloyal.grantStore')
```

**Fail-closed.** A tool marked `protected` is denied unless the session holds a grant, and no grant store configured means every protected tool is denied. Credentials never enter the model's context — the model can trigger a gated call, never see or replay the secret.

packages/agents/src/grant-store.ts · context.ts

### Trace events {#traces}

Pass a writer to `initAgents` to capture the inference graph as newline-delimited JSON. With none passed, `NullTraceWriter` makes every trace call a no-op at zero cost. Events form a tree through `parentTraceId`; the `TraceParent` context connects inner pools to the tool dispatch that spawned them without manual wiring.

| Event | Captures |
| --- | --- |
| `scope:open` / `close` | named boundaries with duration — pools, tools, spines |
| `prompt:format` | the exact prompt the model saw, and the task before formatting |
| `agent:turn` | raw output, parsed content, parsed tool calls per turn |
| `tool:dispatch` | args, toolkit position, explore flag, pressure |
| `tool:result` / `error` / `retry` | result, prefill token count, duration, transient parking |
| `tool:authReject` | protected-tool denial with full lineage |
| `pool:open` / `close` / `agentDrop` | agent count, pressure snapshot, findings, drop reason |
| `pool:recovery*` | recovery extraction — every attempt ends in exactly one outcome |
| `spine:extend` | orchestrator extensions, delta tokens, position after |
| `branch:create` / `prefill` / `prune` | KV lifecycle with token counts and roles |
| `entailment:*` | scoring decisions at search, delegation, and content boundaries |

packages/agents/src/trace-types.ts — the full event union

### Six failure modes {#failures}

Start from the symptom; the trace answers the rest.

| Symptom | Start from |
| --- | --- |
| Agents not using tools | `tool:dispatch` — is anything dispatched at all? |
| Early termination — reporting too soon | `agent:turn` — what did the model actually emit? |
| Agents killed by pressure | `pool:agentDrop` — the drop reason |
| Recovery extraction fails | `pool:recovery*` — every attempt ends in one outcome |
| Synthesis ignores research findings | `spine:extend` — did the findings reach the spine? |
| Plan produces poor sub-questions | `prompt:format` — the prompt the planner saw |

### Where things live {#imports}

Wrong import paths were the single most common staleness in older material. These are the current homes.

| Symbol | Package |
| --- | --- |
| `withSpine` · `agentPool` · `dag` | `@lloyal-labs/lloyal-agents` |
| `EntailmentScorer` | `@lloyal-labs/lloyal-agents` |
| `Source` · `Reranker` · `Embedder` · `admitChunks` · `service` | `@lloyal-labs/rig` |
| `GrantStore` · `GrantStoreCtx` | `@lloyal-labs/lloyal-agents` |
| `composePrompt` · `renderPrompt` · `renderTemplate` | `@lloyal-labs/lloyal-agents` |
| `renderSpine` | `@lloyal-labs/rig` |
| `reportTool` | `@lloyal-labs/rig` |

Prompt templates live in `prompts/` beside the harness — `.eta` for templates with conditionals, loaded as raw strings at startup and rendered at call time.

### Continue

-   [Build your first harness](/build-your-first-harness)
-   [Thinking in Lloyal](/thinking-in-lloyal)
-   [harness.yml](/harness-yml)
-   [Adaptive compute](/agent-policy-and-context-pressure)
-   [lloyal-ai CLI](https://www.npmjs.com/package/lloyal-ai)
-   [Abilities catalogue](https://apps.lloyal.ai/)
-   [HDK source](https://github.com/lloyal-ai/hdk)
