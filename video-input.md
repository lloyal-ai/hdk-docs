---
title: "Video input"
description: "How a reader's video becomes one attachment: the page asks the host's policy, refuses a clip too long before any byte moves, decodes and samples with its own decoder, pushes the original in resumable chunks, and sends one compose that the host checks, transcribes and commits."
lede: "Refused before a byte is uploaded, composed once everything is checked. The page decodes; the host never does."
---

<!--
Checked against source, 2026-10-24:
  lloyal-sdk  packages/ui/src/video.ts              ingestVideo: describe, refuse by duration, push the original, prepareVideo, compose, cancel
  lloyal-sdk  packages/media/src/clip.ts            ClipDecoder (duration, picture, frames, sound, dispose); prepareVideo; frameTimes; fitEdge; SoundtrackCutter; quietestCut
  lloyal-sdk  packages/media/src/video-sampling.ts  mediabunnyDecoder (platform decoding, then software where the platform refuses); captureFrames
  lloyal-sdk  packages/media/src/video-frame.ts     encodeVideoFrame (@lloyal-labs/media/node)
  lloyal-sdk  packages/media/src/content-urls.ts    pushBlob: chunked, resumable
  lloyal-sdk  packages/rig/src/distribution.ts      BlobUploads: /v2 blob upload sessions
  lloyal-sdk  packages/rig/src/video.ts             useVideoCommands: video:describe, video:compose, video:cancel
  lloyal-sdk  packages/binding/src/video.ts         VideoCommand, VideoEvent, VideoCapabilities
Tests:
  lloyal-sdk  packages/ui/test/video.test.ts        push, ingest, compose; refused from the container's duration before any byte; abort sends nothing
  lloyal-sdk  packages/media/test/clip.test.ts      sampling, stamping, mixing, placing late sound, cutting at the mark interval, abort
  lloyal-sdk  packages/rig/test/video-commands.test.ts  describe, compose, transcription, refusals, cancel
  lloyal-sdk  packages/rig/test/distribution.test.ts     chunked push, resume, digest, refusals
-->

A video enters a harness in one place, the page that holds the file, and becomes one attachment in one command. The page decodes, because that is where a codec is. The host never decodes video and never parses a container a stranger dropped in.

## The four steps {#steps}

`ingestVideo` from `@lloyal-labs/ui` runs them:

1. **Ask.** The page sends `video:describe` and gets back how this host composes a video: its sampling, the longest clip it takes, and the limits a soundtrack window must meet when anything the host runs hears. A clip longer than the host takes is refused from the container's own duration, before a byte is pushed.
2. **Push the original** as a blob, in chunks, over the [OCI distribution](https://github.com/opencontainers/distribution-spec) blob upload API the host serves at `/v2/…/blobs/uploads/`. A dropped chunk resumes from what the host reports it holds, and the blob is admitted only under the digest of the whole file. It is kept: it is what the reader brought.
3. **Sample and ingest.** Frames are sampled at the host's rate and each enters the store as an image. When something the host runs hears, the soundtrack is cut into windows and each enters as a recording.
4. **Compose.** One `video:compose` names every frame, every soundtrack window and the original. The host checks each reference, transcribes each window when a transcription service is bound, and commits one attachment.

```ts label="src/ui/parts/Composer.tsx"
import { ingestVideo, useHarness, useVideoCapabilities } from "@lloyal-labs/ui";
import { isVideoContainer } from "@lloyal-labs/media";

const { bridge } = useHarness();
const video = useVideoCapabilities();
const root = isVideoContainer(new Uint8Array(await file.slice(0, 64).arrayBuffer()))
  ? (await ingestVideo({ origin, bridge, file, capabilities: video, onProgress })).root
  : await ingestMedia(origin, new Uint8Array(await file.arrayBuffer()));
```

Serve the commands on the host, with the harness's config reader, so each video is described and composed under [`attachments.video`](/harness-yml#attachments) as it stands when it arrives:

```ts label="src/app.ts"
import { useVideoCommands } from "@lloyal-labs/rig";

const video = yield* useVideoCommands({ wire, config: runner.config });
```

## Sampling {#sampling}

- **Times.** Frames are `fps` apart, from the picture's first frame, up to `maxFrames`; a longer clip is sampled evenly across its length instead. Each frame is stamped with the time the decoder showed it, on the file's own clock. A frame shown for several sample times is kept once.
- **Size.** Each frame is scaled so its longer edge is at most `maxEdgePx`, and encoded as JPEG.
- **Sound.** The channels are mixed to mono, at a rate every hearing service admits. Sound that starts after the picture is placed at its own time, the gap silent.
- **Windows.** The soundtrack is cut into windows of the length the host asks for, [`attachments.video.soundtrackWindowSeconds`](/harness-yml#attachments), five seconds by default, each ending at the quietest point near its end and no longer than every service that hears admits. The length doesn't follow the frames' time marks: a transcript note joins the first mark at or after it, however the soundtrack was cut. When nothing the host runs hears, no soundtrack is cut at all.

The settings and their bounds are on [harness.yml](/harness-yml#attachments). [Configuring video](/video-configuration) is what each one trades.

## Transcription {#transcription}

With a [`transcription`](/harness-yml#transcription) service bound, the host transcribes each soundtrack window when the video is composed. A silent window is skipped. A window the service fails on is reported back as untranscribed, with its reason, and the video is composed without it. Without a transcription service the video still arrives, with no transcript and no error.

## Swapping the decoder {#decoders}

**What a decoder does, and all it does.** A decoder is media's `ClipDecoder`: `duration`, `picture`, `frames`, `sound` and `dispose`. `frames` yields, for each time asked, the frame shown at that time, encoded as a video frame, with the time it is shown from. `sound` yields decoded sound in order, each run at its own time.

**What stays the same whichever decoder reads the file.** `prepareVideo` is the procedure, written once against that contract: the times sampled, how frames are stamped and sized, the soundtrack's mix, its rate, its placement and its cut, and the compose it produces. A decoder swap cannot change what a model receives beyond the pixels and samples the decoder hands over.

**The decoders that exist.** In the page, `mediabunnyDecoder` reads the container with Mediabunny and decodes through WebCodecs. Where the platform's decoder refuses a stream, it reads on in software from where the platform stopped.

**Reading a clip from any runtime.** Ask `video:describe`, read through your decoder with `prepareVideo`, and send the compose it gives you:

```ts
import { prepareVideo } from "@lloyal-labs/media";

const prepared = await prepareVideo(decoder, capabilities, ingest, { signal, onProgress });
send({ type: "video:compose", requestId, ...prepared, source });
```

On a host with no canvas, `encodeVideoFrame` from `@lloyal-labs/media/node` encodes a decoded frame as the page does, at the same quality. The shipped host still never decodes video; choosing a decoder for it is not done yet.

## Refusals {#refusals}

Each is said in a sentence the reader sees, and none leaves a half-composed video behind:

- a clip longer than the host takes, before any byte is pushed;
- more frames than the host samples;
- a reference that is not an admitted root, a soundtrack window that is not a recording, runs past the clip or overlaps the one before it, before anything is transcribed;
- a chunk whose range does not describe its body, and a whole whose digest does not match.

## Cancelling {#cancelling}

Aborting `ingestVideo` stops the decoder and ingests nothing more. Aborted as composing begins, the page sends nothing; aborted after, it sends `video:cancel`, and the host stops mid-transcription and composes nothing. A video already composed is not cancelled.

## Progress {#progress}

The page reports `sampling`, then `ingesting` with how many of the frames are in. The host reports `transcribing`, window by window, as `video:progress`.

## Live capture {#live-capture}

`captureFrames` reads frames from a live track, such as a camera, in groups. Each group is ingested and composed as a live capture: a video with no original and no transcript. It needs a browser that can read frames from a track, which Chromium and Electron can.

## Related {#related}

- [Content-addressed video storage](/video-storage): what the compose commits.
- [Video protocol reference](/video-protocol): every command and event.
