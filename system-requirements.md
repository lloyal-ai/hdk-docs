---
title: "System requirements"
description: "What a machine needs to run a Lloyal harness, what the installer checks before it downloads anything, and how to install Node.js if you have never used a terminal."
lede: "What your machine needs, what the installer checks before it downloads anything, and — if you have never opened a terminal — how to get Node.js in three steps."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/rig/src/machine.ts      MACHINE_CLASS_FLOOR_BYTES, refusalMessage
  lloyal-sdk  packages/rig/src/install.ts      planInstall, install (machine step first; hold / retry / file / stop)
  lloyal-sdk  packages/rig/src/models.ts       MODEL_CATALOG (sizes, machineClass), fetchVerified (mirrors, sha256), resolveModel (GGUF check)
  lloyal-sdk  packages/rig/src/resident-context.ts  applyGpuEnv (LLOYAL_NO_FALLBACK), backendPackAdvice
  lloyal      package.json, templates/{basic,research}/package.json   engines.node >=24; templates' harness.yml
  lloyal-node package.json                     optionalDependencies: the 13 prebuilt binaries
  Observed: lloyal-ai 1.13.0 runs under Node 22 without refusing; npm prints EBADENGINE for @lloyal-labs/lloyal.node and continues.
  nodejs.org/dist/index.json: current LTS is v24 (Krypton).
-->

## At a glance {#at-a-glance}

| You need | Minimum | Why |
|---|---|---|
| Node.js | **24 or newer** — the current LTS | The CLI, both templates and the native runtime declare `node >=24`. |
| Memory (RAM, or unified memory on a Mac) | **10 GB total** for the default model; 16 GB recommended | The installer refuses a machine below the model's floor — see below. |
| Disk | About **3 GB** free for the `basic` template, **4.5 GB** for `research`, plus the project's npm dependencies | The model files are downloaded once, on the first run. Free space is **not** checked for you. |
| Operating system | macOS, Linux or Windows, on x64 or arm64 | Prebuilt native binaries ship for 13 platform and GPU combinations. |
| A GPU | Not required | CPU works everywhere. Metal is used on Apple silicon; CUDA and Vulkan are available on Linux and Windows. |
| An API key, Docker, a database | Not needed | The model runs inside your application. |

New to all of this? Skip to [First time? Install Node.js](#install-nodejs).

## What the installer checks {#what-the-installer-checks}

The first time a harness runs, it installs what it needs before it opens. You see this as a list of steps — in the desktop app as the installer screen, in a terminal as progress lines. The steps always come in this order.

### 1. This machine {#this-machine}

Before a single byte is downloaded, the installer compares the machine's **total** memory with the floor for the model you chose. It checks total memory, not free memory, so an open browser never gets a capable machine refused. It runs this check on every start, not just the first, because weights copied onto a machine that is too small fail just as hard as weights downloaded onto it.

| Model class | Floor | Catalog models |
|---|---|---|
| Edge | 10 GB | `qwen3.5-4b` — the default in both templates (2.6 GB of weights) |
| Appliance | 24 GB | `qwen3.8-27b-q4` (16.5 GB), `qwen3.8-27b-iq1` (6.2 GB) |

If the machine is below the floor, the run stops with a message like this, and nothing has been downloaded:

```text label="Below the edge floor"
Qwen3.5 4B · Q4_K_M needs about 10 GB of memory and this machine has 8 GB. Nothing was downloaded.
That is below the minimum lloyal runs on, so there is no smaller model to fall back to.
Run this harness on a machine with at least 10 GB.
```

Below the appliance floor, the message suggests an edge-class model instead. A model you point at yourself with `path:` in `harness.yml` has no class, so it is not gated — the file is trusted because you have it.

### 2. The reasoning model {#the-reasoning-model}

The model named under `model.llm` in `harness.yml` is downloaded into the project's `models/llm/` folder and **verified against a pinned SHA-256 digest** before it is used. Every catalog model has more than one source: if the first does not answer, the next is tried. A download that is cut short or does not match its digest is deleted, never loaded. A half-finished download left behind by a crash is cleaned up the next time the slot is checked.

If you give a local file with `path:` instead, it is used where it is, without a copy. The only check is that the file really is a GGUF model.

### 3. Each service the harness names {#each-service}

Then one step per extra model the harness asks for — the reranker, the vision projector, the embedding model — each fetched and verified the same way. The `basic` template names none; `research` names a reranker (630 MB) and vision (672 MB). See [Services](/services) for what each one does.

### When a step fails {#when-a-step-fails}

- **In the desktop app**, the installer holds on the failed step and offers **Try again**, **Use a file I already have** and **Stop**. A file you choose is remembered for the next launch.
- **In a terminal**, there is nobody to ask, so the run ends and prints the reason.
- **A served host** does all of this before it starts listening, so no browser ever waits on it.

After the first run, every launch opens straight away: there is nothing left to download.

### The GPU {#the-gpu}

The GPU is not part of the install; it is read when the model loads.

- If `harness.yml` names a backend (`model.llm.gpu: cuda` or `vulkan`) and it is not available, the run **fails loudly** rather than quietly falling back to the CPU.
- On a machine with an NVIDIA GPU, `npx lloyal-ai new` asks whether to run on it. Say yes and it writes `gpu: cuda` to `harness.yml` and, where the GPU needs it, fetches the signed CUDA backend pack, once per machine. Nothing is fetched without a yes; `--backend-pack skip` keeps the CPU.
- For a project you cloned instead of creating, `npx lloyal-ai backends:install` does the same. On Linux, if an NVIDIA GPU is present and `gpu` is unset, the run says so and uses the CPU.

## What is not checked {#what-is-not-checked}

Say these plainly, so nothing surprises you:

- **Your Node.js version.** Nothing stops you on an older one. npm prints an `EBADENGINE` warning during install and carries on, and the result is unsupported. Use Node 24 or newer.
- **Free disk space.** Make sure you have room for the models before the first run.

## First time? Install Node.js {#install-nodejs}

Node.js is the free program that runs Lloyal on your computer. You install it once.

**Step 1 — Download it.** Go to [nodejs.org](https://nodejs.org) and click the **LTS** download. Open the file and click through the installer, accepting the defaults.

**Step 2 — Check it worked.** Open a terminal: on a Mac, press <kbd>⌘</kbd>&nbsp;<kbd>Space</kbd>, type **Terminal** and press Return; on Windows, open the Start menu and type **PowerShell**. Type this and press Return:

```sh label="Terminal"
node -v
```

You should see a version starting with `v24` or higher. *If you see "command not found", close the terminal, open a new one, and try again.*

**Step 3 — Make your app.** Paste this and press Return, then answer the questions it asks:

```sh label="Terminal"
npx lloyal-ai new
```

*If it asks "Ok to proceed?", type `y` and press Return.* When it finishes, it prints the exact command that starts your app. The next step is [Build your first harness](/build-your-first-harness).
