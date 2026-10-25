---
title: "Content-addressed video storage"
description: "A stored video is one OCI image manifest: its frames, soundtrack windows, transcript and original as layers, its timeline as the typed config. One digest pins the whole video, a frame is stored once however many videos share it, and every read is checked against its digest."
lede: "One digest pins a whole video. A frame is stored once, and every read is checked."
---

<!--
Checked against source, 2026-10-24:
  lloyal-sdk  packages/media/src/file-store.ts      FileAttachmentStore: oci-layout, index.json, blobs/sha256; temp-then-rename; nothing deletes
  lloyal-sdk  packages/media/src/video.ts           VideoMeta, Transcript, composeVideo, commitVideo, storedVideo, VIDEO_CONFIG_TYPE, TRANSCRIPT_MEDIA_TYPE
  lloyal-sdk  packages/media/src/attachment.ts      manifest composition; ROLE_ANNOTATION source; representationsOf, sourceOf
  lloyal-sdk  packages/media/src/store.ts           ContentLost
  lloyal-sdk  packages/rig/src/content-routes.ts    /v1/media/<manifest>, /config, /source (Range), /representations/<i>
Tests:
  lloyal-sdk  packages/media/test/video.test.ts     composes one manifest reusing frame blobs; soundtrack on the timeline; a drifted transcript refuses replay; timelines that would not read back are refused
  lloyal-sdk  packages/rig/test/video-commands.test.ts  names nothing in its timeline that its OCI graph leaves out
  lloyal-sdk  packages/rig/test/content-routes.test.ts  never serves drifted bytes; the source through its manifest; range reads
-->

A video is kept in the project's `media/` store, the same content-addressed store every attachment uses: an [OCI Image Layout](https://github.com/opencontainers/image-spec/blob/main/image-layout.md), the format container registries use. Every blob is named by the SHA-256 of its bytes, so the same bytes are stored once, and anything that reads OCI can read the store.

## The video manifest {#the-manifest}

One composed video is one OCI image manifest:

| Part | Holds |
|---|---|
| config, `application/vnd.lloyal.video.v1+json` | the timeline: which layer is which, and when |
| a layer per frame | an image, in time order; the page samples JPEG |
| a layer per soundtrack window | a recording, PCM WAV |
| a transcript layer, `application/vnd.lloyal.transcript.v1+json` | what the transcription service heard, when it heard anything |
| the source layer | the original as the reader attached it, when it was pushed |

The manifest's digest is the video's **root**: the one address that pins every frame, window, word and the original together. A citation names it, the player opens it, and a model is handed what it names.

Everything the timeline names is in the manifest's own graph, so a copy of a video carries everything it needs. Frames and recordings are referenced from the blobs they were ingested as, not copied: a frame two videos share is stored once.

## The timeline {#the-timeline}

| Field | Means |
|---|---|
| `width`, `height` | the frames' size, the same for every frame |
| `durationMs` | the clip's length |
| `frames[]` | `{ tMs, frame }`: when each frame was sampled, on the clip's own clock, and which layer it is |
| `poster` | the frame shown before playback |
| `sampling` | `{ fps, timestampIntervalMs, maxFrames }`: how the clip was sampled, and the interval its time marks were laid out at |
| `soundtrack[]` | `{ startMs, endMs, audio }`: each window's span and which layer it is; absent when the clip had no soundtrack |

A timeline that would not read back, frames out of order or past the clip, a soundtrack window off the timeline, is refused before anything is written.

The transcript is `{ provenance, segments[] }`, each segment `{ startMs, endMs, text, language? }` on the same clock.

## Every read is checked {#checked}

A blob is read back only if its bytes still hash to its name. A frame, a window, the timeline or the transcript that has drifted on disk raises `ContentLost`, and a video whose transcript drifted refuses to be replayed rather than replaying something else. The content plane never serves drifted bytes under their digest.

The store never deletes. A blob is written beside a temporary name and moved into place, so a reader never sees half a blob.

## Reading a stored video {#reading}

The content plane serves a video by its root:

| Route | Answers |
|---|---|
| `GET /v1/media/<root>` | the manifest |
| `GET /v1/media/<root>/config` | the timeline |
| `GET /v1/media/<root>/representations/<i>` | a frame, a window or the transcript, as the model was given it |
| `GET /v1/media/<root>/source` | the original, with range requests, for playback |

The store on disk is a plain OCI layout, so `oras` and other OCI tools read it as they read any image.

## Related {#related}

- [Video input](/video-input): how a video is composed into the store.
- [Attachments and documents](/attachments#the-store): the store every attachment shares.
