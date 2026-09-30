---
title: "Attachments and documents"
description: "Let readers attach images and PDFs: bytes go to a content-addressed store, never to the model or the wire; an image is projected once for every agent; a document is searched and read, and a page is shown to the model only when an agent asks to see it."
lede: "Let a reader drop in a photo or a PDF — and pay for only the parts the agents actually need to see."
---

<!--
Checked against source and a 1.13.0 research scaffold, 2026-09-30:
  lloyal-sdk  packages/rig/src/admitted.ts        admitted(descriptors): shape (asAttachment) → store (materialize) → sight (service("vision"))
  lloyal-sdk  packages/rig/src/media-store.ts     media/ at the project root, OCI Image Layout, never dev-gated
  scaffold    research README.md                  "The media store", "Attach something" (the four laws)
  scaffold    research src/harness/brief.ts       admitted(attachments); waitUntilSettled(session.prefillUserMultimodal(text, bitmaps, { attachments }))
  scaffold    research src/protocol.ts            attachments?: Descriptor[] on the submit command
  scaffold    research src/app.ts                 createDocumentsAbility
  lloyal-sdk  packages/abilities/documents/ability.json  tools search_documents/read_document/view_page; services reranker + vision
  lloyal-sdk  README.md                           the content plane (duplex: projection in, citation out)
-->

The research template takes attachments: drop a photo or a PDF on the composer and ask about it. This page is how that works, and what to copy into your own harness.

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

## Tune what an image costs {#image-cost}

How many tokens one image is projected into is yours: `model.vision.minTokens` for the detail floor, `model.vision.maxTokens` for the ceiling. Grounding tasks want detail; wide fan-outs want room. See [harness.yml](/harness-yml#vision).

## Related {#related}

- [Services](/services) — vision, the projector behind every image.
- [Abilities](/abilities) — the documents Ability is one.
