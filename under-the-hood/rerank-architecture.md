---
title: "Rerank Architecture"
description: "How the cross-encoder reranker composes Branch + BranchStore primitives over a warm trunk, and where BM25 first-stage fits."
---

Rerank is the cross-encoder that admits task-relevant context into every agent's KV cache. It's HDK's most load-bearing capability: every search tool result, every corpus probe, every coverage check goes through it. The architecture below is the post-3.0 shape — composed in the SDK over the same `Branch` + `BranchStore` primitives that power `useAgent`, `withSpine`, and `agentPool`. The framework's "agents are branches of a live KV cache" framing extends literally to rerank.

## Three-segment template decomposition

A reranker prompt is built from a chat template that interpolates query + document into a fixed harness. The harness is identical across every score; only query and doc change.

```
[SYSTEM][USER_PREFIX][QUERY][MID][DOC_i][SUFFIX][GEN_PROMPT]
└── permanent trunk ──┘ └── per-query branch ──┘ └─── per-chunk leaves ────┘
```

Three segments, three branch layers:

- **`trunk`** — `[SYSTEM][USER_PREFIX]`. Decoded **once** at `Rerank.create()` and held for the instance lifetime. Warm KV is amortized across every score.
- **`queryBranch`** — forked from `trunk` per `score()` call, prefilled with `[query, ...mid]`. Forked with `cloneLogits: false` because the next thing it does is overwrite the logits via prefill.
- **`leaves`** — forked from `queryBranch` in groups of `BranchStore.available`, scatter-prefilled with `[doc_i, ...suffix]` in a single `llama_decode` via `BranchStore.prefill`. Each leaf's yes/no logits are read via `_branchLogitsAt` (2 floats per leaf), then the leaf is pruned.

The amortization is real because of **multi-tag KV survival** ([branch lifecycle](/under-the-hood/branch-lifecycle)): shared KV cells stay alive in physical memory while the leaves prune. `trunk` and `queryBranch` don't get re-decoded each call; only the per-document `[doc, suffix]` tail does. The `Branch.prefill()` / `BranchStore.prefill()` convention here mirrors `spine.prefill` / `root.prefill` in the agent runtime — same primitives, different consumer.

## Score formula

```
score = logit("yes") − logit("no")
```

Unbounded.

**This is the log-odds of an absolute yes/no relevance judgment.** Qwen3-Reranker is a pointwise binary cross-encoder; its official score is the two-token softmax over {yes, no} — i.e. `sigmoid(score) = P(yes)` — and the logit-diff is its monotone equivalent: identical rankings, full dynamic range. Scores are thresholdable (`0 ≡ P(yes) 0.5`) and comparable across queries to the extent of the model's calibration; quantization adds noise at the extremes. Top-1 routinely goes negative on real corpora when no document is strongly relevant — an honest "probably not", with the ranking still useful. Production traces show top-1 ranging from +10 (P ≈ .9999) to −3 (P ≈ .05, weak best-of-bad).

Why store logit-diff and not the probability: sigmoid compresses large gaps into indistinguishable extremes (a gap of 5 → 0.993, a gap of 10 → 0.99995), and downstream rounding then manufactures ties in dense result sets. Logit-diff preserves the full dynamic range; convert with `sigmoid()` only at boundaries that need a probability (e.g. mixing with a provider's [0,1] score). The frozen-fixture eval pack (`lloyal-sdk/eval/rerank/`) is the empirical reference: same-pair scores are bit-exact within a build and stable to below 0.02 logits across the b9581 bump and the 3.0 Rerank restructure.

The default floor of 0 in SearchTool therefore means "keep documents the model judges more-likely-relevant-than-not"; the threshold envelope surfaces an unconfident-best as `topRejected` rather than padding `hits` with judged-irrelevant content.

## Calibration gates

`Rerank.create()` fires three fail-loud gates at boot. If any fails, the consumer gets a typed `RerankCalibrationError` with diagnostic context; no Rerank instance is returned and the SessionContext is released so the next attempt can re-bind.

1. **Single-token yes / no** — the score formula assumes single-token labels. Multi-token labels (some non-English tokenizers) need a log-sum-exp generalization (3.x ticket).
2. **BPE-boundary drift** — re-tokenizing the whole canary prompt is compared to the concat of the segments (prefix, query, mid, doc, suffix). Most chat templates produce 1-5 tokens of drift from BOS/EOS handling; the gate trips on >5% drift, which would indicate a sentinel-induced multi-token BPE merge (catastrophic) rather than benign chrome.
3. **Boot canary** — two known pairs (Paris/Paris-doc relevant, Paris/Photosynthesis-doc irrelevant); the relevant pair must outscore the irrelevant by >1 logit unit. The gate asserts the *gap*, not absolute signs — quantization shifts calibration enough that sign assertions are brittle, while the ordering gap still catches model swaps, template drift, and yes/no token reversal.

The canary fixtures are hardcoded to Qwen3-reranker semantics. If you swap reranker models, re-run the calibration probe and update the fixtures.

## Concurrency model

Three layers of decode exist in HDK; only the third needs explicit handling in this layer:

| Decode caller | Concurrency control | Why |
|---|---|---|
| Agent-loop `store.commit(entries)` per tick | Architectural — one call carries all N agents | `decode_each` batches N branches into ONE `llama_decode` |
| Tool-decode (rerank/embed) from one agent's tool | Structural — agent blocks on tool result | No overlap with same agent's commit |
| Tool-decode from N parallel agents simultaneously | **SDK serializer (~10 LOC Promise chain)** | Prevents kernel-level concurrent decode on a single context |

**Rerank takes exclusive ownership of its SessionContext.** `createReranker` constructs a dedicated context; routing any other decode through it is undefined behavior — `llama_context::decode` carries no internal mutex. Enforcement is at construction: a `__decodeOwner` flag on the context refuses a second `Rerank.create()`. The flag is cleared by `dispose()` so test / REPL re-creation works.

Within a single Rerank instance, concurrent `score()` / `scoreBatch()` calls are serialized by a per-instance Promise chain. The kernel sees them in arrival order; consumers still get a concurrent-looking API.

## BM25 first-stage

The cross-encoder reranker is O(N) in candidate count: 1000 chunks = 1000 forward passes. To bound this at the corpus level, `apps/corpus`' `SearchTool` runs an **Okapi-BM25 first-stage** before reranking:

1. **At boot** — `SearchTool` lazily builds a `BM25Index` from `chunk.tokens` (already tokenized by `Reranker.tokenizeChunks`). No re-tokenization, no new model.
2. **At query time** — tokenize the query through `Reranker.tokenize` (same vocabulary as the chunks), score every chunk by BM25 (`k1=1.5`, `b=0.75`), take top-K (default 100, configurable via `opts.firstStageK`).
3. **Hand off to rerank** — pass the top-K subset to `Reranker.score`. The cross-encoder now does ≤ K forward passes regardless of corpus size.

Traces emit `bm25:start` and `bm25:end` events with `candidateCount`, `keptCount`, and `durationMs` so consumers can watch the funnel.

**Approximation caveat**: BM25 over BPE tokens is a *lexical* approximation — token-level cooccurrence, not semantic similarity. It catches "Paris" matching "Paris" but not "automobile" matching "car". Mitigation is wide K (default 100): the cross-encoder still gets to disambiguate semantics within the BM25 top-K, so as long as the BM25 net is wide enough to catch the cross-encoder's eventual winners, lexical-only first stage is sufficient. For synonym-rich corpora (the canonical example is medical: "MI" / "heart attack" / "myocardial infarction"), the escape hatch is hybrid retrieval (BM25 ∪ embedding-top-K) — a 3.x ticket requiring a separate embedding model.

To bypass BM25 entirely (small corpora, integration tests), pass `firstStageK: Infinity` to `SearchTool`'s constructor.

## Threshold envelope

`SearchTool` returns an envelope: `{ hits, thresholdScore, totalScored, topRejected }`. Hits below the configured score floor (`opts.threshold`, default 0) get dropped from `hits` and surfaced in `topRejected` only when nothing else passes. This gives the agent an honest "best I could find, but the model said no to all of them" signal instead of forcing top-K back regardless of relevance. The floor is the logit-diff zero crossing: above 0 ⇒ the cross-encoder leans toward "yes", below 0 ⇒ "no".

For corpora where calibration suggests a different floor (e.g. heavily technical domains where the cross-encoder's "yes" bar is naturally higher), override at `SearchTool` construction time: `new SearchTool(chunks, reranker, { threshold: 1.5 })`.

## Lifetime and cleanup

`Rerank.dispose()` is idempotent. It:

1. Calls `pruneSubtree()` (CASCADE) on the trunk — `RESTRICT prune()` would throw if any leaf or queryBranch leaked from a swallowed abandonment, masking the original error.
2. Clears the `__decodeOwner` flag so the SessionContext can be re-bound.
3. Disposes the underlying SessionContext.

For consumers that wire Rerank into the rig's `createReranker` (the canonical path), the `resource()` shape handles dispose automatically when the surrounding scope tears down. The contract above is what allows test/REPL re-creation patterns: dispose, immediately re-create on the same ctx, get a fresh instance.

## Related

- [Continuous Context Spine](/under-the-hood/continuous-context-spine) — the same `Branch` + `BranchStore` primitives, used by the agent runtime instead of rerank.
- [Branch lifecycle](/under-the-hood/branch-lifecycle) — multi-tag KV survival, fork-prune topology.
- [KV pressure](/under-the-hood/kv-pressure) — how `nSeqMax` interacts with per-sequence token budgets.
- [Search strategy](/under-the-hood/search-strategy) — how the SearchTool envelope feeds into agent planning.
