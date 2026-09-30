---
title: "First-party abilities"
description: "The four Abilities Lloyal ships — wikipedia, web, corpus and documents: what each lets agents do, its tools, the services it needs, its settings, and how to install one."
lede: "Four sources of evidence, signed and ready: Wikipedia, the open web, a folder of your documents, and whatever a reader attaches."
---

<!--
Checked against source and the 1.13.0 scaffolds, 2026-09-30:
  lloyal-sdk  packages/abilities/{wikipedia,web,corpus,documents}/ability.json  tools, services, configSchema
  lloyal-sdk  packages/abilities/*/package.json  versions: wikipedia 2.1.0, web 2.1.0, corpus 2.1.0, documents 0.2.0
  scaffold    basic vendor/ (lloyal/wikipedia), research vendor/ + package.json harnessdev.abilities (lloyal/corpus, lloyal/web, lloyal/documents)
  harness-yml.md  "The abilities family" settings
-->

| Ability | Install | Lets agents | Needs | Settings |
|---|---|---|---|---|
| **wikipedia** | `lloyal/wikipedia` | Search and read Wikipedia, no key | — | none |
| **web** | `lloyal/web` | Search the open web and read pages, admitting only the passages that answer | `reranker` | `tavilyKey` (optional, secret) |
| **corpus** | `lloyal/corpus` | Search, grep and read a folder of your own documents | `reranker` | `corpusPath` (required) |
| **documents** | `lloyal/documents` | Search, read and look at the files a reader attaches | `reranker`, `vision` | none |

The basic template ships `wikipedia`; the research template ships `web`, `corpus` and `documents`.

## Install one {#install}

```sh label="Terminal"
npx lloyal-ai install lloyal/web
```

The install verifies the signed package before it writes anything, vendors it into `vendor/`, and — if it needs a service your `harness.yml` does not name — offers to add the line. Then enable it in `src/app.ts`:

```ts label="src/app.ts"
import { createWebAbility } from "@lloyal-labs/web-ability";

export const abilities = [createWikipediaAbility, createWebAbility];
```

[Publish and install](/publish-and-install) has what the install checks.

## wikipedia {#wikipedia}

*Answering questions about established facts, historical events, biographies, scientific concepts, geography, or other general-knowledge topics covered by Wikipedia.*

Tools: `wikipedia_search`, `wikipedia_fetch`. Wikipedia's public API, no key. It has no reranker: results are a capped list and the model reads what comes back. It carries its own guard, `title_dedup`, so one agent does not fetch the same article twice.

## web {#web}

*Gathering evidence from the open web — verifying current claims, retrieving primary sources from URLs, surveying official documentation and authoritative discussion.*

Tools: `web_search`, `fetch_page`. `fetch_page` chunks a page on its headings and admits the best passages verbatim within a token budget — see [Retrieval](/retrieval). With a `tavilyKey` it searches through Tavily; without one it uses a paced keyless search.

```yaml label="harness.yml"
abilities:
  web:
    tavilyKey: ""        # better set from the settings pane or the environment than committed
```

## corpus {#corpus}

*Investigating a local document corpus — finding occurrences of terms, reading specific files at line offsets, semantic retrieval over indexed corpus content.*

Tools: `grep`, `read_file`, `search`. `search` narrows a folder of Markdown lexically, then the reranker judges the candidates; `read_file` returns only the lines an agent has not already read. When `corpusPath` changes under a live run, the new index is built beside the old one, which keeps serving until it is ready.

```yaml label="harness.yml"
abilities:
  corpus:
    corpusPath: ./docs
```

It is not enabled until `corpusPath` is set.

## documents {#documents}

*Reading the documents attached to this conversation — PDFs, papers, reports: finding passages, quoting sections with page numbers, and checking a table or figure on a specific page.*

Tools: `search_documents`, `read_document`, `view_page`. See [Attachments and documents](/attachments#documents) for how each spends the model's context, and how citations reach a page.

## Related {#related}

- [Build an ability](/build-an-ability) — make your own.
- [Services](/services) — the reranker and vision these need.
