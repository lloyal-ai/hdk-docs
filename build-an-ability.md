---
title: "Build an ability"
description: "Scaffold an Ability, write its manifest and useWhen, construct its source and tools in the setup, read its settings live, and declare the services it cannot work without."
lede: "Scaffold an Ability, give it tools and instructions, and declare what it needs — one signed package any harness can enable."
---

<!-- Assembled 2026-09-30 from Abilities (Build one, The setup, Services) and Services (Requiring a service, The two gates). -->

## Build one {#build-one}

```sh label="TERMINAL"
npx lloyal-ai ability:new jira --publisher acme
```

You get a complete, buildable Ability: a manifest, a source, two working tools, and a skill template. Edit `ability.json` first — particularly `useWhen` — then replace the tool bodies with your backend.

Tool descriptions and parameter schemas are not incidental either. They are rendered into the model's context and are what it reasons over when choosing a call, so they are worth the same care as `useWhen`.

## The setup {#the-setup}

**One signed artefact, bound to your data when you enable it.** The setup is a generator returning the parts, and its output is validated when the factory runs — the same moment the Ability comes alive against your instance of the domain.

| part | role |
| --- | --- |
| **source** | Access to a live system, plus retrieval intelligence: the tools getter, a contents advert, and a reranker-backed scorer. |
| **tools** | The actions. Each carries a JSON-Schema `parameters`, an `execute` generator that may read the Ability's config at the call, and a `protected` flag marking sensitive or write operations. |
| **skill** | The per-spawn preamble — *how* an agent should investigate with this Ability. Rendered per spawn, never folded into the shared spine. |

**Config is read where it is used, and that decides when a save applies.** An Ability’s stored config — the object `configSchema` describes — is read through `AbilityConfigStoreCtx`, from the setup and from any tool’s `execute`. Read in the setup, a value becomes a resource the Ability owns for its life: a corpus index built from a path, a pacer for keyless search. Read in a tool at the call, a value follows the reader’s save at once: the next search of every agent already holding the tool goes through the key saved a moment ago. Prefer the call for anything that is a value rather than a resource. A save under a live run re-enables the Ability either way; what a running agent already holds keeps working, on the build it took, until its run ends, and the next run takes the new build.

## Write its tools {#tools}

An Ability's tools are ordinary tools: the contract, `fanout`, results and the tool context are on [Tools](/tools), and the five moments of a call — guards, retries, admission, the return — are on [Tool hooks and guards](/tool-hooks). Declared on the Ability's tools, hooks and guards travel with it to every harness that enables it; a harness can re-scope or switch off a guard by name.

## Require a service {#require-a-service}

**Abilities let your agents compose models.** `ability.json` declares `services: ["reranker"]`: the requirement, and a governed disclosure signed into the catalogue. The harness provides it by naming the model in `harness.yml` — `model.reranker: { id: qwen3-reranker-0.6b-q8 }` — and the ability reads it with one line, `yield* service("reranker")`, guaranteed to answer because an ability whose requirement is not configured is refused before its factory runs, naming the block. The ability gets a live model on a context of its own, never a promise of one.

**One provisioned model, several judgements.** The reranker exposes a single primitive — `scoreBatch(query, texts)`, a logit difference per text — and the judgements that ship are choices of *reference* against one criterion. `search` scores passages against the query for relevance. `delegate` scores proposed sub-tasks against the original query for entailment, dropping the ones that drifted, then against the caller’s own task for similarity, refusing work already running further up the tree. The criterion itself — the `<Instruct>` sentence — is bound once per reranker from `model.reranker.instruction`, so it is a harness-level decision rather than an Ability-level one. What that scoring decides — which chunks of a page or a corpus reach the model at all — is [context admission](/focal-lens).

Two Abilities that declare `reranker` share one instance. A harness that names no `model.reranker` loads none, and the Abilities that need one do not enable; the harness starts either way. The whole contract — what a service is, its lifecycle, what a bound one exposes, and how a new kind is added — is the [Services](/services) guide.

**The Abilities you install decide which models your application needs; `harness.yml` decides which it runs.** A plugin asks for a package. An Ability asks for a model, and the harness that names it has it.

An ability declares only what it cannot function without, by name, in its manifest. The names are checked against the closed set when the ability module is imported: an unknown name is a malformed manifest and never reaches a registry.

```json label="ability.json"
{
  "name": "corpus",
  "abilityProtocolVersion": "3.0",
  "services": ["reranker"],
  "protocol": { "name": "corpus_research", "useWhen": "…", "tools": ["grep", "read_file", "search"] }
}
```

A declaration is a requirement and a governed disclosure, not a request: the harness never provisions something because an ability asked. What it provisions is what its own `model` blocks name, and an ability whose requirement is not among them does not enable. There is no optional service: an ability that can degrade without one does not declare it, and reads nothing.

### The two gates {#the-two-gates}

Declared means required, and two gates hold it — the accessor enforces nothing.

| Gate | Asks | When | On failure |
| --- | --- | --- | --- |
| **install** | can this service be *selected* from the resolved configuration? | `lloyal install` and `lloyal new`, after the bundle is verified and before any file is written | names the missing key and **offers** to write it — `model.reranker.id: qwen3-reranker-0.6b-q8`, the catalog’s — in a terminal; declining leaves `harness.yml` byte-identical, and a pipe with nobody to ask refuses. A present block passes: whether it selects is the boot’s to settle. |
| **enable** | did the service *bind*? | `registry.enable`, before the ability’s factory runs | refuses the ability, naming the block: ``corpus requires `reranker`, which is not configured — add `model.reranker` to harness.yml``. The harness starts either way. |

Four things can go wrong here and each has its own message, because “add a declaration” is the wrong advice for three of them: a *missing declaration* (the install gate’s offer), an *unsupported service* (refused at import, outright), a *failed model load* (the boot’s, with the loader’s reason), and *no compatible projector* (a `vision` block under a `path:` llm, refused at the install’s plan).

## Related {#related}

- [Publish and install](/publish-and-install) — sign it and ship it.
- [Services](/services) — the harness's half of a service.
