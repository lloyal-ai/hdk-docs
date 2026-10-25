---
title: "Video"
description: "What lloyal does with a video: the page decodes it, the host stores it by digest, a reasoning model is handed any span of it, and one embedding model places its frames, its sound and its words in one space with text and images. Every model runs in the process that holds the video."
lede: "Find a moment by what was seen, said or heard, in any language, and hand a model that moment. One video pipeline and one embedding model, in the same process as the model that reasons about it."
---

<!--
Checked against source, 2026-10-24:
  lloyal-sdk  packages/media/src/video.ts           composeVideo, resolveVideo, videoWindow, markInterval
  lloyal-sdk  packages/media/src/clip.ts            ClipDecoder, prepareVideo
  lloyal-sdk  packages/rig/src/providers/embedding.ts  createEmbedder: parts, measure, framing, a video's soundtrack when the model hears
  lloyal-sdk  packages/rig/src/vector-index.ts      VectorIndex: trained widths, scan and decide
  lloyal-sdk  packages/rig/src/fuse-ranks.ts        fuseRanks: reciprocal rank fusion
  lloyal-sdk  packages/rig/src/models.ts            embeddinggemma-2-q8 and its projector; dimensions 768, 512, 256, 128
  lloyal.node test/scenario-integration.ts          the three scenarios (How video is verified)

The comparison with llama.cpp, moved from attachments.md, checked against source, 2026-10-21:
  liblloyal   include/lloyal/mtmd.hpp             video_layout: "Video:", a timestamp after each frame crossing the next interval, frames mergeable
  liblloyal   tests/integration/multimodal_integration_test.cpp  "a video's frames tokenize as the server's video does" (chunks, tokens, rows, positions)
  llama.cpp   tools/mtmd/mtmd-helper.h/.cpp       fps_target 4, timestamp_interval_ms 5000; ffmpeg/ffprobe subprocesses; -f rawvideo rgb24 (no audio); per-frame ids
  lloyal.node CMakeLists.txt                      MTMD_VIDEO OFF (FORCE): no runtime ffmpeg
  lloyal-sdk  packages/media/src/video-sampling.ts  frameTimes: 4 fps, maxFrames 64 spread evenly
  lloyal-sdk  packages/media/src/image.ts         sharp normalises images before the projector
-->

A video in a lloyal harness is one attachment, addressed by one digest, from the moment a reader drops it on the page to the moment a report cites a second of it. The page decodes it. The host keeps its frames, its soundtrack and its transcript in a content-addressed store. A reasoning model is handed the whole of it or any span of it, and the embedding service, EmbeddingGemma 2 by default, places its frames, its windows and its sound in one space with text and images. Every one of those models runs in the process that holds the video.

## What becomes possible {#what-becomes-possible}

- **Ask in English, find it in Hindi, by its sound.** A question in one language finds speech in another from the audio alone, with no transcript in between. Fused with the transcript by rank, each moment in the test comes first. [How video is verified](/video-verification#english-finds-hindi)
- **Sensor fusion.** What was heard and what was said rank moments separately, and rank fusion combines the rankings without comparing their scores. [Search inside video](/video-search#sensor-fusion)
- **Coarse to fine from one encode.** Every vector can be cut to 512, 256 or 128 wide and still compared. Scan everything at 128, decide the shortlist at 768, from the same encode. [Search inside video](/video-search#coarse-to-fine)
- **Coarse to fine twice.** In half an hour of dash-cam footage, a description of the scene finds the moment, a second query finds the one frame its number plate can be read in, and a vision model reads the plate there, and says "unreadable" where it cannot. [How video is verified](/video-verification#find-the-car)
- **A video's vector hears it.** A video embedded through the service carries its soundtrack with its frames, so a search finds a moment by its sound as well as by its picture. [Search inside video](/video-search#heard)
- **Any span of a stored video, with nothing copied.** A window of a stored video is a video of its own, at the video's own times, built from the blobs already stored. [Video inference](/video-inference#windows)
- **What it costs, known before anything runs.** A video's cost in context cells is measured exactly before it is projected or embedded, and one that does not fit is refused with a sentence that says why. [Video inference](/video-inference#cost)
- **One digest, end to end.** The digest that pins a video in the store is the one a citation names and the player opens. [Content-addressed video storage](/video-storage), [Playback and citations](/video-playback)

## How it compares with llama.cpp {#video-and-llama-cpp}

**What the model receives is laid out by the same rule.** lloyal lays a video out as llama.cpp's own video helper does, the one behind `llama-server` and `llama-mtmd-cli`:

- the text `Video:`;
- then each frame;
- a timestamp such as `[0m5.00s]` after every frame that crosses the next mark, every five seconds by default; on a sparsely sampled clip the marks are spaced at least twice the widest gap between frames, so no two neighbouring frames are both followed by one;
- every frame free to fuse with its neighbour.

A test in liblloyal holds the two to the same result from the same frames and mark spacing, chunk for chunk: the same text tokens, the same image rows and the same positions. What differs is what lloyal chooses before the layout: which frames, and on a sparsely sampled clip, the spacing of its marks.

**Everything in front of that layout differs:**

| | llama.cpp / `llama-server` (`MTMD_VIDEO=ON`) | lloyal |
|---|---|---|
| Who decodes | mtmd shells out to `ffmpeg` and `ffprobe` on the host | The page, with WebCodecs and Mediabunny; the host never runs ffmpeg |
| What native code receives | A video file | Decoded frames and their times; `MtmdSource` never sees a container |
| Sampling | 4 frames a second by default (`--video-fps`), no frame cap | A frame rate up to a frame cap, then spread evenly, and a longest edge, each an [`attachments.video`](/harness-yml#attachments) setting; JPEG |
| Frame times | Computed from the frame's index and the rate | The actual sample times, in milliseconds |
| Frame ids | `"{hash}+{n}"` per frame, which `llama-server` keys its cache on | None |
| Sound | Not part of the helper's layout | Transcribed separately and placed as text at its own time between frames; an embedding model that hears is given the windows themselves |
| Long clips | Fuses at its default rate, where frames are dense; at a rate low enough that frames fall further apart than the marks, nothing fuses | Keeps fusing: once frames are sparse, marks are laid out at twice the widest gap between frames instead of every five seconds |
| WebP images | Decoded through ffmpeg | Normalised by the host before native code |

**What this unlocks over stock llama.cpp:**

- **Video without ffmpeg on the machine.** Stock video input needs an `ffmpeg` binary on the host's `PATH`, started as a subprocess for every clip. lloyal.node builds mtmd with that support off, and the browser does the decoding. A desktop app ships with nothing to install beside the model. A served host never runs an external decoder over a file a stranger dropped in, and never parses its container.
- **The same input on every machine.** Native inference is given the frames the page sampled, not whatever an installed ffmpeg build decodes. A run reads the same input on every platform the addon ships for, and replays the same input from the store. The answers to it can still differ between machines, as any model's do across backends.
- **Video on the web, decoded by the reader's own machine.** The page holds the file and the browser decodes it, often in hardware, so a clip works the same in a browser tab as in the desktop app. The original uploads in chunks that resume after a dropped connection, and the host keeps it to play back.
- **The model hears the video.** The stock helper reads the picture only. lloyal transcribes the soundtrack and places each passage at its own time between the frames, so the model can answer what someone says at a moment, or what a slide shows while they talk over it. An embedding model that hears is given the soundtrack itself, so a search finds a moment by its sound, not only by its words.
- **Moments a reader can open.** Timestamps are the times the frames were sampled at, so a report can cite `attachment://<digest prefix>/t/1m24.87s` and the player opens at the frame the model saw.
- **One projection for every agent.** A video is projected once, onto the conversation, and every agent forks from it. Ten agents asking about one clip pay for it once.
- **A cost known before anything is read.** A video is capped at its frame limit, 64 by default, and priced exactly before it is projected. With an [attachment budget](/attachments#attachment-budget), one that would not fit is refused with a sentence that says why, instead of failing halfway through a turn.

**What it costs.** Stock sampling takes every quarter second of a clip, so it sees every moment, but a ten-minute clip becomes 2,400 frames, far more than a 32,768-token context holds. The frame cap, 64 by default and set by [`attachments.video.maxFrames`](/harness-yml#attachments), is what lets a video fit beside the question; the price is coverage on a long clip. At the default an hour-long recording is seen as one frame about every 56 seconds. Frames keep fusing at any length, because a sparse clip's time marks are spaced at least two frames apart; the trade is coarser marks, about one every 112 seconds for an hour.

## The life of a video {#the-life-of-a-video}

1. **Taken.** The page asks the host how it composes a video, refuses a clip longer than the host takes before any byte moves, samples frames and cuts the soundtrack with its own decoder, and pushes the original in resumable chunks. [Video input](/video-input)
2. **Composed.** One command names every frame and soundtrack window. The host checks each, transcribes each window when a transcription service is bound, and commits one manifest whose digest pins the whole video. [Content-addressed video storage](/video-storage)
3. **Projected.** A reasoning model is handed the frames in order with their time marks and the transcript beside them, priced before anything runs. [Video inference](/video-inference)
4. **Embedded.** The embedding service places the video, a window of it, a frame, a recording or a question in one space. [Search inside video](/video-search)
5. **Cited and played.** A report cites a moment by the video's digest and the time the video marks; the player opens the original there. [Playback and citations](/video-playback)

## Words these pages use {#words}

| Word | Means |
|---|---|
| root | The digest of a video's manifest: the one address everything below is reached from |
| representation | One blob a model is given: a frame, a soundtrack window, the transcript |
| frame | A picture sampled from the clip at a time on the clip's own clock |
| soundtrack window | A stretch of the soundtrack, cut at a quiet point, kept as a recording |
| transcript | What the transcription service heard, window by window, on the clip's clock |
| timeline | The manifest's config: which representation is which, and when |
| window | A span of a stored video, kept as a video of its own |
| moment | A point on a video's clock, as a citation names it |
| time mark | The timestamp text placed after a frame, `[1m24.87s]` |
| frame fusion | A projector with temporal merge taking two neighbouring frames as one set of tokens |
| rank fusion | Combining rankings by position alone |
| cell | One position in a model's context |
| visual detail budget | How many tokens one image or frame is read as |
| Matryoshka width | A width a vector can be cut to and still compared: 768, 512, 256 or 128 for EmbeddingGemma 2 |

## Not done yet {#not-done-yet}

- **Recall across a library:** attaching a video, an image or a sound and finding what is like it among everything a user has kept.
- **Searching a window by one sense:** a window's vector always holds its frames and, when the model hears, its sound together.
- **Frames beyond what the page sampled:** decoding denser or full-resolution frames from the original on the host.

## Related {#related}

- [Attachments and documents](/attachments): how any attachment reaches a run, and what a turn's attachments may take of the context.
- [Services](/services): the embedding and transcription services a video uses.
- [harness.yml](/harness-yml#attachments): every video setting, with its bounds.
