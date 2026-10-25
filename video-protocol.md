---
title: "Video protocol reference"
description: "Every command a page sends to compose a video and every event the host answers with, field by field, and the content plane's routes a video is read through."
lede: "Every command and event a video travels on, field by field. References only: bytes travel over HTTP."
---

<!--
Checked against source, 2026-10-24:
  lloyal-sdk  packages/binding/src/video.ts         VideoCommand, VideoEvent, VideoCapabilities, VideoFrameRef, VideoAudioRef, UntranscribedWindow
  lloyal-sdk  packages/rig/src/video.ts             useVideoCommands: the host's handlers
  lloyal-sdk  packages/rig/src/content-routes.ts    /v1/media routes
  lloyal-sdk  packages/rig/src/distribution.ts      /v2 blob upload routes
Tests:
  lloyal-sdk  packages/rig/test/video-commands.test.ts  every command, its refusals, progress, cancel, a duplicate request id
  lloyal-sdk  packages/rig/test/distribution.test.ts    every /v2 route
-->

The commands and events travel on the harness's wire like any other, and carry references only. A frame, a soundtrack window and the original reach the host over HTTP first, and a command names them by descriptor. Serve them with `useVideoCommands` from `@lloyal-labs/rig`; `ingestVideo` from `@lloyal-labs/ui` sends them.

## Commands {#commands}

| Command | Fields | Asks |
|---|---|---|
| `video:describe` | none | How this host composes a video. Answered by `video:capabilities`. |
| `video:compose` | `requestId`, `frames`, `audio?`, `durationMs`, `source?` | Compose these into one video. Answered by `video:composed`, `video:error` or `video:cancelled`, with progress along the way. |
| `video:cancel` | `requestId` | Stop a compose in flight. Nothing is composed. |

**`video:compose`, field by field:**

| Field | Is |
|---|---|
| `requestId` | The page's name for this compose. A second compose under an id already in flight is refused, and the first stays cancellable. |
| `frames` | `{ root, tMs }[]`: each sampled frame's admitted image root, and the time it was sampled at, in order |
| `audio` | `{ root, startMs, endMs }[]`: each soundtrack window's admitted recording, and the span of the clip it covers, in order and not overlapping |
| `durationMs` | The clip's length |
| `source` | The original, pushed as a blob, kept as the video's source |

## Events {#events}

| Event | Fields | Says |
|---|---|---|
| `video:capabilities` | `capabilities` | How this host composes a video (below) |
| `video:progress` | `requestId`, `phase: "transcribing"`, `done`, `total` | How many soundtrack windows are transcribed |
| `video:composed` | `requestId`, `root`, `untranscribed` | The composed video's root, and each window the host could not transcribe, `{ startMs, endMs, reason }` |
| `video:error` | `requestId`, `message` | Why nothing was composed, in a sentence a reader can be shown |
| `video:cancelled` | `requestId` | The compose stopped and nothing was composed |

**`capabilities`, field by field:**

| Field | Is |
|---|---|
| `sampling` | `{ fps, timestampIntervalMs, maxFrames, maxEdgePx, soundtrackWindowMs }`: how the host samples, from [`attachments.video`](/harness-yml#attachments). `soundtrackWindowMs` is the length the page cuts the soundtrack into, in milliseconds, from `soundtrackWindowSeconds` |
| `maxDurationMs` | The longest clip the host composes, when it sets a limit. The page refuses a longer one before pushing any byte. |
| `soundtrack` | The limits each soundtrack window must meet to be kept, or `null` when nothing the host runs hears. The page cuts the soundtrack only when there are limits. |

## Routes {#routes}

**Uploading the original** ([OCI distribution](https://github.com/opencontainers/distribution-spec) blob push):

| Route | Does |
|---|---|
| `GET /v2/` | The API version check |
| `POST /v2/<name>/blobs/uploads/` | Opens an upload session, or uploads in one request with `?digest=` |
| `PATCH /v2/<name>/blobs/uploads/<id>` | Appends the next chunk; `Content-Range` must start where the last ended |
| `GET /v2/<name>/blobs/uploads/<id>` | How far the session got, to resume from |
| `PUT /v2/<name>/blobs/uploads/<id>?digest=` | Closes the session: the whole is checked against the digest, then admitted |
| `DELETE /v2/<name>/blobs/uploads/<id>` | Cancels the session |
| `HEAD /v2/<name>/blobs/<digest>` | Whether a blob is stored |

**Reading a video** ([Content-addressed video storage](/video-storage#reading)): `GET /v1/media/<root>`, `/config`, `/representations/<i>` and `/source`, the last with range requests.

## Related {#related}

- [Video input](/video-input): the order these are sent in.
