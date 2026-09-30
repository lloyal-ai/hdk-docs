---
title: "Adding a service kind"
description: "For framework contributors: how a new kind of model beside the trunk is added to rig — a key in ServiceMap, its settings, one provider row, a catalog entry — and what the contract does and does not buy."
lede: "For contributors to the platform: a new kind of service is four places, and the compiler names whichever you skip."
---

<!-- Moved unchanged from Services (2026-09-30): the contributor half of that page. -->

This page is for contributors to `@lloyal-labs/rig`. To **use** a service, see [Services](/services).

## Adding a kind {#adding-a-kind}

Adding a service touches four places, and the compiler names whichever you skip. None of them is the installer, a boot, the registry, the config layering or the view.

| Place | What you add | What the build checks |
| --- | --- | --- |
| the contract | a key in `ServiceMap` naming what a consumer gets, and the name in `SERVICES` | the two are held exhaustive against each other in both directions |
| the configuration | `model.<name>.id`, `model.<name>.path`, and the service’s tuning keys in `modelSettings` | the provider’s block is typed from these; a row whose keys are missing does not compile |
| the provider | one row in the provider table: how the artifact reaches the run | the table is a mapped type over `ServiceMap`; a missing row is a compile error |
| the catalog | an entry per model the service can name, with its digest | the CLI’s mirror of the set and the catalog is held to the platform’s by a test |

### The provider {#the-provider}

A provider row is what a contributor writes, from the contract alone. Three optional cells; a row has one of the two binding cells, and `derive` only when a block can mean something without naming a model.

```ts label="packages/rig/src/providers/index.ts"
export const providers: { [K in Service]: ProviderRow<K> } = {
  reranker: {
    bind: (artifact, block) =>
      createReranker(artifact, { nCtx: block.context, instruction: block.instruction }),
  },
  vision: {
    derive: ({ llm }) => {
      if (llm.path || !llm.id) return undefined;               // bytes the catalog cannot pair
      const paired = catalogEntry("llm", llm.id)?.vision;
      return paired ? { id: paired } : undefined;
    },
    trunk: (artifact, block) =>
      ({ mmprojPath: artifact, imageMinTokens: block.minTokens, imageMaxTokens: block.maxTokens }),
  },
  embedding: {
    bind: (artifact, block) =>
      createEmbedder(artifact, { nCtx: block.context, pooling: embeddingPooling(block) }),
  },
};
```

| Cell | Says |
| --- | --- |
| `derive(of)` | which model backs the service when its block names none, given the llm’s selection; `undefined` refuses, naming `model.<name>.id` |
| `bind(artifact, block)` | the artifact as the instance `service(name)` answers — an Effection resource, so the instance lives as long as the scope that bound it and is torn down with it |
| `trunk(artifact, block)` | the options the artifact contributes to the resident context; typed only for a service whose map entry is a `Trunk`, so an instance service cannot accidentally be folded into the trunk |

`block` is the service’s `model.<name>` as the layering resolved it, typed from its keys, so a provider reads its tuning without parsing anything. The reranker row is one line; the binding it calls, `createReranker`, is one of the two files in the framework that open a second native context (the embedder’s, `createEmbedder`, is the other) and compose a runtime primitive over it, and each is its own file so a test can stand a fake at that boundary and prove the walk without loading a model. A new kind whose binding needs a different acquirer — a model that is not a `.gguf` in a slot — would add one more optional cell then; nothing today needs it, so it is not in the contract.

### The two halves of a new kind {#two-halves}

The promise at the top of this page ends in a dash — a judge, a projector, an encoder, a classifier, and whatever comes next — and it is worth being exact about what the contract buys for the next one. A new kind of model has two halves, which the contract keeps separate:

-   **The service layer** — configuration, acquisition, binding, the accessor, the installer’s step, the gates. After this contract, a map line, a set of keys, a row and a catalog entry, compiler-guided.
-   **The native substrate** — the model actually running in the runtime. Unchanged by the contract, and the part that decides whether the kind exists at all.

Embedding is the evidence for the first half: its substrate was finished first — the encoder, its pooling modes and a worked recipe in the runtime, proven against a real model — and its service came after, as a row, a binding and four keys, with nothing else in the framework touched. It is the worked example precisely because it isolates the layer this contract is about. It does *not* establish that a Whisper encoder costs a row, because Whisper’s substrate is the part embedding already had. The honest claim is this: a new kind used to be an arc whichever half you looked at; now the service half is a row, and the remaining question for any model is only whether it runs.

## Where it lives {#where-it-lives}

The contract and the platform are two sides in one package, split at the one boundary that matters: whether the code reaches the native runtime.

| Entry | Holds | Who imports it |
| --- | --- | --- |
| `@lloyal-labs/rig` | the contract: `ServiceMap`, `SERVICES`, the `Services` context, `service()`; beside it the retrieval contract (`Reranker`, `Chunk`, `Source`, `admitChunks`) and the ability contract (the manifest types, `AbilityConfigStoreCtx`). Browser-safe, node-free. | abilities and harnesses |
| `@lloyal-labs/rig/node` | the providers (`providers/`: the table, and the reranker’s native binding in its own file), the walk over them, the install, the catalog and the machine gate. | the boots; a contributor adding a row |
| `@lloyal-labs/lloyal-agents` | nothing of this. The agent runtime’s one reach into retrieval is the `EntailmentScorer` a source builds from its reranker and hands over on the tool context. | — |

The split is a dependency fact, not a convention: an ability that imported the providers would drag the native addon into every context that merely constructs it — `lloyal describe`, a browser, a unit test — so the contract lives where those can reach and the providers where only a boot does.

> **A harness and its abilities draw on the same set of models, named once in `harness.yml`, reached by the same call, with no consumer needing to know how any of them was acquired.**
