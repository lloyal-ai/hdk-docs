---
title: "Configuring video"
description: "Every setting that shapes a video in a lloyal harness, by the stage it acts on: how a clip is sampled, how long a clip may be, what a frame costs, what a turn's attachments may take of the context, what is transcribed and what the embedding model reads. Each links to its key, its bounds and its default."
lede: "Every setting has bounds, and a value outside them is refused. Here is what each one trades, stage by stage."
---

<!--
Checked against source, 2026-10-25:
  lloyal-sdk  packages/rig/src/config.ts            attachmentSettings, modelSettings: keys, bounds, defaults; the attachments.video keys are boot
  lloyal-sdk  packages/rig/src/video.ts             useVideoCommands reads attachments.video when a video is described or composed
  lloyal-sdk  packages/rig/src/admitted.ts          context, reserve, free
  lloyal-sdk  packages/rig/src/content-routes.ts    maxUploadBytes
  lloyal-sdk  packages/rig/src/distribution.ts      MAX_UPLOAD_CHUNK_BYTES; registry
Tests:
  lloyal-sdk  packages/rig/test/config-layering.test.ts  a value out of range fails the load, naming the range; a bounded number from the environment
  lloyal-sdk  packages/rig/test/video-commands.test.ts   describes and composes under the configured policy, read when asked; at the edges of every setting's range
-->

Each key's bounds, default and when a change applies are on [harness.yml](/harness-yml), read off the tables the keys are declared in. This page is what each setting does to a video.

## Taking a clip {#taking}

| Setting | What it trades |
|---|---|
| [`attachments.video.fps`](/harness-yml#attachments) | How often a frame is sampled, up to the frame cap. More frames see more of a short clip and cost more cells. |
| [`attachments.video.maxFrames`](/harness-yml#attachments) | The most frames a video keeps. A clip longer than the cap allows at `fps` is sampled evenly instead, so the cap decides how much of a long clip is seen. |
| [`attachments.video.maxEdgePx`](/harness-yml#attachments) | The longest edge a frame is scaled to: detail against what each frame costs. |
| [`attachments.video.soundtrackWindowSeconds`](/harness-yml#attachments) | How long each window of the soundtrack runs. Each is transcribed on its own and becomes one caption, one span of search by sound, and one note beside the frames. Shorter is finer; longer means fewer transcriptions. It doesn't follow the frames' time marks. |
| [`attachments.video.maxDurationSeconds`](/harness-yml#attachments) | The longest clip a harness takes, refused before any byte is pushed. Unset, a clip of any length is taken; length costs upload and one transcription per soundtrack window. |

These are set in `harness.yml` and fixed for the run: the page samples a clip by the policy the host described to it, so a change takes a restart. The time marks between frames are not a setting: they follow the frames' spacing, so frames keep fusing at any length.

## Hearing it {#hearing}

| Setting | What it trades |
|---|---|
| [`model.transcription`](/harness-yml#transcription) | Its presence transcribes each soundtrack window when a video is composed. Absent, a video arrives with no transcript. |
| [`model.transcription.maxBytes`, `maxDurationSeconds`, `maxSampleRate`](/harness-yml#transcription) | The limits a soundtrack window is cut and written to meet, so every window is one the service admits. |

When an embedding model that hears is bound as well, the page cuts each window to meet what both admit.

## Seeing it {#seeing}

| Setting | What it trades |
|---|---|
| [`model.vision.minTokens`, `model.vision.maxTokens`](/harness-yml#vision) | What one frame costs the reasoning model. A frame is an image, so this is the main lever on what a video costs. |
| [`attachments.context`](/harness-yml#attachments) | The share of the context a turn's attachments may fill. A video over it is refused before anything is read in. |

The harness also passes `admitted` a `reserve`, the room a run needs once the media is in, and `free`, the room a new conversation will have. Both are the harness's own, from the budgets its runs use. [Cap what attachments take](/attachments#attachment-budget) is how.

## Embedding it {#embedding}

| Setting | What it trades |
|---|---|
| [`model.embedding`](/harness-yml#embedding) | Which model places a video in one space with text, images and sound; EmbeddingGemma 2 when it names none. |
| [`model.embedding.context`](/harness-yml#embedding) | The most cells one input may take, and so the longest window that can be embedded whole. A longer input is refused, never truncated. |
| [`model.embedding.vision.minTokens`, `maxTokens`](/harness-yml#embedding) | What one frame costs the embedding context: detail against how many frames fit in one input. |

## The host and the page {#host-and-page}

| Setting | What it trades |
|---|---|
| The content plane's `maxUploadBytes`, 8 MiB by default | The largest single attachment posted whole. A video's original is pushed in chunks instead. |
| The blob surface's chunk ceiling, 64 MiB | The largest chunk of an original one request may carry. |
| `BlobUploads(…, { registry: true })` | Off by default: the host admits only a video's original. On, it is a full registry that admits and serves any blob. |
| The composer's accepted types | Which files a reader can drop: add `video/*`. |
| The desktop Content-Security-Policy | `media-src attachment: blob:`, so the player can play the original and its tracks. |
