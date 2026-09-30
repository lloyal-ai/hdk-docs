---
title: "Troubleshooting"
description: "The messages a Lloyal harness can show you, in the words it uses — what each means and what to do — from installing, through the first launch, to a run that cannot continue."
lede: "Find the message you are looking at, and what to do about it."
---

<!--
Every message is quoted from source, 2026-09-30:
  lloyal-sdk  packages/rig/src/machine.ts          refusalMessage
  lloyal-sdk  packages/rig/src/models.ts           resolveModel / fetchVerified errors
  lloyal-sdk  packages/rig/src/provision.ts        specOf: "names no model"
  lloyal-sdk  packages/rig/src/services.ts / registry   "is not configured", "requires … which is not configured"
  lloyal-sdk  packages/rig/src/serve-commands.ts   "Nothing in this app handles", "The session cannot continue"
  lloyal-sdk  packages/rig/src/execution.ts        poisoned
  lloyal-sdk  packages/rig/src/config files        "is version 1, written before alpha.10 — delete it and relaunch."
  lloyal-sdk  packages/rig/src/resident-context.ts GPU advice lines
  lloyal-sdk  packages/desktop/src/cannot-run.ts   "<App> cannot start" dialog
  lloyal      templates/basic/src/harness/wiki.ts, src/app.ts   "No Ability is enabled", "Non-TTY mode requires --query."
  Observed: npm EBADENGINE on Node 22; npm 11 install-scripts warning; scenario tests time out with a third angle.
-->

Lloyal's messages say what happened and what would fix it, so the quickest route is usually to read the message itself. This page collects them in one place, in the order you meet them.

## Installing {#installing}

| You see | What it means | Do |
|---|---|---|
| `npm warn EBADENGINE Unsupported engine … required: { node: '>=24.0.0' }` | Your Node.js is older than 24. npm warns and carries on; the result is unsupported. | Install the current LTS — [System requirements](/system-requirements#install-nodejs). |
| `npm warn install-scripts … packages have install scripts not yet covered by allowScripts` | Recent npm skips packages' install scripts unless approved. | Nothing — the project builds and runs without them. |
| `<name> is scaffolded — one step left.` and `Required — this harness imports this ability` | The project was created without its default Ability (for example with `--skip-abilities`). It will not typecheck or start until it has it. | Run the `npx lloyal-ai install …` line it printed. |

## The first launch {#first-launch}

| You see | What it means | Do |
|---|---|---|
| `… needs about 10 GB of memory and this machine has 8 GB. Nothing was downloaded.` | The machine is below the model's floor. There is no smaller model. | Run it on a machine with at least 10 GB. |
| `… needs about 24 GB of memory …` with *Choose an edge-class model* | An appliance-class model on a smaller machine. | `npx lloyal-ai models:use qwen3.5-4b`, or a bigger machine. |
| `Failed to fetch <model> from any source:` followed by one line per source | Every download source failed (the reasons are listed). | Check your connection, then retry — or in the desktop app, **Use a file I already have**. |
| `Digest mismatch for <model>: … refusing to load.` | The download did not match its pinned digest; it was deleted. | Retry. If it repeats, something between you and the source is altering the file. |
| `Model path not found for role "llm": …` / `… is not a GGUF model file: …` | `path:` in `harness.yml` points at nothing, or at a file that is not a model. | Fix the path, or remove it to use the catalog id. |
| `Model "<id>" (role "llm") isn't at models/llm/<id>.gguf and isn't in the catalog.` | An `id:` the catalog does not know. | `npx lloyal-ai models:list` for valid ids. |
| `Ambiguous model for role "llm": 2 .gguf files in models/llm/` | No id or path, and more than one file to choose from. | Set `id` or `path` in `harness.yml`, or remove the extra file. |

Nothing checks free disk space before a download, so make sure you have room. A download that was interrupted is cleaned up automatically the next time.

## Models and services {#services}

| You see | What it means | Do |
|---|---|---|
| `` `model.reranker` names no model — set `model.reranker.id` (a catalog id) or `model.reranker.path` in harness.yml `` | The block is there (`reranker: {}`) but selects nothing. | Add an `id` or a `path`. |
| `` `reranker` is not configured — add `model.reranker` to harness.yml `` | Code called `service("reranker")` and no block names one. | Add the block — [Services](/services). |
| `corpus requires `reranker`, which is not configured — add `model.reranker` to harness.yml` | An installed Ability needs a service the harness does not name. The harness still starts, without that Ability. | Add the block; the Ability enables at the next launch. |
| `<name> ability disabled: <reason>` | An Ability failed to enable; the reason follows. | Act on the reason. |
| An Ability does not appear, with no error | It has required settings that are not set yet. | Set them in the dev pane's settings, or under `abilities.<name>` in `harness.yml`. |

## Running {#running}

| You see | What it means | Do |
|---|---|---|
| `No Ability is enabled — add one to `abilities` in app.ts` | The program needs at least one source and has none. | Add one to the `abilities` array in `src/app.ts`, or install one. |
| `Non-TTY mode requires --query.` | The terminal surface was started with nobody at it. | `node bin/run.js --query "…"` for a one-shot run. |
| `Nothing in this app handles "<command>".` | A surface sent a command the harness has no handler for. The run is left alone. | Add the handler, or stop the surface sending it. |
| `The session cannot continue: …` | Cleaning up after a stop failed, so the model's state can no longer be trusted, and the session ends. | Restart the app. The reason is in the message and the log. |
| Agents stop early, or report thin findings | They ran out of turns, time or context. | Read the trace ([Debug with traces](/traces)), then adjust the budget ([Agent policy](/agent-policy)). |

## The desktop app {#desktop}

| You see | What it means | Do |
|---|---|---|
| A dialog: **`<App> cannot start`** with a reason | The app failed before its window could open — a folder it cannot write, a manifest it cannot read, a broken installation. It exits with code 1. | Act on the reason. Launched from a terminal, the full error is on stderr. |
| `… harness.json is version 1, written before alpha.10 — delete it and relaunch.` | A settings overlay from a much older version. | Delete that file; your committed `harness.yml` is untouched. |

## The GPU {#gpu}

| You see | What it means | Do |
|---|---|---|
| `[rig] an NVIDIA GPU is present but model.llm.gpu is unset — running on CPU.` | Linux x64 with an NVIDIA GPU, and the harness never asked for it. | `npx lloyal-ai backends:install` — it also writes `gpu: cuda`. |
| `[rig] gpu: cuda with no backend pack on this box …` | CUDA was asked for, but this GPU needs the backend pack. | `npx lloyal-ai backends:install`, once per machine. |
| The run fails to load with a backend error | `gpu:` names a backend that is not available. It fails rather than quietly running on the CPU. | Install the backend, or remove `gpu:` to run on the CPU. |

## Tests {#tests}

| You see | What it means | Do |
|---|---|---|
| Scenario tests time out after about 30 seconds each | The program now asks the model more times than the scripts answer — for example, a third angle. | Add a scripted reply per new agent, as in [Build your first harness](/build-your-first-harness#the-tests-notice). |
| A prompts test fails naming a key | A prompt file reads an input its stage does not give. | Pass the key, or remove it from the template. |

Still stuck? A real run's trace almost always shows the cause: `LLOYAL_DEV=1 node bin/run.js --query "…"`, then [read the trace](/traces#start-from-the-symptom).
