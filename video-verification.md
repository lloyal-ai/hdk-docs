---
title: "How video is verified"
description: "How lloyal's video pipeline is held to what it claims: agreement with llama.cpp's video layout and its embedding server, feature tests at every layer, and three scenarios on long real footage read by digest, with what each test asserts, when it last ran and on what machine."
lede: "Checked against llama.cpp, and on long real footage. Every claim on these pages is a test that passes."
---

<!--
Checked against source, 2026-10-24:
  liblloyal   tests/integration/multimodal_integration_test.cpp          a video's frames tokenize as the server's video does
  liblloyal   tests/integration/embedding_multimodal_integration_test.cpp  every fixture embeds as the reference server embeds it (0.999); each query finds its own image, clip or recording, in any language; a mixed input's cost; the image budget; an input larger than the batch refused untouched
  lloyal-sdk  packages/rig/test/embedder-multimodal-model.test.ts       the embedding service over EmbeddingGemma 2 and its projector
  lloyal.node test/scenario-integration.ts                              the three scenarios
  lloyal.node test/scenario-pack.ts                                     openPack: every blob read checked against its digest
  lloyal.node test/scenarios/*.json                                     ground truth: spans, labels and queries
  lloyal.node models/scenarios/packs.json                               the packs' roots and how each was built
Run: lloyal.node 0e0e8ce, 2026-10-24, 09:15 to 09:29 UTC, Apple M2 Pro, Metal: 9 of 9 pass, 884 s.
-->

## Agreement with llama.cpp {#agreement}

Two things are held to llama.cpp itself, from the same inputs:

- **The video layout.** A test in liblloyal lays a clip's frames out and compares them with llama.cpp's own video helper, chunk for chunk: the same text tokens, the same image rows, the same positions.
- **The embedding vectors.** A reference is made offline with llama.cpp's embedding server for every input kind: text in every task framing and in Spanish and Japanese, an image at three detail budgets, a clip, a recording, and text, image, video and audio interleaved as one input. liblloyal agrees with every entry to a cosine of 0.999 or better. hdk's embedding service, given the same files through the store, agrees for the image, the clip, the recording, the interleaved inputs and every task framing.

## Feature tests {#features}

Each layer has its own, and each page names the ones behind its claims:

- **liblloyal:** each text query finds its own image, clip or recording, in any language; a mixed input costs its parts and the model's framing; the image budget sets what an image costs; an input larger than the context's batch is refused, untouched.
- **media:** composing, windows, the timeline's rules, time marks that keep frames fusing, reading through any decoder, refusing a clip too long.
- **rig:** the embedding service, the video commands, admission and its refusals, the vector index, rank fusion.
- **ui:** the player, its tracks, opening at a moment, recovering its audio output.

## Three scenarios on long footage {#scenarios}

The scenario suite runs every stage a harness would on long, real video. Each video was read through media's own procedure into a content-addressed pack, sampled at one frame a second, each frame at most 640 pixels on its longer edge, with its soundtrack cut into windows and transcribed. The suite reads each pack by its root digest, and every blob it reads is checked against its digest, so a pack that changed fails rather than answering for different footage.

The footage is third-party video supplied for testing, and none of it is shown here. The ground truth committed with the tests holds time ranges, labels and descriptions in our own words.

**Last run:** 2026-10-24, Apple M2 Pro, Metal: all nine tests pass, in 884 seconds.

### Find every cat in a ten-minute pet compilation {#find-every-cat}

615 frames of short pet clips, each clip labelled by what it shows: 62 cats, 40 dogs, and 37 unclear and not scored. Every frame is embedded as an image, and a clip ranks by its best frame.

- The first 20 clips a query for "a cat" ranks, and the first 10 for "a dog", all show that animal.
- Of the first 62 clips a query for "a cat" ranks, as many as there are cat clips, at least 0.9 show a cat; of the first 40 for "a dog", at least 0.8 show a dog. On 2026-10-22, 58 of the first 62 showed a cat.
- **Coarse to fine:** a 128-wide scan of every frame, with the better half decided at 768, keeps at least 95% of the clips the full 768-wide scan finds.

The limit: a query that names an action can outweigh the object. "A dog jumping" also finds jumping cats.

### Find the car, then read its plate {#find-the-car}

Half an hour of dash-cam footage: 1,863 frames, and 232 eight-second windows.

- A description of the scene, a red SUV braking directly ahead on a wet motorway in heavy rain, finds the moment among the first three frames, and among the first three windows, at 768, 256 and 128 wide.
- Within that moment, a second query, for the SUV's number plate, ranks first the one frame the plate can be read in.
- Qwen3.5-4B, given that frame and a way to say it cannot read the plate, reads it exactly. Given a frame where the plate is too far away, it answers "unreadable".

Coarse to fine twice: the moment by the scene, the frame by the detail, then the read. The limits: asked without a way to say "unreadable", the model invents a plate; and one frame later it misreads a Z as a 2.

### Ask in English, find it in Hindi {#english-finds-hindi}

Three questions in English about 27 seconds of Hindi film dialogue, searched among all 528 soundtrack windows of the three videos, the rest English music, speech and narration.

- Each question finds its moment among the first three windows from the sound alone, with no transcript. On 2026-10-22, two of the three came first.
- Fused by rank with the Hindi transcript, embedded as text, each moment comes first.

The limit: scores rank, they do not decide. A question with no answer still scores close to one with an answer.

## Known limits {#known-limits}

Each was found by a test:

- Transcription can produce a short fragment in another language on a near-silent or very short window, and can run to its output limit on music, leaving that window untranscribed with its reason.
- A score ranks moments; a threshold on it does not say "not found".
- A model reads a scene only at the frames that were sampled. Denser or full-resolution frames, decoded from the original on the host, are not done yet.

## Related {#related}

- [Search inside video](/video-search): the building blocks the scenarios compose.
- [Testing](/testing): testing a harness of your own.
