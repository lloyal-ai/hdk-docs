---
title: "Video inference"
description: "What a reasoning model is handed for a video: its frames in order with time marks, laid out as llama.cpp's video helper lays them out, fused in pairs by a projector with temporal merge, the transcript beside the frames at its own times, priced exactly before anything runs. And any span of a stored video as a video of its own."
lede: "Frame fusion: half the tokens per second of video. Hours of video keep fusing, and the price is known before anything is read."
---

<!--
Checked against source, 2026-10-24:
  liblloyal   include/lloyal/mtmd.hpp               VideoFrames; video_layout: "Video:", a mark after the frame crossing each interval, counted from the first frame; notes join the first mark at or after their time
  lloyal-sdk  packages/media/src/video.ts           resolveVideo (VideoInput: frames, timestampsMs, timestampIntervalMs, notes); markInterval; videoWindow; noteOf
  lloyal-sdk  packages/rig/src/admitted.ts          admitted(attachments, { context, reserve, free }): priced with deltaCells before anything is read in
  lloyal-sdk  packages/sdk/src                      prefillUserMultimodal; one ordered prefill
Tests:
  liblloyal   tests/integration/multimodal_integration_test.cpp  a video's frames tokenize as the server's video does
  lloyal-sdk  packages/media/test/video.test.ts     one typed input with its transcript as notes; speech before a late picture at the first frame; marks two frames apart past 5 min 20 s; a window's frames, soundtrack and speech at the video's own times
  lloyal-sdk  packages/rig/test/admitted.test.ts    a video is one input; priced against the share, what is free and the reserve
-->

## What the model is handed {#what-the-model-is-handed}

A stored video reaches a reasoning model as **one input behind one marker**, not a stack of separate pictures: the frames in time order, each with the time it was sampled at, and the transcript beside them. `admitted` checks the attachment and hands it on, and the harness prefills it with the question:

```ts label="src/harness/brief.ts"
const seen = yield* admitted(attachments, { context: config().attachments.context });
if ("refused" in seen) return yield* wire.send({ type: "ui:error", message: seen.refused });
yield* waitUntilSettled(session.prefillUserMultimodal(text, seen.bitmaps, { attachments: seen.projected }));
```

The native runtime lays it out as llama.cpp's own video helper does: the text `Video:`, then each frame, with a time mark such as `[0m5.00s]` after the frame that crosses each interval, five seconds by default. A test in liblloyal holds the two to the same tokens, rows and positions from the same frames. [The comparison with llama.cpp](/video#video-and-llama-cpp) is what differs before the layout.

## Frame fusion {#frame-fusion}

A projector with temporal merge, the Qwen-VL family's, takes two neighbouring frames as one set of tokens. Every frame is free to fuse with its neighbour, so a video costs about half what its frames would as separate images.

**Long clips keep fusing.** A time mark between two frames stops them fusing. Marks every five seconds are fine while frames are dense, but past 5 min 20 s at the default 64 frames, frames fall further apart than the marks and nothing would fuse. So a video is composed with its marks at the sampling's own interval or at twice the widest gap between its frames, whichever is longer. No two neighbouring frames are both followed by a mark, and frames fuse in pairs at any length. The trade is coarser marks: about one every 112 seconds for an hour at the default.

## What was said, beside what was shown {#transcript}

Each transcript segment is placed as a note, ` Speech: "…"`, joined to the first time mark at or after the moment its window ends. So what was said sits next to what was shown, and a note adds no text between frames, leaving fusion as it was. Speech heard before a late picture starts is placed at the first frame, where the model first sees the clip. Notes past the last mark close the video.

## What it costs {#cost}

A video's cost in context cells is measured exactly before it is prefilled, with nothing projected. Give `admitted` the share of the context a turn's attachments may fill, and a video over it is refused with a sentence that says what it would cost and what is allowed. A video that fits the share but not what the context has free now is refused too, and so is one that would leave the run less room than it needs to start, given a `reserve`. Nothing is read in when a turn is refused. [Cap what attachments take](/attachments#attachment-budget) has the three refusals and their wording.

## Windows {#windows}

`videoWindow` makes any span of a stored video a video of its own, at the video's own times, from the blobs already stored. Only the window's timeline and its share of the transcript are written; its frames, its recordings and the original are the video's own.

```ts
import { videoWindow } from "@lloyal-labs/media";
import { Attachments } from "@lloyal-labs/lloyal-agents";

const store = yield* Attachments.expect();
const window = videoWindow(store, video, { fromMs: 90_000, toMs: 180_000 });
```

A window keeps:

- the frames sampled from `fromMs` to `toMs`, both included;
- every soundtrack window and transcript segment that overlaps the span, whole. A soundtrack window is cut at a quiet point, so one that overlaps an edge brings its sound from beyond the span with it.

A window is laid out as a clip's start is: its marks are counted from its first frame and say the video's own times, so a model reading a window cites the moments the video plays. It keeps the interval its video's marks were recorded at. A span with no frame in it, one that ends before it starts, or a root that is not a video is refused.

## The native path {#native-path}

A turn's media is prefilled in one ordered pass: the text, then each input in marker order, a video's frames encoded one chunk at a time. An input the context cannot lay out is refused when it is priced, never thrown into the run. A context is freed only after the work already running on it settles, so a video read in while a session ends never leaves native memory behind.

## Related {#related}

- [Content-addressed video storage](/video-storage): what a video and its windows are.
- [Search inside video](/video-search): embedding a video or a window.
- [Attachments and documents](/attachments): how any attachment reaches a run.
