---
title: "Where a harness runs"
description: "How one harness contract spans application surfaces, local and shared-residency execution, process boundaries, transports, hardware, and operators."
lede: "One harness contract across application surfaces, execution placements, transports, hardware, and operating models."
---

A harness remains the same intelligent application while the surface, process boundary, machine, model placement, and operator change around it.

::: pull
One application contract.  
Different placements.
:::

<section class="platform-map"><img width="1448" height="1086" decoding="async" fetchpriority="high" src="/assets/guides/where-a-harness-runs-01.png" alt="The Lloyal platform across application surfaces, a TypeScript harness, signed Abilities, shared live model state, and deployment placements."><div class="map-caption">Platform map. Availability varies by surface and placement: mobile/on-device and paved managed or BYOC deployment workflows remain planned. Recovery and trace-based rehydration are shipped.</div></section>

## You already know this architecture {#you-already-know-this-architecture}

The closest familiar analogy is **MVC with a live language model as the Model**:

-   product surfaces are the **Views**;
-   the harness—ordinary TypeScript—is the **Controller**;
-   a resident model holds the live generative state.

The analogy continues into the serving layer. Rails separated the application from the server that happened to run it. Lloyal separates the harness from the surface, process boundary, and host that happen to carry it.

| Rails | Lloyal | Architectural role |
| --- | --- | --- |
| Views | CLI, desktop, web, and future mobile surfaces | Presentation does not own the intelligent procedure. |
| Controller | The harness | Ordinary code governs topology, evidence, policy, authority, completion, and continuity. |
| Model | Resident model and live inference state | The model is inside the application boundary rather than behind an endpoint. |
| Rack | `@lloyal-labs/binding` | One interface between every harness and every surface or transport. |
| `config.ru` | Generated placement driver | The harness and host do not need to import or understand one another. |
| Puma | `@lloyal-labs/host` | Multiple Sessions share one resident weight set while retaining isolated context and lifecycle. |
| Unicorn | `@lloyal-labs/relay` | Stronger OS-process isolation in exchange for duplicated residency. |
| Gems | Signed Abilities | Installable capabilities composed into the harness. |
| `rails new` | `npx lloyal-ai new` | Scaffold the application and its conventional wiring. |

The load-bearing Rails lesson is not the nouns. It is the separation:

> **Where the harness runs is a deployment decision, not an application decision.**

[Read the full Rails analogy](https://lloyal.ai/blog/you-already-know-this-architecture/)

## One application contract {#one-application-contract}

Every harness exposes the same headless shape:

```ts label="TypeScript"
export function* harness<E, C>(
  ctx: SessionContext,
  events: EventBus<E>,
  commands: Signal<C, void>,
): Operation<void>
```

The harness owns the intelligent procedure. It accepts typed commands, emits typed events, and runs over an injected model context. The surface and placement bind to that contract rather than redefining it.

```text label="Flow"
surface
   ↓ commands
harness(ctx, events, commands)
   ↓ events
surface
```

Unlike Rack's request/response cycle, this contract is a stream. A live harness may emit tokens, Agent lifecycle events, Tool progress, pressure changes, and results while a Session remains active.

### Convention below, code at the centre {#convention-below-code-at-the-centre}

`lloyal-ai` generates the repetitive wiring: targets, bindings, runners, and build configuration. Harness authors work at the centre—the procedure and domain rules that are genuinely theirs.

That is convention over configuration with an intentional boundary:

> **Infrastructure is conventional. Intelligent behaviour remains code.**

## Surface is not placement {#surface-is-not-placement}

Several independent choices are often collapsed into one word such as “deployment.” Keep them separate.

| Axis | Question | Today |
| --- | --- | --- |
| **Surface** | Where does the user interact? | CLI, desktop, web; mobile is planned. |
| **Execution family** | How is the harness instantiated? | Local edge runner or shared-residency host. |
| **Transport** | How do events and commands cross the cut? | Native render, NDJSON, IPC, WSS. |
| **Location** | Where is compute physically placed? | User laptop, private workstation, on-prem box, cloud GPU host. |
| **Operator** | Who controls the compute? | Self-hosted today; paved BYOC and managed workflows are planned. |
| **Compute class** | How much model can it carry? | Laptop, appliance, single GPU, multi-GPU frontier host. |

A browser does not imply a public cloud. It may connect over WSS to a host on the same laptop, a private network, an on-prem appliance, or a GPU box. Likewise, “local” does not force an in-process surface: the scaffolded web target runs a browser against a local resident-model host.

## Two execution families {#two-execution-families}

### Model on user-controlled compute {#local-edge}

*01 · Local edge*

```text label="Structure"
CLI or desktop surface
        ↕
local runner
        ↓
SessionContext + resident model
```

Use local edge for offline or zero-egress operation, user-owned data and compute, a single-user application, or the lowest operational surface area.

### One model, isolated Sessions {#shared-residency-host}

*02 · Shared residency*

```text label="Structure"
clients ─ WSS ─ host
               ├ Session A
               ├ Session B
               └ Session C
```

The host loads a model once and gives each admitted Session its own context, KV/recurrent state, configuration, Agent population, and structured lifetime.

The host is the **Puma** side of the analogy: density through multiplexing — [Serve to many users](/serve) runs it. The relay is the **Unicorn** side: stronger kernel isolation, but each process pays its own residency. The harness contract remains unchanged either way.

## Shifting the harness left {#shifting-the-harness-left}

```text label="Endpoint architecture"
application → network → model endpoint
```

```text label="Lloyal"
surface → harness + Abilities + live inference → placement
```

That changes the unit a developer builds and deploys. It is no longer merely an inference endpoint that another application must orchestrate. It is the intelligent application itself—its topology, Tools, evidence rules, policy, authority, completion, and continuity intact.

The runtime owns KV tenancy, branch sharing, Continuous Tree Batching, scheduling, and accelerator execution beneath the harness. Application code owns what those mechanics mean.

[Read “Shifting the harness left”](https://lloyal.ai/blog/shifting-the-harness-left/)

## Where the Rails analogy bends {#where-the-rails-analogy-bends}

### The Model runs {#the-model-runs}

An Active Record model is silent until called. A resident language model may continuously produce and react inside a Session. The binding is therefore a bidirectional event/command stream rather than a request cycle.

### The Model forks {#the-model-forks}

Agents inherit shared decoded state and diverge into application-owned lineages. Topology is part of the program, not a server-side implementation detail.

### The Model persists differently {#the-model-persists-differently}

Physical attention state is tied to its model and runtime configuration. Portable Session continuity is based on accepted logical state that can be reconstructed, with physical snapshots treated as optional accelerators.

Placement portability and durability are distinct:

-   **Placement portability** means the same harness contract can run elsewhere.
-   **Output reattach** reconnects a surface to a Session that is still live.
-   **Session rehydration** reconstructs accepted state after the original runtime has gone.
-   **Mid-execution recovery** reconstructs an active multi-branch graph after its runtime is gone. Not to be confused with the pool’s [recovery](/agent-policy-and-context-pressure#recovery-save-useful-work-before-pruning), which salvages a stopping Agent’s findings while the pool is still running.

Placement portability, trace-based Session rehydration, and mid-execution recovery are part of the platform shape today. What remains planned is the live durability plane: `checkpointLive`, agent-shaped retrospective rebase, and binary resume-after-restart.

## Choose a placement {#choose-a-placement}

| Need | Start with |
| --- | --- |
| Fastest path from scaffold to working application | Local CLI or desktop |
| Offline, private, or user-owned inference | Local edge |
| A browser over compute on the same machine | Local host + web target |
| A browser over private or on-prem compute | Shared-residency host over WSS |
| Several Sessions sharing a large model | Shared-residency host |
| Maximum OS-process isolation | `@lloyal-labs/relay`, mounted in your own server — [Isolate by process](/serve#relay) |
| Frontier open-weight models | Multi-GPU host |
| On-device mobile inference | Planned React Native / JSI placement |
| One-command managed or BYOC deployment | Planned `lloyal deploy` |

## Current and planned {#current-and-planned}

<div class="status-columns"><section><div class="status-title"><span class="status current">Current</span> Available now</div><ul><li><code>lloyal-ai new</code> with CLI, desktop, and web targets;</li><li>one headless harness contract across those surfaces;</li><li>native render, IPC, NDJSON, and WSS binding shapes;</li><li>local resident-model execution;</li><li>shared-residency hosting with per-Session state isolation;</li><li>signed Abilities composed into the harness.</li></ul></section><section><div class="status-title"><span class="status planned">Planned</span> Not yet paved</div><ul><li>on-device mobile through <code>@lloyal-labs/lloyal-react-native</code>;</li><li>a first-class <code>lloyal deploy</code> workflow;</li><li>managed and BYOC provisioning as developer-facing modes;</li><li>complete served output reattachment;</li><li>live-state checkpointing (<code>checkpointLive</code>) and agent-shaped rebase — reconstruction <em>without</em> a trace;</li><li>binary resume-after-restart as a paved path;</li><li>process-isolated serving as a paved front door — <code>@lloyal-labs/relay</code> ships today as a bridge you mount in your own server, with no scaffold command for it yet.</li></ul></section></div>

> **The harness is the application. Placement wraps it; placement does not redefine it.**
