---
title: "harness.yml"
description: "Every key a harness is configured with — the model blocks, your own keys, the abilities family, where each rung reads it, what it takes, and when a change applies. Derived from the tables the keys are declared in."
lede: "Every key a harness is configured with: what it takes, where each rung reads it, and when a change applies."
---

A harness declares its configuration once, as a table of keys. `harness.yml` is the committed manifest of those keys; everything here is read off the tables the keys are declared in — the model family every harness ships (`modelSettings`) and the template’s own — so the file that disagrees with this page is the one to read.

::: pull
Naming a model  
is enabling it.
:::

## Where a value comes from {#the-rungs}

Every declared key is resolved through the same four rungs, highest first, and the rung that supplied it is reported beside it as its **provenance** — what the dev pane’s Settings tab shows next to each value.

| Rung | Where | Temper |
| --- | --- | --- |
| `env` | the environment variable a key names | a value the key cannot take falls through to the rung beneath; an integer key parses digits only |
| `file` | `harness.json`, beside the manifest | machine-written by the settings pane; a hand edit the key cannot take falls through |
| `yml` | `harness.yml`, committed | a deliberate deploy: a value the key cannot take **fails the boot**, naming the path and what it takes |
| `default` | the key’s declaration | stands when no rung supplies a value; a key with a default is always present |

Two more provenances appear without being rungs: `session`, a value patched in memory by a served session that no file will remember, and `cli`, a flag name a key may declare for a boot that passes overrides — the shipped boots pass none.

An empty string is a clear at every rung: the value comes from the rung beneath. A key declared as a path is expanded (`~`) and made absolute at the boundary — against the project for a value from either file or the default, against the process for one set in the environment.

```yaml label="harness.yml"
targets: [cli, desktop, web]

model:
  llm:
    id: qwen3.5-4b
    context: 32768
    branches: 5
  reranker:
    id: qwen3-reranker-0.6b-q8
  vision: {}

sources:
  outputDir: reports

defaults:
  effort: low
  guards:
    url_dedup:
      scope: cohort
    query_dedup:
      scope: cohort
```

The `research` template’s manifest as scaffolded. `model` is the family every harness ships; `sources` and `defaults` are this template’s own keys; `targets` is the scaffold’s.

## The model family {#the-model-family}

One block per model, and **the block’s presence is the request**: naming a block under `model:` is what loads that model; removing it is how “I don’t need this” is said. Its keys are the selection — `path` outranks `id`. An empty block (`vision: {}`, or a bare `vision:`) is a request with nothing selected: a service with a derivation takes it (vision pairs from the llm), and one without is refused, naming the key to add (`reranker: {}` → “set `model.reranker.id` or `model.reranker.path`”). No selection key has a default; a tuning key may (`model.reranker.context`), and it stands only once its block is present — a default never requests a model.

Every key lives at the path the file names it by: `model.llm.context` is the key, the yml path, and the provenance name. Every block beside `llm` is a [service](/services): the guide has the lifecycle, what a bound one exposes, and how a new kind is added.

### llm {#llm}

The reasoning model and the one shared context every agent branches from.

| Key | Takes | Env | Applies | What it is |
| --- | --- | --- | --- | --- |
| `model.llm.id` | a catalog id | — | reload | The catalog id of the reasoning model, fetched and digest-verified before it loads. |
| `model.llm.path` | a path to a `.gguf` | — | reload | A local .gguf for the reasoning model; outranks the catalog id. |
| `model.llm.context` | a positive integer | `LLAMA_CTX_SIZE` | boot | The context window of the one shared llama\_context; every branch leases its cells from this budget. |
| `model.llm.gpu` | `default` · `cuda` · `vulkan` | `LLOYAL_GPU` | boot | The native backend the process loaded. A configured backend fails loud when unavailable, never silently CPU. |
| `model.llm.branches` | a positive integer | — | boot | How many sequences the context holds at once (nSeqMax); each holds its own KV lease. |
| `model.llm.kvCache` | `f32` · `f16` · `bf16` · `q8_0` · `q4_0` · `q4_1` · `iq4_nl` · `q5_0` · `q5_1` | — | boot | The KV cache type for the attention layers: higher precision costs memory, and the reranker needs it. |

Unset, `context` is 32768 and `branches` is 32; the KV cache is `q4_0`. Before a byte is fetched, the boot asks whether this machine can hold the catalog model it names: an *edge* model needs 10 GB of total memory, an *appliance* model 24 GB, and a box under the floor is refused with what it has and what it needs — a `path:` model is trusted by possession and not gated. The CUDA backend pack is the box’s, not a key: `lloyal backends:install` puts it there and writes `gpu: cuda` for you.

### reranker {#reranker}

The pointwise judge the abilities score with. An ability that needs one says so in its manifest (`services: ["reranker"]`); the block is what provides it.

| Key | Takes | Applies | What it is |
| --- | --- | --- | --- |
| `model.reranker.id` | a catalog id | reload | The catalog id of the reranker — the pointwise judge that scores what the abilities retrieve. |
| `model.reranker.path` | a path to a `.gguf` | reload | A local .gguf for the reranker; outranks the catalog id. |
| `model.reranker.context` | a positive integer | boot | The reranker context; every scoring sequence leases from it. |
| `model.reranker.instruction` | `{ text, smokeTest }` — the scoring question and its canary pair, or `smokeTest: none` | boot | The scoring question and its canary — what relevant means for every ability sharing the reranker. |

Unset, `context` is 16384. The reranker runs on its own context, at `q8_0` KV precision — at `q4_0` its verdicts invert on close pairs.

### vision {#vision}

The projector through which the reasoning model sees an image. The block with no `id` takes the projector the catalog pairs with the llm, so switching the llm switches the projector with it; a `path:` llm has no pairing and needs an explicit `id` or `path`.

| Key | Takes | Applies | What it is |
| --- | --- | --- | --- |
| `model.vision.id` | a catalog id | reload | The catalog id of the vision projector; unset, the one the catalog pairs with the reasoning model. |
| `model.vision.path` | a path to a `.gguf` | reload | A local .gguf for the vision projector; outranks the catalog id. |
| `model.vision.minTokens` | a positive integer | reload | The floor on how many tokens one image is projected into; grounding tasks want it high. |
| `model.vision.maxTokens` | a positive integer | reload | The ceiling on what one image costs in context cells; lower it to fit more images. |

### embedding {#embedding}

The encoder a harness indexes with, one vector per text. A model’s pooling is its own property — Qwen3-Embedding reads its last token, nomic-embed averages — so a catalog id carries it and a local file must say.

| Key | Takes | Applies | What it is |
| --- | --- | --- | --- |
| `model.embedding.id` | a catalog id | reload | The catalog id of the embedding model — the encoder a harness indexes with, one vector per text. |
| `model.embedding.path` | a path to a `.gguf` | reload | A local .gguf for the embedding model; outranks the catalog id. |
| `model.embedding.context` | a positive integer | boot | The most tokens one text may embed as; a longer text is refused, never truncated. |
| `model.embedding.pooling` | `mean` · `cls` · `last` | boot | How the model folds token states into one vector — its own property; a catalog id carries it, a local file must say. |

Unset, `context` is 2048, which is the batch too: a text is encoded whole. A `path:` model with no `pooling` is refused at bind, naming the key. `nomic-embed-text-v1.5-q4` is the one to reach for on an edge box: a tenth of the memory and a quarter of the latency of the Qwen encoder; Qwen recalls more of what the reranker would confirm and suits an appliance-class box.

### The catalog and the slots {#the-catalog}

A catalog `id` is fetched on first launch into the project’s `models/<block>/<id>.gguf` slot and verified against the catalog’s digest, fail-closed: a truncated or tampered download is deleted, never loaded. A `path` is trusted by possession and never copied.

| Id | Block | Weights | Pairs with |
| --- | --- | --- | --- |
| `qwen3.5-4b` · Q4\_K\_M | llm | 2.6 GB | `qwen3.5-4b-mmproj` |
| `qwen3.8-27b-q4` · Q4\_K\_M | llm | 16.5 GB | `qwen3.8-27b-mmproj` |
| `qwen3.8-27b-iq1` · UD-IQ1\_S | llm | 6.2 GB | `qwen3.8-27b-mmproj` |
| `qwen3-reranker-0.6b-q8` · Q8\_0 | reranker | 630 MB | — |
| `qwen3.5-4b-mmproj` · F16 | vision | 672 MB | — |
| `qwen3.8-27b-mmproj` · F16 | vision | 928 MB | — |
| `nomic-embed-text-v1.5-q4` · Q4\_K\_M | embedding | 84 MB | pools `mean` |
| `qwen3-embedding-0.6b-q8` · Q8\_0 | embedding | 639 MB | pools `last` |

The CLI writes the selection for you: `lloyal models:use <id> [--role llm|reranker|vision|embedding]` writes the block’s `id`, `lloyal models:add <path> [--role]` its `path`, each replacing the other; `lloyal models:list` shows the catalog, your pins and what is on disk. An `llm` block that names neither and has exactly one `.gguf` in its slot adopts it; two is refused as ambiguous.

## When a change applies {#when-a-change-applies}

Each key declares when a change to it takes effect, and the settings pane offers a control only where one can do something.

| Tier | Means | Changed with |
| --- | --- | --- |
| `session` | at once, for what runs next; remembered locally | `set_config` — the pane’s control |
| `reload` | it names the residency: saved now, the next launch loads it | `reload_runtime` — saved, then the process ends and relaunches |
| `boot` | it sizes the context the process already built | `harness.yml` (or the key’s env), then a restart |

Every key of the model family is `reload` or `boot`: the family describes the **running residency**, which a save cannot change, so it stays boot-frozen for the life of the process — what a session reports is what it runs. A served session saves in memory only (its keys read `session`) and cannot reload the runtime: the host chose its model when it started and serves every session from that one residency.

## Your own keys {#your-own-keys}

A template declares its configuration in `src/config.ts`: the model family spread in, then its own keys. The key is the path in the resolved config; the entry says where each rung reads it, what it takes, and what stands when nobody sets it. The `Config` and `Origin` types are read off the table, so a key added here is typed everywhere at once, and the dev pane lists it.

```ts label="src/config.ts"
export const config = defineConfig({
  ...modelSettings,
  "sources.outputDir": {
    yml: "sources.outputDir", path: true, default: "reports",
    describe: "Where settled briefs, their annexures and the session trace are written.",
  },
  "defaults.effort": {
    yml: "defaults.effort", oneOf: ["low", "medium", "high", "ultra"], default: "high",
    describe: "How much a run may spend.",
  },
});
export type Config = ConfigOf<typeof config>;
```

| Field | Says |
| --- | --- |
| `yml` | where the committed rung reads it, dotted; absent, the key is never committed |
| `env` | the environment variable that outranks both files |
| `cli` | the name a boot’s overrides carry it under |
| `path` | a path: `~` expanded and made absolute at the boundary, whichever rung supplied it |
| `integer` | a positive integer; the env rung parses digits, the others refuse anything else |
| `oneOf` | the values it may take; a committed value outside them fails the load |
| `check` | any other rule; a committed value that fails it fails the load, a local one falls through |
| `default` | what stands when no rung supplies a value — inside a model block, only once the block is present |
| `applies` | `session` (the default), `reload` or `boot` |
| `describe` | what the key is, in one sentence, for whoever shows it |

Two rules the declaration enforces: `version` and the `abilities` family are the platform’s and cannot be declared, and a key cannot also be a family — `model.reranker` and `model.reranker.id` cannot both exist. A family holds keys; a scalar, an array or an object-valued key (`defaults.guards`) is one value, replaced whole.

### The shipped templates’ keys {#the-shipped-templates-keys}

| Key | Template | Takes | Default | What it is |
| --- | --- | --- | --- | --- |
| `sources.outputDir` | basic | a path | `.` | Where the session trace is written. |
| `sources.outputDir` | research | a path | `reports` | Where settled briefs, their annexures and the session trace are written; the library reads it back. |
| `defaults.effort` | research | `low` · `medium` · `high` · `ultra` | `high` | How much a run may spend: the plan’s size, each inquiry’s turns and time, and when a settling pass is reaped. |
| `defaults.reasoningMode` | research | `flat` · `deep` | `flat` | flat surveys the plan’s tasks side by side; deep investigates them one after another, each reading what the last found. |
| `defaults.guards` | research | a map of gate name to `false` or `{ scope: lineage \| cohort }` | — | The harness’s overrides for the agents’ guards: which repeated searches and re-fetched URLs are refused, and at what scope. |

`defaults.guards` is the harness’s side of a gate an ability declared: `url_dedup: { scope: cohort }` widens the gate to every agent in the pool; `url_dedup: false` switches it off. [The life of a tool call](/tool-hooks#guards) has the ability’s side.

## The abilities family {#the-abilities-family}

Every harness carries `abilities.<name>`, declared by none: one entry per installed ability, holding whatever its manifest’s `configSchema` asks for. Committed entries come first, then the local overlay replaces a named ability’s entry whole and leaves the others; a value is resolved as a path when its key ends in `Path` or it begins with `~`, `/` or `.`. An ability whose schema has required keys is not enabled until they are present, and its settings page says so. Values never ride the wire: the pane sees each key redacted to its presence, so a secret saved once is never read back.

| Ability | Key | Required | Note |
| --- | --- | --- | --- |
| `corpus` | `corpusPath` | yes | the folder of documents it indexes; resolved as a path |
| `web` | `tavilyKey` | no | a secret — redacted to presence on the wire; without it the keyless search runs |
| `documents` | — | — | no configuration |
| `wikipedia` | — | — | no configuration |

```yaml label="harness.yml"
abilities:
  corpus:
    corpusPath: ./docs
```

## targets {#targets}

`targets: [cli, desktop, web]` is the scaffold’s: which surfaces the project carries. The CLI reads it when it prunes a target you drop; the runtime never reads it. It is the one key at the top of the file that no table declares.

## The box’s own settings {#the-box}

What describes the machine rather than the harness comes from the environment and nowhere else: one build serves many machines, and a committed manifest would ship one box’s numbers to all of them.

| Variable | Read by | Says |
| --- | --- | --- |
| `PORT` | the served boot | the port the host listens on; 8787 unset |
| `HOST` | the served boot | the interface it binds; `127.0.0.1` unset — serving every interface is an explicit choice |
| `MAX_SESSIONS` | the served boot | how many browser sessions may be *resident* at once; 4 unset. Size it against the model, the context and the vision configuration deployed, with the sessions idle |
| `LLOYAL_CONTENT_ORIGIN` | the served boot | the origin allowed to upload to the content plane |
| `LLOYAL_DEV` | both boots | `1` mounts dev observability: the trace sink and the pane |
| `LLOYAL_GPU` | both boots | the env rung of `model.llm.gpu`; with no gpu configured an inherited value is cleared, so the file stays the one source |
| `LLAMA_CTX_SIZE` | both boots | the env rung of `model.llm.context` |
| `LLOYAL_NO_FALLBACK` | the native runtime | a configured backend sets it to `1` unless you set it: an unavailable backend fails loud rather than loading on CPU |
| `LLOYAL_BACKEND_DIR` | the native runtime | a provisioned CUDA backend pack, where `lloyal backends:install` did not put one |

## harness.json {#harness-json}

The local overlay, beside the manifest: what the settings pane writes, at version `2`, one block per model in the same shape as the manifest. It is written atomically with mode 0600 — it can carry a credential — and every save tightens a looser file; scaffolds ship it in `.gitignore`, and a save appends it there when it is not. A save carries only the keys it changes, merged into the families the table declares and replacing anything else whole, so a local overlay never pins an untouched value over the rungs beneath it.

A file written before 1.11 says `"version": 1` and is refused, naming the fix: delete it and relaunch. A file at a version this runtime does not write is ignored by the loader and never rebuilt over by a save — nothing overwrites a newer runtime’s settings.

> **The manifest is the deploy; the overlay is the machine. Naming a model in either is enabling it.**
