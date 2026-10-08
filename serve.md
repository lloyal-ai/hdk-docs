---
title: "Serve to many users"
description: "Serve one harness to many people from your own machine or GPU box: one resident model, a session per browser, admitted in order — the command, the box's four settings, what a session holds, and when to isolate by process instead."
lede: "Load the model once and give every reader their own session — on a laptop, an office appliance or a GPU box, with no per-token bill."
---

<!--
Checked against source and a 1.13.0 basic scaffold, 2026-09-30:
  lloyal-sdk  packages/rig/src/boot.ts         bootServed: install before listening; PORT 8787, HOST 127.0.0.1, MAX_SESSIONS 4
                                               (resident, not working), LLOYAL_CONTENT_ORIGIN, LLOYAL_DEV; per-session bindServices
  lloyal-sdk  packages/rig/src/served-host.ts  one ws connection = one Session; a terminal session closes its socket; a dead session logs why
  lloyal-sdk  packages/host/src/host.ts, types.ts  FIFO admission: queued → warming → live → draining → reaped (or died)
  lloyal-sdk  packages/relay/src/index.ts      relay 0.2.0: bridge glue, one forked harness per connection; no boot or scaffold command wires it
  lloyal-sdk  packages/binding/src/projection.ts  Availability states
  scaffold    targets/web/serve.ts, web-bridge.ts (VITE_WSS_URL, ?server=, ws://127.0.0.1:8787), package.json scripts
  harness-yml.md "When a change applies": a served session saves in memory only and cannot reload the runtime

Model/context ownership checked against source, 2026-10-08:
  hdk         packages/rig/src/boot.ts, resident-context.ts  one native context per admitted session
  lloyal.node src/SessionContext.cpp                       ModelRegistry::acquire followed by llama_init_from_model
  liblloyal   include/lloyal/model_registry.hpp             process-local shared llama_model cache
  hdk         packages/relay/src/index.ts                  child_process.fork per connection; separate Node processes
  hdk         packages/rig/src/provision.ts, providers/reranker.ts  artifacts resolved once; service contexts bound per session
  lloyal.node src/SessionContext.cpp                       mmproj initialized per context, outside ModelRegistry
  llama.cpp   d6d0ce8 tools/mtmd/mtmd.cpp, clip.cpp          each projector instance allocates and loads its own weights
-->

The same harness that runs as a desktop app can serve a room full of people. A **host** loads the model once and runs one **session** per browser, each with its own context, its own agents and its own memory, over the one resident copy of the weights. You pay for the machine, not per token.

## When to use it {#when-to-use}

| You want | Use |
|---|---|
| Several people using one model on one machine — an office appliance, a GPU box | The **host** (this page): `npm run serve` |
| One person, offline, on their own machine | The desktop app — [Ship a desktop app](/ship) |
| Every connection isolated in its own OS process | `@lloyal-labs/relay` — see [Isolate by process](#relay) |

## Quickstart {#quickstart}

```sh label="Terminal"
npm run serve
```

`serve` builds the harness and starts the host. It downloads and verifies any model it still needs **before** it listens, so no browser ever waits on a download, and then prints that it is listening. In another shell, start the browser app:

```sh label="Terminal"
npm run dev:web:client
```

`npm run dev:web` starts both together, which is what you want while developing.

## Shared weights, separate session state {#session-memory}

`npm run serve` runs sessions in one host process. Each reader gets a separate native **`llama_context` over the same resident `llama_model`**. Creating another context reuses the model's weights.

The OS analogy is direct: resident weights play the role of shared, read-only pages; each session's KV tree is its private address space. The host multiplexes sessions over those weights, and agents fork within their session's space.

[![One host process shares read-only model weights between Session A and Session B. Each session has a separate llama_context and KV tree, with two agents inheriting only that session's processed prefix.](/assets/serving-memory.svg)](/assets/serving-memory.svg)

At boot, the host prepares the model and service files on disk before it listens. Native contexts and service bindings are created as sessions are admitted.

| Resource | Ownership in the host |
|---|---|
| Model weights (`llama_model`), including the reranker | Shared by contexts using the same model file and model-loading settings |
| KV cache and model-specific recurrent state | Separate for each reasoning or service context |
| Context compute buffers | Allocated for each context |
| Service bindings | Created and owned per session, using the files prepared at boot |
| Vision projector (`mtmd_context`) | Loaded per session, with its own projector weights and working buffers |

Additional readers consume context, service and projector memory while reusing the resident reasoning-model and reranker weights. Sharing weights does not share a reader's attention history with other readers. Agents can inherit attention within their own session's lineage, as described in [Continuous Context](/continuous-context).

## Configure the box {#configure-the-box}

What describes the machine comes from its environment, never from `harness.yml`: one build serves many machines.

| Variable | Default | What it sets |
|---|---|---|
| `PORT` | `8787` | The port the host listens on |
| `HOST` | `127.0.0.1` | The interface it binds. The host has no authentication of its own, so serving every interface (`0.0.0.0`) is an explicit choice — put it behind something that does authenticate. |
| `MAX_SESSIONS` | `4` | How many sessions may be **resident** at once. The rest wait their turn. |
| `LLOYAL_CONTENT_ORIGIN` | — | The one web origin allowed to upload files to the host |
| `LLOYAL_DEV` | — | `1` turns on the trace and the dev pane per session |

```sh label="A GPU box on the office network"
HOST=0.0.0.0 PORT=8787 MAX_SESSIONS=8 npm run serve
```

## Size `MAX_SESSIONS` {#size-max-sessions}

A session holds its context and its service bindings for as long as its browser tab is open, even when the reader is idle. Budget for shared reasoning-model and reranker weights plus each session's KV/recurrent state, compute buffers and service working memory. When vision is configured, include each session's projector weights and working buffers too.

The cap is how many **open** sessions the machine can hold, not how many can work at once. Four is a cautious default for one machine, not a measurement. Measure with the model, context length and vision settings you actually deploy, with the sessions idle, and set it on the box.

## What a reader sees {#what-a-reader-sees}

Sessions are admitted first come, first served. A browser moves through `connecting` → `queued` → `warming` → `ready`, and a view reads that with `useAvailability()` (see [The interface](/interface#hooks)) to say "you're in the queue" rather than look broken.

- **A session is isolated.** A harness that throws, or a service that fails to bind, ends that session alone, says why in the host's log, and the host keeps serving.
- **A finished session closes its socket**, so a browser can tell "the session ended" from "the network dropped".
- **Visitors never change the harness.** A setting saved from a browser applies to that session, in memory only. Nothing a visitor does relaunches the host, downloads a model or writes the configuration.

## Point the browser at a host {#point-the-browser}

The web app connects to `ws://127.0.0.1:8787` unless told otherwise:

| To point it at | Set |
|---|---|
| A host fixed at build time | `VITE_WSS_URL=wss://your.host/…` when building the web app |
| A host chosen at run time | `?server=wss://your.host/…` on the page's URL |

## Isolate by process {#relay}

`@lloyal-labs/relay` provides **one harness process per connection**. It starts your harness's bin in a separate Node process and relays its frames over the socket, putting an OS-process boundary between readers.

The model registry is process-local. Relay children therefore own separate model objects and context allocations; the relay does not share one `llama_model` or GPU allocation across those processes. The OS may share memory-mapped model-file pages, but that is separate from the host's shared model residency. Multiple `llama_context` instances **within the host process** reuse the same weights as described [above](#session-memory).

The relay ships as a bridge you mount in your own server (Express, Hono, Koa…). No scaffold command wires it up yet. Use it when you need an OS-process boundary, and expect to write the server around it. Use `npm run serve` for the shared-residency host.

## Related {#related}

- [Where a harness runs](/where-a-harness-runs) — surfaces, placements and the Rails analogy.
- [Choose where the work lives](/project-root) — run one build against a data folder elsewhere.
- [The interface](/interface) — the browser side of the socket.
