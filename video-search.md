---
title: "Search inside video"
description: "The building blocks for finding a moment by what was seen, said or heard, in any language: the embedding service over text, images, video, windows and recordings in one space; a vector index searched coarse to fine from one encode; and rank fusion across senses."
lede: "Find a moment by what was seen, said or heard, in any language. Every input lands in one space, every vector can be cut and still compared, and rankings from different senses combine by rank."
---

<!--
Checked against source, 2026-10-24:
  lloyal-sdk  packages/rig/src/retrieval.ts          Embedder: embed, measure, tokenize, dimension, dimensions, modalities, audio, tasks; EmbeddingInput
  lloyal-sdk  packages/rig/src/providers/embedding.ts  parts in order; media alone unframed; a video's soundtrack window by window when the model hears; refusals before any work
  lloyal-sdk  packages/rig/src/vector-index.ts       VectorIndex: widths, stored, search { k, width, scan { width, keep } }
  lloyal-sdk  packages/rig/src/fuse-ranks.ts         fuseRanks(rankings, { k = 60, same })
  lloyal-sdk  packages/media/src/video.ts            videoWindow
  lloyal-sdk  packages/agents/src/context.ts         Attachments
Tests:
  lloyal-sdk  packages/rig/test/embedder-multimodal-model.test.ts  agreement with llama.cpp's server for an image, a clip, a recording, interleaved inputs and every task framing; a window as its own moment; a video heard with its soundtrack; one query finding any medium; the detail budget's cost
  lloyal-sdk  packages/rig/test/embedder-multimodal.test.ts  measure; refusals before any work
  lloyal-sdk  packages/rig/test/embedder-framing.test.ts     framing from the catalog
  lloyal-sdk  packages/rig/test/vector-index.test.ts         coarse to fine on EmbeddingGemma 2 vectors of 615 frames
  lloyal-sdk  packages/rig/test/fuse-ranks.test.ts           rank fusion
-->

Search inside a video is three building blocks a harness composes: the **embedding service**, which turns text, images, videos, windows of videos and recordings into vectors in one space; a **vector index**, which searches those vectors at any width the model was trained to be cut to; and **rank fusion**, which combines rankings from different senses. There is no search API on top of them yet. This page is how each block behaves, and what the tests show it does.

## One space for every medium {#one-space}

Bind the service by naming it in `harness.yml`. A block that names no model takes EmbeddingGemma 2 and its projector, which read text, images, video and sound:

```yaml label="harness.yml"
model:
  embedding: {}
```

Read it wherever a harness or an ability runs, and embed what a reader attached beside what a reader asked:

```ts label="your harness code"
import { service } from "@lloyal-labs/rig";

const embedder = yield* service("embedding");
const [photo, clip, recording, question] = yield* embedder.embed([
  { parts: [photoRoot] },
  { parts: [clipRoot] },
  { parts: [recordingRoot] },
  { parts: ["a voice counting numbers out loud"], role: "query" },
]);
```

Each vector is unit length, so cosine similarity is a dot product. In the test that holds this page to it, three text questions, one about a photo of a cat, one about a clip of a red square moving and one about a recording of someone counting, each rank their own attachment first among the three. The [services page](/services#what-a-bound-service-exposes) is the full contract.

An input is text and attachments in order, and comes back as one vector. Text around an image, or a clip beside a recording and a sentence about both, is one input:

```ts
const [scene] = yield* embedder.embed([{ parts: [clipRoot, " while a voice says ", recordingRoot] }]);
```

Every input type, interleaved ones included, agrees with llama.cpp's server for the same files to a cosine of 0.999 or better.

## What an input is for {#framing}

The caller says what an input is for, never how the model wants that written. Name a `task` and a `query` or `document` role, and the encoder writes the model's own framing for it:

```ts
yield* embedder.embed([
  { parts: ["What animal is sitting in the photo?"], task: "question-answering", role: "query" },
  { parts: ["Robots assemble car bodies on a factory line."], task: "fact-checking", role: "query" },
  { parts: ["def add(a, b):\n    return a + b"], task: "code-retrieval", title: "add.py" },
]);
```

EmbeddingGemma 2 frames seven tasks: `search` (the default), `question-answering`, `fact-checking`, `code-retrieval`, `classification`, `clustering` and `similarity`. Each lands where llama.cpp lands the model card's own text for it. Media alone goes unframed. A task the bound model has no framing for is refused before any work.

## A window as its own moment {#windows}

A span of a stored video is a video of its own, at the video's own times, built from the blobs already stored. Embedded, it is its own moment: a window of the whole clip embeds where llama.cpp embeds the clip, and its first and second halves embed apart from it and from each other.

```ts
import { videoWindow } from "@lloyal-labs/media";
import { Attachments } from "@lloyal-labs/lloyal-agents";

const store = yield* Attachments.expect();
const moment = videoWindow(store, video, { fromMs: 80_000, toMs: 88_000 });
const [vector] = yield* embedder.embed([{ parts: [moment] }]);
```

A window keeps the frames that fall in its span and the soundtrack windows and transcript segments that overlap it. [Video inference](/video-inference#windows) has the rule in full.

## Heard as well as seen {#heard}

When the bound model hears, as EmbeddingGemma 2 does with its projector, a video is embedded with its soundtrack: the frames, then each soundtrack window as a recording. A clip embedded with its sound lands where the clip and the recording embedded together as two parts land, and apart from the clip alone. So a search finds a moment by its sound as well as by its picture. `embedder.audio` is the admission a recording or a soundtrack window meets; it is null for a model that does not hear, and then a recording is refused by name.

## What it costs {#cost}

Every call is measured before anything runs. `measure` answers what each input costs in cells with nothing encoded:

```ts
const [cells] = yield* embedder.measure([{ parts: [clipRoot] }]);
```

An input over the context, a part the model cannot read, or a part with nothing the projector reads refuses the whole call before any work, and the next call is unaffected. An input is encoded whole, never truncated, so the context is also the most one input can hold: 8,192 cells for EmbeddingGemma 2.

What one image or frame costs is the visual detail budget, 70 to 1,120 tokens for EmbeddingGemma 2's projector. Lower the ceiling to fit more frames into one input, raise the floor for detail such as text in a frame. It is [`model.embedding.vision`](/harness-yml#embedding).

## Coarse to fine from one encode {#coarse-to-fine}

EmbeddingGemma 2 is trained so that the first 512, 256 or 128 values of its 768-wide vector are a vector of their own, comparable to others cut the same way. One encode answers every width. `VectorIndex` keeps entries, scans everything at a narrow width, and decides what the scan kept at a wide one:

```ts
import { VectorIndex } from "@lloyal-labs/rig";
import type { Attachment } from "@lloyal-labs/media";

const index = new VectorIndex<Attachment>({ widths: embedder.dimensions });
windows.forEach((window, i) => index.add(window, vectors[i]));

const [query] = yield* embedder.embed([{ parts: ["a cat"], role: "query" }]);
const best = index.search(query, { k: 20, scan: { width: 128, keep: Math.max(20, Math.ceil(index.size / 4)) } });
```

On EmbeddingGemma 2's vectors of all 615 frames of a ten-minute pet compilation, a 128-wide scan that keeps a quarter of the frames, decided at 768, answers exactly the full 768-wide scan's first 20 frames, in order, for "a cat", "a dog" and "a kitten".

Two vectors are only ever compared at one width: both are cut to it and made unit length again. A width the model was not trained to be cut to is refused, naming the ones it was; a scan that keeps fewer entries than it is asked for, or is not narrower than the answer, is refused, which is why the shortlist above never keeps fewer than the 20 asked for. `stored` keeps entries at a narrower width, so a long index stays small, and then no search can compare wider than it.

## Sensor fusion {#sensor-fusion}

What was heard, what was said and what was seen score on scales that cannot be compared. Rank fusion combines rankings by where each item stands, never by its score: an item gains 1 / (k + its rank) from each ranking it is in, with k 60 by default, so broad agreement outweighs one first place.

```ts
import { fuseRanks } from "@lloyal-labs/rig";

const fused = fuseRanks([heardRanking, saidRanking], {
  same: (a, b) => a.startMs < b.endMs && b.startMs < a.endMs,
});
const [first] = fused;
```

`same` says when two items from different rankings are one moment, such as spans that overlap; items it joins are one, transitively. Each fused moment lists its members, its score and its position in each ranking. It compares every pair of items, so it is meant for shortlists, not whole collections.

This is late fusion: each sense ranks moments on its own, and the rankings combine. In the [Hindi scenario](/video-verification#english-finds-hindi), fusing what was heard with what the Hindi transcript said puts each moment first.

## What a score means {#scores}

A score ranks; it does not decide. A question with no answer in a clip still scores close to one with an answer, so "not found" needs another signal than a threshold. Rank, fuse and shortlist; don't threshold.

## EmbeddingGemma 2 on lloyal {#embeddinggemma-2}

| Feature | What it enables in lloyal | Where it lives |
|---|---|---|
| One space for text, images, video and audio | One query compares with any medium; any vector compares with any other | the embedding service |
| Interleaved inputs, one vector | Text around an image, or a clip beside a recording, embedded as one input | the service's ordered `parts` |
| An audio encoder | A moment found by its sound, without a transcript | the soundtrack windows kept with each video; the service |
| Video frames through the vision encoder | A video, or any window of it, embedded at its own times | `videoWindow`; the service |
| Seven task framings | A caller names an intent and never writes a prefix | the catalog's framing; `task` and `role` |
| Matryoshka widths 768, 512, 256, 128 | Coarse to fine from one encode; compact indexes | `VectorIndex` |
| A visual detail budget of 70 to 1,120 tokens | Detail against cost, per image or frame | [`model.embedding.vision`](/harness-yml#embedding) |
| An 8,192-token context | The largest input, measured and refused before any work if it does not fit | [`model.embedding.context`](/harness-yml#embedding); `measure` |
| More than 100 languages | A question in one language finds speech or text in another | the service, and `fuseRanks` with the transcript |
| Mean pooling with the model's own boundary tokens | The whole input in one dispatch, agreeing with llama.cpp's server to 0.999 or better | the native runtime |

## Related {#related}

- [How video is verified](/video-verification): the three scenarios on long real footage.
- [Services](/services): the embedding service's full contract.
- [Retrieval](/retrieval): admitting passages with the reranker.
