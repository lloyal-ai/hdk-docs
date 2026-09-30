---
title: "Abilities"
description: "A packaged capability — manifest, source, tools, instructions — that any harness can install and enable, signed and reviewed. What the model learns about it, how it sits in the model's memory, and what one is made of."
lede: "An extension that can read the calling agent’s live inference state, fork it, and spawn agents that inherit it."
---


::: proof Tools that read live inference state

**Five agents read one corpus and never read the same page twice.**

They all call the same `read_file`, and each gets back only what it has not seen: the tool keys its read tracking by `agentId:filename` and subtracts the ranges that agent already covered. It can see what its siblings called, too — a query a peer already ran comes back as a note instead of a second bill. Same call, different answer.

:::

::: proof Tools that spawn agents

**One tool call becomes a team that already knows what you know.**

`delegate` spawns a pool from the caller’s own branch, so every agent it creates inherits each source pulled and each dead end excluded — the state itself, not a summary passed down. It drops sub-tasks that drifted from the original query and refuses work already running further up the tree. It is marked `fanout = false` because it decodes on the main context: run it concurrently and the process dies.

:::

## What the model learns {#what-the-model-learns}

An Ability is what you publish so any harness can load your capability. Almost all of it is ordinary TypeScript. But only one part of it ever reaches the model, and that part is small enough to read in full:

```json label="ability.json"
{
  "name": "corpus",
  "abilityProtocolVersion": "3.0",
  "protocol": {
    "name": "corpus_research",
    "useWhen": "investigating a local document corpus — finding occurrences of terms, reading specific files at line offsets, semantic retrieval over indexed corpus content.",
    "tools": ["grep", "read_file", "search"]
  }
}
```

That is the real manifest of the `corpus` reference Ability. The `protocol` block — a name, one routing sentence, a tool list — is decoded into the **shared spine** once, at boot. Every agent forked afterwards inherits the whole catalogue through attention, and routes work by reading `useWhen` at execution time.

So `useWhen` is not documentation. It is the input to a decision the model makes hundreds of times, and it is the highest-leverage sentence you will write. Be specific about the domain; the planner reads it verbatim when choosing between Abilities.

## Abilities have a memory hierarchy {#where-it-sits-in-memory}

An Ability ships with its placement in the model’s memory hierarchy, and the harness honours it.

-   Its **protocol** is encoded once onto the shared spine, where every forked agent inherits it at no re-encoding cost.
-   Its **reference content** stays corpus-resident, pulled into live attention only when a task needs it.
-   Its **tools** cost nothing until invoked.

Orchestration frameworks cannot express that distinction. Without a memory hierarchy an integration's knowledge has exactly one residency — re-sent, in full, with every call.

## Anatomy {#anatomy}

`defineAbility`, from `@lloyal-labs/rig`, pairs a declarative manifest with a setup that constructs the runtime pieces, and returns the factory a harness enables.

```ts label="src/index.ts"
export const createCorpusAbility = defineAbility(manifest, function* () {
  const source = new CorpusSource();
  const tools: Record<string, Tool> = {};
  for (const t of source.tools) tools[t.name] = t;

  return { source, tools, skill };
});
```

### The manifest {#the-manifest}

**A broken Ability never reaches a prompt.** The manifest is validated eagerly, at import — before the Ability can be enabled, let alone say anything to the model.

| field | role |
| --- | --- |
| `name` | Identity. Lowercase ASCII, 2–64 chars. |
| `protocol.name` | The discipline an agent applies. Appears in the boundary marker on every per-spawn message. |
| `protocol.useWhen` | One sentence, read by the planner at execution time to route work here. |
| `protocol.tools[]` | Tool names. Must equal the setup's tool map keys as a set — no missing, no extras. |
| `configSchema` | Optional JSON Schema for operator-supplied config — read in the setup or at a tool’s call, see [The setup](/build-an-ability#the-setup). |
| `services` | Optional. The services the Ability requires — `reranker`, `vision`, `embedding`. A service exists when the harness carries its block in `harness.yml` and the block resolves to a model — one it names, or for `vision` the projector paired with the reasoning model; the harness never provisions one because an Ability asked, and an Ability whose requirement the file does not name is refused at enable. The trunk model is never listed. |

## Next {#next}

| You want to | Read |
|---|---|
| Write one | [Build an ability](/build-an-ability) |
| Ship it to other harnesses | [Publish and install](/publish-and-install) |
| Understand why a plugin's words are the attack surface | [Security model](/ability-security) |
| Use the ones that ship | [First-party abilities](/first-party-abilities) |
