---
title: "Attachments and documents"
description: "Let readers attach images, PDFs and video: bytes go to a content-addressed store, never to the model or the wire; an image is projected once for every agent; a document is searched and read, and a page is shown to the model only when an agent asks to see it; a video reaches the model as one video, its soundtrack as a transcript."
lede: "Let a reader drop in a photo, a PDF or a clip — and pay for only the parts the agents actually need to see."
---

<!--
Checked against source and a 1.13.0 research scaffold, 2026-09-30:
  lloyal-sdk  packages/rig/src/admitted.ts        admitted(descriptors): shape (asAttachment) → store (materialize) → sight (service("vision")) → size (deltaCells, when a context share is given)
  lloyal-sdk  packages/rig/src/media-store.ts     media/ at the project root, OCI Image Layout, never dev-gated
  scaffold    research README.md                  "The media store", "Attach something" (the four laws)
  scaffold    research src/harness/brief.ts       admitted(attachments); waitUntilSettled(session.prefillUserMultimodal(text, bitmaps, { attachments }))
  scaffold    research src/protocol.ts            attachments?: Descriptor[] on the submit command
  scaffold    research src/app.ts                 createDocumentsAbility
  lloyal-sdk  packages/abilities/documents/ability.json  tools search_documents/read_document/view_page; services reranker + vision
  lloyal-sdk  README.md                           the content plane (duplex: projection in, citation out)

Video, checked against source, 2026-10-14:
  lloyal-sdk  packages/ui/src/video-player.tsx     VideoPlayer: Video.js skin; thumbnails, captions and chapter tracks from videoTracks
  lloyal-sdk  packages/ui/src/video-view.ts        videoView, videoTracks
  lloyal-sdk  packages/ui/src/video.ts            ingestVideo: push the original, sample frames, cut soundtrack windows, one video:compose
  lloyal-sdk  packages/rig/src/video.ts           useVideoCommands: video:describe / video:compose; transcription read from Services
  lloyal-sdk  packages/media/src/video.ts         composeVideo, resolveVideo, VideoMeta, the transcript representation
  lloyal-sdk  packages/media/src/content-urls.ts  pushBlob (chunked, resumable), parseAttachmentMoment
  lloyal-sdk  packages/rig/src/distribution.ts    BlobUploads: the /v2 blob upload sessions
  lloyal-sdk  packages/rig/src/content-routes.ts  range reads of the original

Video against llama.cpp, checked against source, 2026-10-21:
  liblloyal   include/lloyal/mtmd.hpp             video_layout: "Video:", a timestamp after each frame crossing the next interval, frames mergeable
  liblloyal   tests/integration/multimodal_integration_test.cpp  "a video's frames tokenize as the server's video does" (chunks, tokens, rows, positions)
  llama.cpp   tools/mtmd/mtmd-helper.h/.cpp       fps_target 4, timestamp_interval_ms 5000; ffmpeg/ffprobe subprocesses; -f rawvideo rgb24 (no audio); per-frame ids
  lloyal.node CMakeLists.txt                      MTMD_VIDEO OFF (FORCE): no runtime ffmpeg
  lloyal-sdk  packages/media/src/video-sampling.ts  frameTimes: 4 fps, maxFrames 64 spread evenly
  lloyal-sdk  packages/media/src/image.ts         sharp normalises images before the projector
-->

The research template takes attachments: drop a photo, a PDF or a video on the composer and ask about it. This page is how that works, and what to copy into your own harness.

## Three rules {#three-rules}

- **Bytes go to the store, never to the model or the wire.** An attachment is posted to the host's content plane, which works out what it is, normalises an image or reads a PDF into pages, and commits the bytes to `media/` in the project. From then on, commands, events and the kept record carry only its **digest**.
- **An image is projected once.** It goes onto the trunk before the agents fork, so every agent attends the same cells: *N* agents cost one projection.
- **A document is read, not rendered.** Its text is staged — listed on the shared spine, costing nothing until an agent reaches for it — and a page becomes an image in the model's context only when an agent decides it needs to see it.

## The store {#the-store}

`media/` at the project root is a content-addressed store in the **OCI Image Layout** — the format container registries use. Every blob is named by the SHA-256 of its bytes, so the same bytes are stored once, a citation that names a digest can only mean them, and anything that reads OCI can read the store: `oras` can push a run's media to any registry.

It sits beside `models/`, apart from what the app writes, because it is what the app was **given**. It outlives every session: a reopened brief finds its pictures and documents there again. It is never switched off, because a run whose inputs were not addressed cannot be replayed.

## Take an attachment {#take-an-attachment}

The command carries descriptors, not bytes:

```ts label="src/protocol.ts"
import type { Descriptor } from "@lloyal-labs/media";

export type Command =
  | { type: "submit_query"; query: string; attachments?: Descriptor[] }
  // …
```

A descriptor arriving from a client is a **claim**, so check it once with `admitted`, then project what needs projecting:

```ts label="src/harness/brief.ts"
import { admitted } from "@lloyal-labs/rig";
import { waitUntilSettled } from "@lloyal-labs/lloyal-agents";

const seen = yield* admitted(attachments);
if ("refused" in seen) return yield* wire.send({ type: "ui:error", message: seen.refused });

// Images onto the trunk, once, before any agent forks.
yield* waitUntilSettled(session.prefillUserMultimodal(text, seen.bitmaps, { attachments: seen.projected }));
```

`admitted` asks three questions in order: is this the kind of thing that can be an attachment; is the content really in the store (a forged descriptor fails here); and — only for what is actually pixels — is there a `vision` service to see it. A document needs no projector. A refusal moves nothing; say it and return.

Pass `seen.roots` to the pool as `attachments`, and every tool call can see which files are available to the run.

## Documents {#documents}

The documents Ability gives agents three tools over what was attached:

| Tool | Does |
|---|---|
| `search_documents` | Narrows lexically first, then reranks and keeps the best passages within a token budget. It always scores in explore stance: an attached document *is* the on-topic universe. |
| `read_document` | Returns the exact text — only the part this agent has not already read. Ask for a page and you get the whole sections that touch it, so a table across a page break stays whole. |
| `view_page` | Hands the model one page, or one figure on it, as an image. Only pages worth the cells qualify — the first page, a page with no text, one with images, drawings, tables or figures; a text-only page refuses and points back to `read_document`. |

All three hand the model a ready-made citation, `attachment://<digest prefix>/page/<n>`, so it copies a citation rather than inventing one. The view resolves the prefix against digests it already holds; click it and that page opens.

Enable it as the research template does:

```ts label="src/app.ts"
import { createDocumentsAbility } from "@lloyal-labs/documents-ability";

export const abilities = [createCorpusAbility, createWebAbility, createDocumentsAbility];
```

It declares two services — `reranker` and `vision` — so the harness needs both blocks under `model:`, as the research template's `harness.yml` has them. Without them it is refused at enable, by name — see [Services](/services).

## Video {#video}

A video reaches the model as one video, the way llama.cpp's own server hands one over: its sampled frames in order, marked so that a projector with temporal merge (the Qwen-VL family) fuses neighbouring frames in pairs, with a timestamp every five seconds by default. It is one marker and one input, not a stack of separate pictures.

The page does the decoding, because that is where a codec is: the browser's WebCodecs, with Mediabunny reading the container. The host never decodes video. Attaching one takes four steps, and `ingestVideo` from `@lloyal-labs/ui` runs them:

1. **The original is pushed as a blob**, in chunks, over the [OCI distribution](https://github.com/opencontainers/distribution-spec) blob upload API the host serves at `/v2/…/blobs/uploads/`. A dropped chunk resumes from what the host reports it holds, and the blob is admitted only under the digest of the whole file. It is kept: it is what the reader brought.
2. **Frames are sampled** at the host's rate ([`attachments.video`](/harness-yml#attachments): 4 per second by default, fewer for a long clip, each at most 640 pixels on its longer edge) and each enters the store as an image.
3. **The soundtrack is cut into windows** of about five seconds, each ending at a quiet moment, and each enters as audio, but only when something the harness runs hears: a `transcription` service, or an embedding model that hears, as the default EmbeddingGemma 2 does with its projector.
4. **One `video:compose` command** names them all. The host checks every reference, transcribes each window when a transcription service is bound, and commits one attachment: the frames, the soundtrack windows, the transcript, the timeline and the original.

The transcript reaches the model as text beside the frames, at the timestamp that ends each window, so what was said sits next to what was shown. Without a `transcription` block the video still arrives, with no transcript and no error. When something hears, the host tells the page the limits every one of them admits, and the page cuts each window short enough, and writes it at a rate low enough, for each to admit it. An embedding model that hears is given the soundtrack itself, window by window after the frames, so a video's vector carries what was heard as well as what was seen.

Serve the command and let the composer take video:

```ts label="src/app.ts"
import { useVideoCommands } from "@lloyal-labs/rig";

const video = yield* useVideoCommands({ wire });
yield* serveCommands<Command>(commands, [brief, library, voice, video /* , … */], serveDefaults({ wire, run }));
```

```ts label="src/ui/parts/Composer.tsx"
import { ingestVideo, useHarness, useVideoCapabilities } from "@lloyal-labs/ui";
import { isVideoContainer } from "@lloyal-labs/media";

const { bridge } = useHarness();
const video = useVideoCapabilities();
// in the attach handler, the bytes decide:
const root = isVideoContainer(new Uint8Array(await file.slice(0, 64).arrayBuffer()))
  ? (await ingestVideo({ origin, bridge, file, capabilities: video, onProgress })).root
  : await ingestMedia(origin, new Uint8Array(await file.arrayBuffer()));
```

From there a video is an attachment like any other: `admitted` checks it, and `seen.bitmaps` carries it as one input. `seen.videos` names the videos, so the question can tell the model each one's address, and a report can cite a moment as `attachment://<digest prefix>/t/0m5.00s`. `parseAttachmentMoment` reads that back in the view.

Show and play it with ui's video components, built on Video.js and themed from your `--harness-*` variables like the rest of `@lloyal-labs/ui`:

```tsx
import { Lightbox, VideoCard, videoView } from "@lloyal-labs/ui";
import type { VideoView } from "@lloyal-labs/ui";
import "@lloyal-labs/ui/video.css"; // once, in the page entry

const [open, setOpen] = useState<VideoView | null>(null);
const view = videoView(origin, digest, asset);            // asset from useAssets
<VideoCard video={view} onOpen={() => setOpen(view)} />   // poster, play mark, length
{open && <Lightbox video={open} onClose={() => setOpen(null)} />}   // the player, while open
```

The player plays the file as attached, seekable because the content plane answers range requests. Hover or drag its time slider to see the frame the model saw at that moment; the transcript plays as captions. A cited moment opens like a video shared with a time: pass `videoView(origin, digest, asset, moment.tMs)` and it starts there, the time slider broken into a chapter that begins at the moment. Video.js loads only when a video is first opened.

On desktop, add `media-src attachment: blob:` to the page's Content-Security-Policy (the player's tracks are `blob:` URLs); in development, proxy `/v2` to the host beside `/v1/media`, with `xfwd: true` on a proxy that rewrites `Host` (`changeOrigin`), so the host recognises the page's uploads as its own.

The host's blob surface is not a general registry. By default it admits only the original of a video, recognised by its container signature, and serves no blob's bytes by digest: a pushed original is read back through the attachment that holds it. `BlobUploads(…, { registry: true })` makes it the full registry that the OCI distribution conformance suite runs against. A write, whether an upload or a dictation, is accepted only from the host's own pages, or the origin the host is configured to allow: a request whose `Origin` names another host is refused with 403. A production reverse proxy that rewrites `Host` must set `X-Forwarded-Host`.

### How it compares with llama.cpp {#video-and-llama-cpp}

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
| Sampling | 4 frames a second, no frame cap | A frame rate up to a frame cap, then spread evenly, and a longest edge, each an [`attachments.video`](/harness-yml#attachments) setting; JPEG |
| Frame times | Computed from the frame's index and the rate | The actual sample times, in milliseconds |
| Frame ids | `"{hash}+{n}"` per frame, which `llama-server` keys its cache on | None |
| Sound | Not part of the helper's layout | Transcribed separately and placed as text at its own time between frames; an embedding model that hears is given the windows themselves |
| Long clips | Always fuses, because the frames are dense | Keeps fusing: once frames are sparse, marks are laid out at twice the widest gap between frames instead of every five seconds |
| WebP images | Decoded through ffmpeg | Normalised by the host before native code |

**What this unlocks over stock llama.cpp:**

- **Video without ffmpeg on the machine.** Stock video input needs an `ffmpeg` binary on the host's `PATH`, started as a subprocess for every clip. lloyal.node builds mtmd with that support off, and the browser does the decoding. A desktop app ships with nothing to install beside the model. A served host never runs an external decoder over a file a stranger dropped in, and never parses its container.
- **The same input on every machine.** Native inference is given the frames the page sampled, not whatever an installed ffmpeg build decodes. A run reads the same input on every platform the addon ships for, and replays the same input from the store. The answers to it can still differ between machines, as any model's do across backends.
- **Video on the web, decoded by the reader's own machine.** The page holds the file and the browser decodes it, often in hardware, so a clip works the same in a browser tab as in the desktop app. The original uploads in chunks that resume after a dropped connection, and the host keeps it to play back.
- **The model hears the video.** The stock helper reads the picture only. lloyal transcribes the soundtrack and places each passage at its own time between the frames, so the model can answer what someone says at a moment, or what a slide shows while they talk over it. An embedding model that hears is given the soundtrack itself, so a search finds a moment by its sound, not only by its words.
- **Moments a reader can open.** Timestamps are the times the frames were sampled at, so a report can cite `attachment://<digest prefix>/t/1m24.87s` and the player opens at the frame the model saw. The time slider shows those frames, and the transcript plays as captions.
- **One projection for every agent.** A video is projected once, onto the conversation, and every agent forks from it. Ten agents asking about one clip pay for it once.
- **A cost known before anything is read.** A video is capped at its frame limit, 64 by default, and priced exactly before it is projected. With an [attachment budget](#attachment-budget), one that would not fit is refused with a sentence that says why, instead of failing halfway through a turn.
- **Any image the host can read.** Images are normalised on the way in, so WebP, HEIF and other formats reach the projector as formats it reads directly, with no ffmpeg involved.

**What it costs.** Stock sampling takes every quarter second of a clip, so it sees every moment, but a ten-minute clip becomes 2,400 frames, far more than a 32,768-token context holds. The frame cap, 64 by default and set by [`attachments.video.maxFrames`](/harness-yml#attachments), is what lets a video fit beside the question; the price is coverage on a long clip. At the default an hour-long recording is seen as one frame about every 56 seconds. Frames keep fusing at any length, because a sparse clip's time marks are spaced at least two frames apart; the trade is coarser marks, about one every 112 seconds for an hour.

## Tune what an image costs {#image-cost}

How many tokens one image is projected into is yours: `model.vision.minTokens` for the detail floor, `model.vision.maxTokens` for the ceiling. Grounding tasks want detail; wide fan-outs want room. See [harness.yml](/harness-yml#vision).

## Cap what attachments take {#attachment-budget}

A long video, or many images, can cost more of the context than a turn can spare: at the default frame cap an hour-long recording brings 64 frames and an hour of transcript. The share of the context a turn's attachments may fill is the harness's [`attachments.context`](/harness-yml#attachments); give it to `admitted`, and the attachments are priced exactly before anything is read in:

```yaml label="harness.yml"
attachments:
  context: 0.7
```

```ts label="src/harness/brief.ts"
const seen = yield* admitted(attachments, { context: config().attachments.context });
```

A turn over the share is refused with what it would cost and what is allowed, and the conversation is untouched. So is a turn that fits the share but not what the context has free now, later in a long conversation. Without the limit, an attachment that does not fit fails while it is read in. When a sequence slot is free, the turn is written on a fork of the conversation, so only the fork is lost and the conversation carries on (see [fast-forward](/agent-policy-and-context-pressure#fast-forward)), but the reader has waited for nothing. With no slot free, the turn is written in place and a failure releases the conversation. Unset, the share is the whole context: the attachments are still priced against what is free, and a turn that does not fit is still refused before anything is read in.

### Leave room for the run {#attachment-reserve}

An attachment that fits can still leave the run nothing to work in. The agent pool starts an Agent only when its task prompt fits above `softLimit`, so a turn whose media leaves `softLimit` or less free starts a run in which every spawn is refused (`pressure_init`), and it ends with no answer. Give `admitted` a `reserve`, the cells that must stay free once the media lands, and it refuses that turn before anything is read in:

```ts label="src/harness/brief.ts"
// The pool's own line for the effort this run will use.
const reserve = BUDGETS.effort[config().defaults.effort].context.softLimit;
const seen = yield* admitted(attachments, { context: config().attachments.context, reserve });
```

The refusal says what the attachments cost and the most they may take. Take the reserve from the same budget row the run will use, so the check and the pool agree: in the research template that is 2,048 cells at high effort and 8,192 at medium. A reserve of exactly `softLimit` keeps the pool's line clear but leaves nothing above it for the Agents' task prompts; add what they take to the reserve when a run must be able to start. Either way the check is about starting a run, not about room to finish it.

### Judge against where the media lands {#attachment-free}

`admitted` measures what is free in the context as it stands. A turn that starts a new conversation lets the current one go before its media is read in, so judge it against the whole context instead, with `free`:

```ts label="src/harness/brief.ts"
// A new brief lets the one on the canvas go first: its media lands in an empty context.
const free = warm ? undefined : new ContextPressure(yield* Ctx.expect()).nCtx;
const seen = yield* admitted(attachments, { context: config().attachments.context, reserve, ...(free !== undefined ? { free } : {}) });
```

Without it, a long conversation on screen would refuse media that a new brief has room for.

The three refusals, as the reader sees them:

| When | The sentence |
|---|---|
| Over the share | That attachment would take *n* of the *m*-token context; this harness lets attachments fill up to *p*% of it. Try a shorter clip or fewer attachments. |
| Over what is free | That attachment would take *n* tokens, but only *f* of the *m*-token context are free now. Try a shorter clip, fewer attachments, or a new brief. |
| Into the reserve | Not enough space for work after attachments (*n* tokens). Try smaller attachments or adjust budgets (*k* max allowed for attachments). |

::: callout A run with no room says so
In the research template, a run refused for room, at its first inquiry or at its settling pass, ends marked `no_room`, and the view says the context had no room left, not that the sources found nothing. What the template keeps of any run that ends short is on the [scheduler page](/scheduler#run-shapes).
:::

## Related {#related}

- [Services](/services) — vision, the projector behind every image and video, and transcription, behind every soundtrack.
- [Abilities](/abilities) — the documents Ability is one.
