---
title: "A focal lens for context admission"
description: "Every candidate admitted through a reranked path got there by answering a question. The question is a sentence bound by the harness, the answer is two logits, and each available leaf group settles in one batched dispatch — the same code on a laptop and on two B200s."
lede: "You choose the plane that comes up sharp, and everything else falls away"
---

<!--
Corrected 2026-09-30: the exploit sample now matches packages/rig/src/admission.ts (scoreRelevanceBatch no
longer exists; EntailmentScorer has scoreEntailmentBatch, scoreSimilarityBatch, shouldProceed); the embedding
paragraph now matches the shipped embedding service (candidates, never admission).
-->

::: proof The squeeze

**On a laptop you have 32k, and a dozen agents that all want it.**

Every search hit and every fetched page competes for space that is already spoken for. Admission policy decides what earns it — and at the edge that choice is the difference between an application that works and one that thrashes.

:::

::: proof The swing

**On two B200s the same application hands one agent a 57,000-word budget.**

One process, both GPUs, the same packages you ran on the laptop. Nothing in the code changes between them. The policy reads the headroom it actually has, and the lens admits accordingly.

:::

## Distance is not a criterion {#distance-is-not-a-criterion}

**Most systems choose what enters context by distance.** They embed the candidate, embed the query, keep whatever lands closest. Distance is cheap, and it is not a judgement.

Consider two sentences:

```text label="CANDIDATE"
Query:    The inspection occurred on 18 March.

Passage:  The inspection was scheduled for 18 March
          but was cancelled on 17 March.
```

Same entities, same date, heavy lexical overlap — neighbours in embedding space. Top-k returns the passage, your model states the assertion as fact, and you have spent scarce context on the one document that refutes it.

Negation and modality are invisible to similarity, because similarity was never asked anything. It measured.

## The question is a sentence {#the-question-is-a-sentence}

**On a reranked path, every candidate that earns attention got there because a second model was asked a question in English and answered yes or no.** The judge is a prompt, and the criterion lives in one line of it:

```text label="THE JUDGE"
SYSTEM: Judge whether the Document meets the requirements based on
        the Query and the Instruct provided. Note that the answer
        can only be "yes" or "no".

USER:   <Instruct>: Given a web search query, retrieve relevant
                    passages that answer the query
        <Query>:    ...
        <Document>: ...
```

The score is `logit("yes") − logit("no")` — two slots out of a hundred and fifty thousand, read as log-odds. Candidates scored against the same `<Query>` and the same `<Instruct>` line can be compared and ordered by that score. A positive value means the model favoured *yes* for that pair; it is not a globally calibrated relevance threshold. Any operational cutoff has to be calibrated for the task, instruction and model that will use it.

Because the criterion sits in the `<Instruct>` line, the same weights answer a different question when the sentence changes. That line is the plane you bring into focus. `createReranker` binds it once for the shared reranker, so every Ability using that instance shares the same question. Moving the plane is a harness-level decision, not a per-score switch. Similarity has one plane, fixed at *looks alike*, and no way to move it at any price.

## A page arrives in its own words {#a-page-arrives-in-its-own-words}

**An agent fetches a forty-thousand-token page. Two thousand tokens of it reach the model.** The article is chunked on heading boundaries, every chunk is scored, and the survivors are admitted *verbatim* — five of them by default, inside a 2048-token budget.

Nothing is summarised. The industry’s answer to an oversized page is a second generative call that compresses it, which is lossy, slow, and precisely where fabrication enters. Selection replaces compression: what arrives is the source’s own sentences, quotable and attributable, chosen by a question you wrote.

```ts label="ADMITTING FROM A PAGE"
// 1. structure the page — headings become chunk boundaries
const chunks = yield* call(() =>
  chunkHtml(fetched.articleHtml, url, fetched.title),
);

// 2. ask the judge once per chunk, in one batched pass (progress streams as it goes)
const scored: ScoredChunk[] = yield* call(async () => {
  let last: ScoredChunk[] = [];
  for await (const batch of reranker.score(args.query, chunks)) last = batch.results;
  return last;
});

// 3. admit verbatim: top-K, inside a token budget
const topChunks = selectTopChunks(scored, chunks, topK, tokenBudget);
```

If you have written retrieval before, step three is where your `top_k` slice went. The difference is what step two returns — not a distance to sort by, but an answer to a question — and that there is no step four. Nothing compresses what survived.

A corpus admits on the same shape, with one addition. The judge is linear in candidates, so a cheap lexical stage narrows the field before it is asked anything:

```ts label="ADMITTING FROM A CORPUS"
// a cheap first stage decides who gets judged at all
const candidates = bm25.topK(query, 100);

// the judge scores those in groups of available leaves
const scores = yield* call(() => reranker.scoreBatch(query, candidates.map((c) => c.text)));

// apply this source's configured threshold, or keep top-K
const hits = candidates.filter((_, i) => scores[i] >= threshold);
```

A corpus can apply a floor because its source policy owns one. That number is not intrinsic to the score: it becomes meaningful only after calibration against that corpus, instruction and model. Without that calibration, take top-K within the query. With it, the floor can do double duty — above it the agent has admitted matches; below it the policy can expose the best rejected candidates and invite a different question rather than a longer list.

**And the same lens admits work, not only text.** Hand it proposed sub-tasks instead of passages and it asks two questions before anything is spawned:

```ts label="ADMITTING WORK"
// does this sub-task still follow from the original query?
const onTopic = yield* call(() => scorer.scoreEntailmentBatch(subTasks));
const surviving = subTasks.filter((_, i) => scorer.shouldProceed(onTopic[i]));

// is someone further up the tree already asking it?
const ancestors = callingAgent.walkAncestors((a) => (a.task ? [a.task] : []));
const echo = yield* call(() => scorer.scoreSimilarityBatch(ancestors.join(" "), surviving));
if (Math.min(...echo) > echoThreshold) return { error: "already asked upstream" };
```

Same primitive, same shared instruction, a different query or reference string. The method names describe how the score is used; they do not switch the `<Instruct>` line. Admission is not a retrieval feature — it is what the runtime does whenever something wants space it has not earned.

## The aperture is under program control {#the-aperture-is-under-program-control}

**Policy decides what the model gets to focus on, per agent, per tick.** Reading a page in explore mode, chunks are scored against what that agent just asked. In exploit mode they must satisfy the agent’s query *and* the original task at once — `min(toolQueryScore, originalQueryScore)`, which is a much narrower depth of field. The reference can move at runtime; the shared instruction remains the one the harness bound at construction.

The default is wide. `AgentPolicy.shouldExplore()` narrows it as headroom disappears, at 40% of context and 50% of the time budget in the shipped policy. An investigating agent keeps its bridging content while there is room for it, and stops down when there is not.

```ts label="THE POSTURE SWITCH — inside admitChunks"
// Explore (default): the chunks keep the scores they earned against what this agent asked.
// Exploit: one more pass against the original question, and both must be high to rank.
if (context?.explore === false && context.scorer && scored.length > 0) {
  const originalScores = yield* call(() => context.scorer!.scoreEntailmentBatch(chunkTexts));
  scored = scored
    .map((sc, i) => ({ ...sc, score: Math.min(sc.score, originalScores[i]) }))
    .sort((a, b) => b.score - a.score);
}
```

A tool gets this by calling `admitChunks` — see [Retrieval](/retrieval) — rather than writing it.

The reason explore is the default when reading a page is worth stating: the agent chose that page. Scoring its contents against the original task would demote exactly the bridging material that produces the next good hypothesis.

## Candidates share the dispatch {#candidates-share-the-dispatch}

**Every available leaf scores in the same batched dispatch.** Scoring fills a group from the sequence leases that remain after the warm trunk and query branch, then forks one leaf per candidate in that group. Every token carries its own position and sequence, logits are requested only on each candidate’s final token, and one `llama_decode` settles the group. Forking shares the parent’s cache cells rather than copying them, so each candidate pays for its own tokens rather than another copy of the question.

A wider candidate set still costs work: once one group fills, the next group is dispatched. What batching removes is one-dispatch-per-candidate overhead. The group width is bounded by available sequence leases; the number of groups follows the candidate count.

**And it runs beside generation, never in front of it.** The reranker owns a separate context and serialises its own calls, so admission queues among itself while the tokens already generating keep generating. Search declares `fanout = true` precisely because it touches no main-context state.

## Every question carries a smoke test {#every-question-carries-a-smoke-test}

**The reranker checks its setup before it is handed to the harness.** Three gates run at startup: `"yes"` and `"no"` must each tokenise to exactly one token, or the subtraction is not a log-odds ratio at all; a rendered probe confirms the tokenizer did not merge across the prompt’s segment boundaries; and the instruction’s own `matching` document must outscore its `nonMatching` document by more than `minGap`. The gate asserts that gap, not either score’s sign.

The smoke test catches a broken setup — a yes/no token swap, model swap or template drift. It is not calibration and does not prove the judge discriminates well. The default `RETRIEVAL_INSTRUCTION` carries a retrieval pair; a custom instruction carries fixtures for its own question. The explicit `smokeTest: 'none'` form skips the behavioural gate.

**KV precision is part of the configuration too.** The SDK’s `Rerank` defaults `typeK` and `typeV` to `q4_0`; the harness’s `createReranker` sets both to `q8_0`, because at `q4_0` close pairs invert (see [the lookup](/lookup)). Set them explicitly when policy depends on a known score resolution: cache precision bounds the smallest difference you should treat as meaningful, and the smoke test does not measure that bound.

## Lenses that ship {#lenses-that-ship}

One instruction ships as the default: retrieval relevance. Current consumers use that shared question with different reference strings and admission policies; none supplies a custom instruction. One Ability deliberately has no reranker at all.

| path | reference used | what it admits |
| --- | --- | --- |
| `corpus / search` | The tool query; also the original query in exploit mode | BM25 narrows to a hundred lexical candidates, the cross-encoder orders those, and the source’s configured floor filters them. If all miss the floor, the best rejected candidates are exposed as a different signal. |
| `web / fetch_page` | The agent’s tool query; also the original query in exploit mode | Five verbatim chunks inside 2048 tokens, chosen from a page structured on its headings. |
| `web / web_search` | Provider ordering in explore mode; original query in exploit mode | Explore preserves the provider’s ranking. Exploit combines its score with the reranker’s original-query score, so both must agree. A result a sibling already fetched is skipped outright. |
| `rig / delegate` | The original query, then the calling and ancestor tasks | Admission of *work* rather than text: proposed sub-tasks below the configured floor are dropped, and any that echo a task already running further up the tree are refused. |
| `wikipedia` | — | No reranker integration. A capped result list, and the model reads what comes back. Not every Ability needs a lens, and pretending otherwise would be the expensive kind of consistency. |

## Define the question {#define-the-question}

`RerankInstruction` is the released surface for choosing another criterion. It carries exactly the sentence rendered into `<Instruct>` and the smoke test that belongs to that sentence:

```ts label="THE CONTRACT"
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

Pass that value as `instruction` to `createReranker`. Omit it and the instance uses the deep-frozen `RETRIEVAL_INSTRUCTION`. Supply it and every Ability sharing that instance asks the new question. The matching fixture must beat the non-matching fixture by more than a finite, non-negative `minGap`; fixtures too long to survive the scorer’s token budget are rejected before boot.

`scoreBatch` still takes one query and many documents, so which side you put in `<Query>` decides what you asked. Values from different queries are not commensurable. Choose the orientation, calibrate any policy threshold within that question, and write smoke fixtures that exercise the same criterion.

## When the sentence has to change {#when-the-sentence-has-to-change}

**Most of what looks like a new lens is a new reference.** The string you put in `<Query>` moves freely and costs nothing — that is how one instruction serves passages, sub-tasks and sibling work. The test for whether you need a new *sentence* is narrow: would the candidate you want to reject score *high* on relevance? If it would, no reference will save you.

Three criteria fail that test.

| criterion | why relevance cannot reach it |
| --- | --- |
| **Support** | A passage that refutes a claim is squarely on that claim’s topic. It answers the query — it just answers it against you. |
| **Applicability and currency** | A superseded rule answers the question it was superseded on. Putting the date in the query makes it score *higher*, because it names the period. |
| **Compatibility with an invariant** | A record that violates a constraint is maximally relevant to it. Violation and satisfaction are equally on topic. |

Each is a different yes-or-no question, so each needs its own `<Instruct>` line and its own fixtures. And each costs a second reranker: the sentence is prefilled into the warm trunk at construction, so a second criterion is a second `Rerank` instance on its own model context, owned by your harness rather than sitting on the framework’s single reranker slot. Its scores are not comparable with the first — run it as a second filter stage, never as a term in one combined score.

**Raising the bar is not one of these.** A higher burden of proof is a floor, not a question, and the floor is already yours: `shouldProceed(score)` is part of the scorer contract, and the scorer is a plain option on the pool. A judge whose threshold rises with the stakes is a scorer you supply, not a sentence you rewrite.

Moving between explore and exploit is a reference change too, not a sentence change. It is [above](#the-aperture-is-under-program-control), and as a policy pattern in [Advanced patterns](/advanced-patterns#dynamic-retrieval-phase-switching).

## The shipped lens is one configuration {#the-shipped-lens-is-one-configuration}

Every element unscrews.

| element | ships as | or |
| --- | --- | --- |
| The judge | A shared `Rerank` instance with batched `scoreBatch` | Any object with a `scoreBatch` method satisfies the scorer contract |
| The plane | `RETRIEVAL_INSTRUCTION` | Pass a `RerankInstruction` to `createReranker`; the sentence and its `smokeTest` travel together |
| The resolution | `q4_0` for both KV cache types in the SDK’s `Rerank`; `q8_0` from the harness’s `createReranker` | Set `typeK` and `typeV` explicitly for the resolution and memory profile your policy requires |
| The aperture | `DefaultAgentPolicy` answers every decision the pool asks | Subclass it and override the one decision you care about |

The scorer arrives with an [Ability](/abilities); the posture comes from [AgentPolicy](/agent-policy-and-context-pressure). Explore and exploit are one shape of one hook, not the axis itself. A policy that needs a different posture — a verification phase, a burden-of-proof that rises with the stakes — writes it.

An embedding on its own has none of this: no plane you can choose, no posture to switch, no hook to override — similarity is all it measures. That is why the platform's embedding service is used to **find candidates**, fast, ahead of the question, and never to admit them: the judge decides what enters. See [Services](/services).
