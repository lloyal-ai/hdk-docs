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

A video reaches the model as one video, the way llama.cpp's own server hands one over: its sampled frames in order, marked so that a projector with temporal merge (the Qwen-VL family) fuses neighbouring frames in pairs, with a timestamp every five seconds. It is one marker and one input, not a stack of separate pictures.

The page does the decoding, because that is where a codec is: the browser's WebCodecs, with Mediabunny reading the container. The host never decodes video. Attaching one takes four steps, and `ingestVideo` from `@lloyal-labs/ui` runs them:

1. **The original is pushed as a blob**, in chunks, over the [OCI distribution](https://github.com/opencontainers/distribution-spec) blob upload API the host serves at `/v2/…/blobs/uploads/`. A dropped chunk resumes from what the host reports it holds, and the blob is admitted only under the digest of the whole file. It is kept: it is what the reader brought.
2. **Frames are sampled** at the host's rate (4 per second by default, fewer for a long clip, each at most 640 pixels on its longer edge) and each enters the store as an image.
3. **The soundtrack is cut into windows** of about five seconds, each ending at a quiet moment, and each enters as audio, but only when the harness has a `transcription` service.
4. **One `video:compose` command** names them all. The host checks every reference, transcribes each window with the transcription service, and commits one attachment: the frames, the transcript, the timeline and the original.

The transcript reaches the model as text beside the frames, at the timestamp that ends each window, so what was said sits next to what was shown. Without a `transcription` block the video still arrives, with no transcript and no error.

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
import "@lloyal-labs/ui/video.css"; // once, in the page entry

const view = videoView(origin, digest, asset);            // asset from useAssets
<VideoCard video={view} onOpen={() => setOpen(view)} />   // poster, play mark, length
<Lightbox video={view} onClose={() => setOpen(null)} />   // the player
```

The player plays the file as attached, seekable because the content plane answers range requests. Hover or drag its time slider to see the frame the model saw at that moment; the transcript plays as captions. A cited moment opens like a video shared with a time: pass `videoView(origin, digest, asset, moment.tMs)` and it starts there, the time slider broken into a chapter that begins at the moment. Video.js loads only when a video is first opened.

On desktop, add `media-src attachment: blob:` to the page's Content-Security-Policy (the player's tracks are `blob:` URLs); in development, proxy `/v2` to the host beside `/v1/media`, with `xfwd: true` on a proxy that rewrites `Host` (`changeOrigin`), so the host recognises the page's uploads as its own.

## Tune what an image costs {#image-cost}

How many tokens one image is projected into is yours: `model.vision.minTokens` for the detail floor, `model.vision.maxTokens` for the ceiling. Grounding tasks want detail; wide fan-outs want room. See [harness.yml](/harness-yml#vision).

## Cap what attachments take {#attachment-budget}

A long video, or many images, can cost more of the context than a turn can spare: an hour-long recording brings 64 frames and an hour of transcript. Give `admitted` the largest fraction of the context the turn's attachments may fill, and it prices them exactly before anything is read in:

```ts label="src/harness/budgets.ts"
attachments: { context: 0.7 },
```

```ts label="src/harness/brief.ts"
const seen = yield* admitted(attachments, BUDGETS.attachments);
```

A turn over the share is refused with what it would cost and what is allowed, and the conversation is untouched. So is a turn that fits the share but not what the context has free now, later in a long conversation. Without the limit, an attachment that does not fit fails while it is read in, and the session starts over. The research template sets 70%. Leave it out for no limit.

## Related {#related}

- [Services](/services) — vision, the projector behind every image and video, and transcription, behind every soundtrack.
- [Abilities](/abilities) — the documents Ability is one.
