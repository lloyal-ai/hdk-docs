---
title: "Rerank architecture"
description: "How the cross-encoder composes Branch + BranchStore over a warm trunk — score formula internals, calibration gates, BM25 first stage, concurrency, and tuning."
---

**Every chunk that enters an agent's KV passed through this model first.** Rerank is the cross-encoder that admits task-relevant context into attention — every search result, every corpus probe, every coverage check goes through it. The architecture is the post-3.0 shape: composed in the SDK over the same `Branch` + `BranchStore` primitives that power agents. "Agents are branches of a live KV cache" extends literally to rerank.

This page documents `sdk/src/Rerank.ts`, `rig/src/reranker.ts`, and the corpus AgentApp's `SearchTool` + `bm25.ts`. For the AgentApp-author contract — the `EntailmentScorer` interface, the four scoring roles, and the three queries they keep separate — see [Sources & retrieval](/build-an-app/sources-and-retrieval); this page is the internals beneath it.

## Three-segment template decomposition

A reranker prompt interpolates query + document into a fixed harness. The harness is identical across every score; only query and doc change:

```
[SYSTEM][USER_PREFIX][QUERY][MID][DOC_i][SUFFIX][GEN_PROMPT]
└── permanent trunk ──┘ └── per-query branch ──┘ └─── per-chunk leaves ────┘
```

Three segments, three branch layers:

- **`trunk`** — `[SYSTEM][USER_PREFIX]`. Decoded **once** at `Rerank.create()`, held for the instance lifetime. Warm KV amortized across every score.
- **`queryBranch`** — forked from trunk per `score()` call, prefilled with `[query, ...mid]`. Forked with `cloneLogits: false` — the ~600 KB logits snapshot copy is skipped because the next operation overwrites it via prefill.
- **`leaves`** — forked from `queryBranch` in groups of `BranchStore.available` (`nSeqMax − 2` slots; the default `nSeqMax: 10` keeps the historical 8-leaf width), scatter-prefilled with `[doc_i, ...suffix]` in a single `llama_decode`, scored by reading exactly **two floats per leaf** via `_branchLogitsAt([yesId, noId])`, then pruned.

The amortization is real because of multi-tag KV survival ([branch lifecycle](/under-the-hood/branch-lifecycle)): shared cells stay alive while leaves prune. Per-leaf document budget is `floor(nCtx / nSeqMax) − sharedLen − suffixLen`; longer docs are head-truncated, observable via the `onTruncate` callback (`rerank:truncate`).

## Score formula

```
score = logit("yes") − logit("no")
```

Unbounded. **This is the log-odds of an absolute yes/no relevance judgment.** Qwen3-Reranker is a pointwise binary cross-encoder; its official score is the two-token softmax over {yes, no} — i.e. `sigmoid(score) = P(yes)` — and the logit-diff is its monotone equivalent: identical rankings, full dynamic range. Scores are thresholdable (`0 ≡ P(yes) 0.5`) and comparable across queries to the extent of the model's calibration; quantization adds noise at the extremes. Top-1 routinely goes negative on real corpora when no document is strongly relevant — an honest "probably not", with the ranking still useful. Production traces show top-1 from +10 (P ≈ .9999) to −3 (P ≈ .05, weak best-of-bad).

Why store logit-diff and not the probability: sigmoid compresses large gaps into indistinguishable extremes (a gap of 5 → 0.993; 10 → 0.99995), and downstream rounding manufactures ties in dense result sets. The calibration data behind the switch (`reasoning.run/scripts/inspect-rerank.mjs`): median(relevant) − median(irrelevant) jumped **0.0453 → 3.66** (×80), top-5 stddev per query went **0.05–0.5 → 2.5–6.5** (saturation eliminated). Convert with `sigmoid()` only at boundaries that need a probability — e.g. `web_search`'s exploit mode min()-ing against a provider's [0,1] score. The frozen-fixture eval pack (`lloyal-sdk/eval/rerank/`) is the empirical reference: same-pair scores are bit-exact within a build and stable to below 0.02 logits across toolchain bumps.

Internal hygiene: results are **sorted on raw scores**, never rounded ones — sorting on display-rounded values made insertion order the tiebreaker in dense sets.

## Where each scoring method fires

The `EntailmentScorer` contract (owned by [Sources & retrieval](/build-an-app/sources-and-retrieval)) maps onto the tick loop at these points:

| Method | Fires at | Purpose |
| --- | --- | --- |
| `scoreEntailmentBatch` | `DelegateTool.execute` (DISPATCH) | Gate proposed sub-tasks against the **original query** before spawning |
| `scoreRelevanceBatch` | inside content tools when `ToolContext.explore === false` | Exploit mode: `min(toolQueryScore, originalQueryScore)` per chunk |
| `scoreSimilarityBatch` | `DelegateTool.execute`, before spawn | Echo detection — sub-tasks vs the delegating agent's own task |
| `shouldProceed` | every gate above | Floor check against `Source._entailmentFloor` (default 0) |
| `Reranker.score` (iterator) | `SearchTool` / `fetch_page` chunk scoring | Streaming top-K with progress events |

The pool decides explore vs exploit per dispatch ([Pressure & policy](/under-the-hood/kv-pressure)); the tool obeys via `ToolContext.explore`; the agent never knows which mode it's in.

## Calibration gates

`Rerank.create()` fires three fail-loud gates at boot. Any failure throws a typed `RerankCalibrationError` with diagnostics; partial state is scrubbed so the next attempt can re-bind.

1. **Single-token yes / no** — the score formula assumes single-token labels. Multi-token labels (some non-English tokenizers) need a log-sum-exp generalization (3.x ticket).
2. **BPE-boundary drift ≤ 5%** — re-tokenizing a whole canary prompt is compared against the concat of segments (prefix, query, mid, doc, suffix). Most chat templates drift 1–5 tokens from BOS/EOS chrome; the gate trips only on >5%, which indicates a sentinel-induced multi-token BPE merge — the leaf prompts would silently differ from what the model was trained on.
3. **Boot canary, relative ordering** — a known relevant pair must outscore a known irrelevant pair by **> 1.0 logit unit**. The gate asserts the *gap*, not absolute signs: quantization shifts calibration enough that sign assertions are brittle, while the ordering gap still catches yes/no token reversal, model swaps, and template drift.

The canary fixtures are hardcoded to Qwen3-Reranker semantics; swapping reranker models means re-running the calibration probe and updating them.

## Concurrency model

Three layers of decode exist in the HDK; only the third needs explicit handling here:

| Decode caller | Concurrency control | Why |
|---|---|---|
| Agent-loop `store.commit(entries)` per tick | Architectural — one call carries all N agents | `decode_each` batches N branches into ONE `llama_decode` |
| Tool-decode (rerank) from one agent's tool | Structural — the agent blocks on its tool result | No overlap with that agent's commits |
| Tool-decode from N parallel callers | **Per-instance serializer (Promise chain)** | `llama_context::decode` has no internal mutex |

**Rerank takes exclusive ownership of its `SessionContext`.** `createReranker` constructs a dedicated context; routing any other decode through it is undefined behavior. Enforcement is at construction — a `__decodeOwner` flag refuses a second `Rerank.create()` on the same context; `dispose()` clears it so test/REPL re-creation works.

Within one instance, concurrent `score()` / `scoreBatch()` calls serialize through the per-instance chain — the kernel sees arrival order, consumers get a concurrent-looking API. The `score()` iterator additionally supports cancellation: `for-await break` (or `iterator.return()`) stops issuing leaf groups, bounding post-cancel cost at the one group already in flight.

## BM25 first stage

The cross-encoder is O(N) in candidate count: 1,000 chunks = 1,000 forward passes. The corpus AgentApp's `SearchTool` bounds this with an Okapi-BM25 first stage:

1. **At first search** — lazily build a `BM25Index` from `chunk.tokens` (already tokenized by `Reranker.tokenizeChunks` at corpus boot — building earlier would race tokenization). No re-tokenization, no extra model.
2. **At query time** — tokenize the query through `Reranker.tokenize` (same vocabulary as the chunks), score every chunk by BM25 (`k1=1.5`, `b=0.75`, Okapi-smoothed IDF), take top-K (default 100, `opts.firstStageK`).
3. **Hand off** — the cross-encoder scores ≤ K candidates regardless of corpus size. The envelope's `totalScored` reports the BM25 pool that was actually cross-encoded, so the agent sees the effective pool size honestly.

Traces emit `bm25:start` / `bm25:end` with `candidateCount`, `keptCount`, `durationMs` — the funnel is observable.

**Approximation caveat**: BM25 over BPE tokens is lexical — it catches "Paris" matching "Paris", not "automobile" matching "car". Mitigation is the wide default K=100: the cross-encoder disambiguates semantics *within* the BM25 net, so the net only has to be wide enough to contain the eventual winners. For synonym-rich corpora (medical: "MI" / "heart attack" / "myocardial infarction") the escape hatch is hybrid retrieval (BM25 ∪ embedding-top-K) — a 3.x ticket. Bypass entirely with `firstStageK: Infinity` (small corpora, tests).

## Threshold envelope

`SearchTool` returns an envelope, not a raw array:

```ts
{
  hits: ScoredChunk[];        // hits ≥ thresholdScore, sorted desc
  thresholdScore: number;     // the floor applied (default 0)
  totalScored: number;        // candidates the cross-encoder actually saw
  topRejected: ScoredChunk[]; // top 3 sub-floor chunks; populated only when hits is empty
}
```

An agent that sees `{ hits: [], totalScored: 484, topRejected: [...] }` knows the corpus has nothing the model would call relevant — a real "best I could find, but the model said no to all of them" signal, with the unconfident-best available at reduced trust. The previous behavior — top-K by score regardless — fed irrelevant queries `0.999`-saturated noise that agents processed as evidence.

The default floor 0 is the logit-diff zero crossing ("keep documents the model judges more-likely-relevant-than-not") — empirically useful on the corpora HDK ships against, not a law. Override per corpus: `new SearchTool(chunks, reranker, { threshold: 1.5 })`, or `-Infinity` to always return top-K.

## Calibration discipline

When tuning for a new corpus:

1. **Run the calibration probe** (`reasoning.run/scripts/inspect-rerank.mjs`) against a fixture set with ground-truth labels: relevant chunks, off-topic chunks, API-identifier queries.
2. **Check** median(relevant) − median(irrelevant) ≥ 0.30 (loose target; production sits at 3.66).
3. **Check** top-5 stddev per query > 1.0 — saturation should be visibly gone.
4. **Threshold sweep** at floors 0 / 0.5 / 2.0 / 5.0 — pick the lowest floor that keeps the irrelevant pass-rate near zero.

Floor changes propagate as a subclass override on `Source._entailmentFloor`, not a global flag — AgentApp authors who know their corpus tighten locally without moving framework defaults.

## Lifetime and cleanup

`Rerank.dispose()` is idempotent: CASCADE-prunes the trunk subtree (`RESTRICT` would throw on a leaked leaf and mask the original error), clears `__decodeOwner`, disposes the underlying context. The canonical consumer is rig's `createReranker` — an Effection `resource()` that disposes automatically on scope exit; the harness yields it once per process and publishes it on `RerankerCtx` for AgentApp factories.

## Related

- [Sources & retrieval](/build-an-app/sources-and-retrieval) — the AgentApp-author contract: `EntailmentScorer`, four roles, three queries.
- [Continuous Context](/under-the-hood/continuous-context-spine) — the same `Branch` + `BranchStore` primitives, agent-side.
- [Branch lifecycle](/under-the-hood/branch-lifecycle) — multi-tag KV survival, fork-prune topology.
- [Pressure & policy](/under-the-hood/kv-pressure) — what flips exploit mode; how `nSeqMax` interacts with budgets.
