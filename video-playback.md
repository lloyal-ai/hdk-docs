---
title: "Playback and citations"
description: "How a moment in a video is cited and played: the attachment://<digest prefix>/t/<time> address and its grammar, resolved against the videos a view holds; the player, which plays the original with the frames the model saw on its time slider and the transcript as captions, opening at a cited moment."
lede: "A cited moment opens like a video shared with a time: the original plays from the frame the model saw."
---

<!--
Checked against source, 2026-10-25:
  lloyal-sdk  packages/media/src/content-urls.ts    parseAttachmentMoment, parseAttachmentHref, resolvePrefix
  lloyal-sdk  packages/ui/src/prose.ts              REMARK_PLUGINS: the one grammar Markdown renders with and linksOf reads with
  lloyal-sdk  packages/ui/src/attachment-links.ts   a bare attachment address in prose is a link
  lloyal-sdk  packages/ui/src/video-player.tsx      VideoPlayer: Video.js skin, tracks, start-at, audio output recovery
  lloyal-sdk  packages/ui/src/start-at.ts           useStartAt: both players
  lloyal-sdk  packages/ui/src/lightbox.tsx          Lightbox: the player, the browser's own player as fallback, the frames without an original
  lloyal-sdk  packages/ui/src/video-view.ts         videoView, videoTracks: thumbnails, captions, a chapter at a cited moment, momentClock
  lloyal-sdk  packages/desktop/src/content.ts       the attachment: scheme
  lloyal-sdk  packages/rig/src/content-routes.ts    range reads of the original
Tests:
  lloyal-sdk  packages/media/test/content-urls.test.ts  the moment grammar, and nothing else; a prefix resolves to exactly one digest or to nothing
  lloyal-sdk  packages/ui/test/prose.test.ts        a bare address is a link where it stands, without the sentence's punctuation; not in a link or in code
  lloyal-sdk  packages/ui/test/markdown.test.ts     the renderer hands a bare address to the link component, once
  lloyal-sdk  packages/ui/test/video-view.test.ts   frame previews, captions, a chapter at a cited moment
  lloyal-sdk  packages/ui/test/lightbox.test.ts     plays the original with its tracks; opens at the cited moment; recovers its audio output
  lloyal-sdk  packages/ui/test/lightbox-fallback.test.ts  the browser's own player: the same file, moment and captions; a new moment of the same file
  lloyal-sdk  packages/ui/test/video-player.test.ts audio output recovery belongs to the clip
-->

## The moment address {#the-address}

A moment in a video is cited as an address:

```text
attachment://81cc8d9fd4e4/t/1m24.87s
```

- `attachment://` and a **digest prefix**: six to sixty-four hex characters of the video's root digest.
- `/t/` and the **time**, written as the video marks it to the model, `1m24.87s`, or in milliseconds, `84870`.

The time is the one the model read beside the frame, so a model citing a moment copies a time rather than computing one. `parseAttachmentMoment` reads the address back, and nothing that is not one:

```ts
import { parseAttachmentMoment, resolvePrefix } from "@lloyal-labs/media";

const moment = parseAttachmentMoment(href);                // { prefix, tMs } or null
const digest = moment && resolvePrefix(moment.prefix, digests);
```

`resolvePrefix` resolves a prefix against the digests the view already holds: exactly one match is an answer, and none or several is no answer. A page of a document is cited in the same grammar, `attachment://<digest prefix>/page/<n>`, read by `parseAttachmentHref`.

What a harness tells its model about citing a moment is the harness's own prompt. Give the model each video's address and the form to cite it in, and it copies them.

A view finds a cited moment however the model wrote it: a markdown link whose address is the moment, or the bare address in a sentence. `Markdown` and `linksOf` from `@lloyal-labs/ui/prose` read with one grammar, `REMARK_PLUGINS`, which links a bare attachment address as GitHub's flavour links a bare URL, so a moment the page draws as a link is one `linksOf` reports. An address inside a link or in code is left as it is, and the sentence's closing punctuation stays outside it:

```ts
import { linksOf } from "@lloyal-labs/ui/prose";

linksOf("It brakes at attachment://81cc8d9fd4e4/t/1m24.87s.").map((l) => l.href);
// ["attachment://81cc8d9fd4e4/t/1m24.87s"]
```

## The player {#the-player}

ui's video components play a video the way people expect a shared video to play, on Video.js, themed from your `--harness-*` variables like the rest of `@lloyal-labs/ui`:

```tsx
import { Lightbox, VideoCard, videoView } from "@lloyal-labs/ui";
import type { VideoView } from "@lloyal-labs/ui";
import "@lloyal-labs/ui/video.css"; // once, in the page entry

const [open, setOpen] = useState<VideoView | null>(null);
const view = videoView(origin, digest, asset, moment?.tMs);   // asset from useAssets
<VideoCard video={view} onOpen={() => setOpen(view)} />          // poster, play mark, length
{open && <Lightbox video={open} onClose={() => setOpen(null)} />}
```

- **The original plays, with its sound.** The content plane answers range requests, so the player seeks without downloading the file.
- **The frames the model saw are on the time slider.** Hover or drag it to see the frame the model was given at that moment.
- **The transcript plays as captions.**
- **A cited moment opens like a video shared with a time.** Pass the moment to `videoView` and the player starts there, the time slider broken into a chapter that begins at it. Opening another moment of the same file moves the player there.
- **It loads only when needed.** Video.js loads when a video is first opened.

If Video.js cannot run, the lightbox plays the same file in the browser's own player, from the same moment, with the same captions. A video kept without its original shows the frames the model saw, each with its time.

On macOS, Chromium can lose a whole playback when the audio output changes. The player reloads at the same moment and plays on, muted after a second failure in a row, so the picture is never lost to sound. A recovery belongs to the clip that failed: switch videos and it ends.

## Desktop and development {#desktop}

On desktop the content plane is the `attachment:` scheme. Add `media-src attachment: blob:` to the page's Content-Security-Policy; the player's tracks are `blob:` URLs. In development, proxy `/v2` to the host beside `/v1/media`, with `xfwd: true` on a proxy that rewrites `Host` (`changeOrigin`), so the host recognises the page's uploads as its own.

## Related {#related}

- [Content-addressed video storage](/video-storage#reading): the routes the player reads.
- [The interface](/interface): ui's components and theming.
