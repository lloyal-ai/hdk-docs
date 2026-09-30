---
title: "Retrieval"
description: "Admit only the passages that answer the question: chunk what a tool fetched, score every chunk with the resident reranker in one batched pass, and hand the agent the source's own words within a token budget."
lede: "Put only what answers the question into an agent's context — the source's own words, chosen by a judge, within a budget."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/rig/src/admission.ts        admitChunks, AdmitSelect (budget | threshold), AdmitResult; exploit = min(tool, original)
  lloyal-sdk  packages/rig/src/retrieval.ts        Reranker (score, scoreBatch, tokenizeChunks, tokenize, dispose), Chunk
  lloyal-sdk  packages/rig/src/sources/chunking.ts chunkHtml(html, url, title)
  lloyal-sdk  packages/rig/src/source.ts           Source, createScorer (entailment, similarity, shouldProceed), _entailmentFloor 0
  lloyal-sdk  packages/agents/src/scorer.ts        EntailmentScorer — three methods (scoreRelevanceBatch no longer exists)
  lloyal      templates/basic/README.md            "A second model as a service"
  lloyal      templates/research/README.md         "Find the rule in force this year" — the measured instruction (7.2 vs 2.1, 2026-09-26)
  effection   4.1.1 useAbortSignal
-->

A tool that fetches a 40,000-token page should not hand the agent 40,000 tokens. **Admission** chunks what was fetched, asks the resident reranker whether each chunk answers the agent's query, and admits the best ones verbatim within a budget. Nothing is summarised: what reaches the agent is the source's own sentences, quotable and citable.

The `web` and `corpus` abilities already do this for you. This page is for a tool of your own.

## When to use it {#when-to-use}

| You have | Use |
|---|---|
| One fetched resource — a page, a file — and want its most relevant passages | `admitChunks` in **budget** mode: top-K within a token budget |
| Many candidates — a corpus, search hits — and want only those the judge stands behind | `admitChunks` in **threshold** mode: a floor, with the best rejects surfaced when nothing passes |
| A score for your own ranking or decision | `reranker.scoreBatch(query, texts)` directly |

## Before you start {#before-you-start}

Admission needs a reranker. Name one in `harness.yml` and read it with `service`:

```yaml label="harness.yml"
model:
  llm:
    id: qwen3.5-4b
  reranker:
    id: qwen3-reranker-0.6b-q8
```

See [Services](/services) for what that line does.

## Quickstart: admit a page {#quickstart}

```ts label="src/harness/read-page.ts"
import { call, useAbortSignal } from "effection";
import type { Operation } from "effection";
import { Tool } from "@lloyal-labs/lloyal-agents";
import type { JsonSchema, ToolContext } from "@lloyal-labs/lloyal-agents";
import { admitChunks, chunkHtml, service } from "@lloyal-labs/rig";

export class ReadPageTool extends Tool<{ url: string; query: string }> {
  readonly name = "read_page";
  readonly description = "Read the passages of a web page that answer a question.";
  readonly parameters: JsonSchema = {
    type: "object",
    properties: { url: { type: "string" }, query: { type: "string", description: "What you want from the page" } },
    required: ["url", "query"],
  };
  readonly fanout = true; // network and the reranker's own context: never the shared model

  *execute(args: { url: string; query: string }, context?: ToolContext): Operation<unknown> {
    const reranker = yield* service("reranker");
    const signal = yield* useAbortSignal();                                  // a Stop aborts the fetch
    const res = yield* call(() => fetch(args.url, { signal }));
    const html = yield* call(() => res.text());
    const chunks = yield* call(() => chunkHtml(html, args.url, args.url));   // headings become boundaries
    yield* call(() => reranker.tokenizeChunks(chunks));                      // the budget is in reranker tokens

    const admitted = yield* admitChunks(reranker, chunks, args.query, context, {
      tool: this.name,
      url: args.url,
      select: { mode: "budget", topK: 5, tokenBudget: 2048 },
    });

    return {
      content: admitted.passages!.map((p) => p.text).join("\n\n---\n\n"),
      ...(admitted.alsoOnPage?.length ? { alsoOnPage: admitted.alsoOnPage } : {}),
    };
  }
}
```

`alsoOnPage` lists the headings that scored but did not make the cut, so the agent can ask for them next.

## What `admitChunks` does {#what-it-does}

1. **Scores every chunk** against the agent's query with the cross-encoder, in one batched pass, reporting progress as it goes.
2. **Tightens in exploit mode.** When the policy says exploit (`context.explore === false`, as context or time runs short), every chunk is also scored against the **original question**, and the order is the lower of the two scores — both must agree. Explore mode, the default, scores only against what this agent asked, because the agent chose this resource.
3. **Selects** by the mode you gave:

| Mode | Options | Returns |
|---|---|---|
| `budget` | `topK`, `tokenBudget` | `passages` in order, the first truncated on a paragraph if it alone is too big; `alsoOnPage` |
| `threshold` | `threshold` | `admitted` at or above the floor; `topRejected`, the best three, when nothing passed |

4. **Traces the funnel** — `rerank:start`, `rerank:end` with every number, and `entailment:content:exploit` when exploit re-ranked — so the dev pane shows what was admitted and why, with no UI code of yours.

::: owns
Reranker scores are **relative**: log-odds of the judge's yes/no answer for one question. Order candidates within a query and take the top K under a budget; never treat a score as a universal cutoff. A `threshold` is meaningful only once you have calibrated it for your instruction, your corpus and your model. Why is [Focus](/focal-lens).
:::

## Score directly {#score-directly}

```ts label="TypeScript"
import { call } from "effection";
import { service } from "@lloyal-labs/rig";

export function* rankAgainst(question: string, candidates: string[]) {
  const reranker = yield* service("reranker");
  const logOdds = yield* call(() => reranker.scoreBatch(question, candidates));
  return logOdds.map((s) => 1 / (1 + Math.exp(-s)));   // the model's P(yes) per candidate — an order within this question
}
```

The reranker runs on a context of its own, so scoring never competes with the agents for the shared model.

## Change the question the judge answers {#change-the-question}

Every score answers one sentence — by default, whether a passage is relevant to the query. That sentence is set once for the reranker, in `harness.yml`, with a canary pair that refuses the boot if the sentence stops discriminating:

```yaml label="harness.yml"
model:
  reranker:
    id: qwen3-reranker-0.6b-q8
    instruction:
      text: "Given a question about the rule in force on a date, judge whether the Document states the rule in force on that date."
      smokeTest:
        query: "What notice period applies to a rent increase in 2026?"
        matching: "From 1 January 2026 a landlord must give 90 days' notice of a rent increase."
        nonMatching: "Until 2020 a landlord was required to give 30 days' notice of a rent increase."
        minGap: 2
```

Every ability sharing the reranker then asks the new question. This one is from the research template's README, measured on the shipped 0.6B judge: the rule in force scores 7.2 against 2.1 for the one it superseded. It is a boot-tier key — it applies at the next launch — and `minGap` is a canary, not a calibration. When a question needs a new sentence, and when a new query is enough, is [Focus](/focal-lens#when-the-sentence-has-to-change).

## Related {#related}

- [Focus](/focal-lens) — why a judge instead of a distance, and how the aperture moves.
- [Services](/services) — the reranker, the embedder and the rest.
