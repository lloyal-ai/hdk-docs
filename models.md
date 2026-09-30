---
title: "Models"
description: "Choose the model that lives inside your app, swap it, bring your own .gguf, and know how it is fetched and verified: the catalog, the four models:* commands, the machine each model needs, and the GPU."
lede: "Pick the model inside your app, change it with one command, or bring a file you already have."
---

<!--
Checked against source, 2026-09-30:
  lloyal      src/commands/models.ts     models:use / models:add / models:download (--sha256) / models:list; --role llm|reranker|vision|embedding
  lloyal      src/commands/backends.ts   backends:install (linux-x64 pack, once per lloyal.node version, ~/.cache/lloyal/backends/)
  lloyal-sdk  packages/rig/src/models.ts MODEL_CATALOG (urls: upstream then the Lloyal mirror; sha256; machineClass), resolveModel
  lloyal-sdk  packages/rig/src/machine.ts floors: edge 10 GB, appliance 24 GB
  lloyal-sdk  git eeb74b5 (rig 5.7.1): every catalogue model has a mirror
  Real output: `npx lloyal-ai@1.13.0 models:list` in a basic scaffold (below).
-->

The model is part of your application, not a service it calls. It is named in `harness.yml`, downloaded once into the project, verified against a pinned digest, and loaded into the same process as your code. Change it and the same program runs on a different model.

## See what you have {#models-list}

```sh label="Terminal"
npx lloyal-ai models:list
```

```text label="Output, in a fresh basic project"
Catalog (fetched + digest-verified on first run — no API key):
  llm       qwen3.5-4b               Qwen3.5 4B · Q4_K_M · 2.6 GB
  llm       qwen3.8-27b-q4           Qwen3.8 27B · Q4_K_M · 16.5 GB
  llm       qwen3.8-27b-iq1          Qwen3.8 27B · UD-IQ1_S · 6.2 GB
  reranker  qwen3-reranker-0.6b-q8   Qwen3 Reranker 0.6B · Q8_0
  embedding nomic-embed-text-v1.5-q4 nomic-embed-text v1.5 · Q4_K_M
  embedding qwen3-embedding-0.6b-q8  Qwen3 Embedding 0.6B · Q8_0

Active (harness.yml, with harness.json over it):
  llm       id: qwen3.5-4b
  reranker  (unset — the block is absent, so nothing is loaded; an ability that requires it does not enable)
  …

Installed files (models/<role>/):
  llm/qwen3.5-4b.gguf
```

## Change the model {#change-the-model}

Three ways, each one command. The commands write `harness.yml` for you; the change applies at the next launch.

| You want | Run | Writes |
|---|---|---|
| Another model from the catalog | `npx lloyal-ai models:use qwen3.8-27b-q4` | `model.llm.id` — fetched and verified on the next run |
| A `.gguf` you already have | `npx lloyal-ai models:add ./models/llm/my-model.gguf` | `model.llm.path` — used where it is, trusted because you have it |
| A `.gguf` from a URL | `npx lloyal-ai models:download <url> --sha256 <hex>` | Streams it into `models/llm/` and pins it as `model.llm.path`. Pass `--sha256`: without it the file is trusted by its source; with it, a mismatch deletes the file and fails. |

Add `--role reranker`, `--role vision` or `--role embedding` to set a [service](/services)'s model instead of the reasoning model.

A catalog model's `id` and a `path` replace each other: `path` wins if both are present.

## Pick for the machine {#machine}

Each catalog reasoning model has a **class**, and the installer refuses a machine below its floor before anything is downloaded.

| Class | Needs (total memory) | Models | Use it for |
|---|---|---|---|
| Edge | 10 GB | `qwen3.5-4b` — the default | Laptops, and an app people download |
| Appliance | 24 GB | `qwen3.8-27b-q4` (16.5 GB), `qwen3.8-27b-iq1` (6.2 GB) | A workstation or a shared box serving several people |

A model you bring with `path:` has no class and is not gated. [System requirements](/system-requirements#this-machine) has the whole check.

## How a model is fetched {#fetching}

- **Once.** A catalog model is downloaded into `models/<role>/<id>.gguf` on the first run that needs it, and never again. In an installed app, it goes to the application's own support folder instead.
- **Verified.** Every download is checked against a SHA-256 digest pinned in the platform, not in your project, so it cannot be weakened downstream. A mismatch is deleted, never loaded.
- **From more than one place.** Every catalog model has a second source, the Lloyal mirror. If the first does not answer, the next is tried.
- **Visibly.** The desktop installer shows each download's bytes, rate and time left, and can take a file you already have instead.

The weights in `models/` are git-ignored (`models/**/*.gguf`): a clone fetches its own.

## Run on the GPU {#gpu}

On Apple silicon the model uses Metal with nothing to set. On Linux and Windows, CUDA and Vulkan builds ship in the native packages.

- **On an NVIDIA machine**, `npx lloyal-ai new` asks whether to run on the GPU and, where it needs one, fetches the signed CUDA backend pack.
- **For a project you cloned**, `npx lloyal-ai backends:install` does the same: it probes the GPU, driver and CUDA runtime, says what it found, and on a yes downloads the pack into `~/.cache/lloyal/backends/` — once per lloyal.node version, shared by every harness on the machine. It then writes `model.llm.gpu: cuda`. Only Linux x64 has a published pack.

A backend you name with `gpu:` is a requirement: if it is not available, the run fails rather than quietly running on the CPU.

## Tune the reasoning model {#tune}

The `model.llm` block also takes the context window (`context`, default 32768), how many branches it holds at once (`branches`), the KV cache precision (`kvCache`) and the backend (`gpu`). Each is on [harness.yml](/harness-yml#llm), with when a change applies.

## Related {#related}

- [Services](/services) — the models beside the reasoning model: a reranker, vision, an embedder.
- [System requirements](/system-requirements) — what the machine needs.
