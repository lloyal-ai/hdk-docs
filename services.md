---
title: "Services"
description: "Composition of models — one reasoning model and, beside it, every model an agent's work needs, composed as services: named once in harness.yml, read with one call from an ability or a harness, acquired, bound and refused by one contract. What a service is, the lifecycle every one goes through, what a bound one exposes, and how a new kind is added."
lede: "Composition of models. One reasoning model and, beside it, every model an agent’s work needs — a judge, a projector, an encoder, a classifier — composed as services for agents. Naming a model is enabling it; reading it is one line."
---

An application is rarely one model. The model that reasons is not the model that judges whether a passage answers the question, nor the one that turns pixels into something it can attend over, nor the one that indexes a corpus ahead of the question. In an API-wrapper framework each of those is another endpoint, another client, another place the working state has to be serialised to and read back from. Here they are **resident together**, named in one place, and reached by one call: a harness composes the models its work needs by writing their blocks in `harness.yml`, an ability declares the ones it cannot function without, and every one of them goes through one lifecycle — *declare, configure, acquire, bind, reach, refuse* — that the framework runs for every kind alike, without looking inside. What a bound model exposes is its own; what it costs to add a kind is a row.

::: pull
Resident together,  
named once,  
reached by one call.
:::

## What a service is {#what-a-service-is}

A service is every model beside the trunk — the reasoning model every agent branches from — known by one name that is also its block in `harness.yml` (`model.reranker`) and its slot on disk (`models/reranker/`). The trunk is never a service: it is the harness’s own model, always present, and abilities never list it.

There are two shapes a service can take, and the difference is what a consumer gets back:

-   **An instance of its own.** The reranker runs on a context of its own, and a bound reranker is an object with methods: score, tokenize, dispose. It lives as long as the scope that bound it.
-   **A capability of the trunk.** The vision projector is not an object anything calls: it goes onto the resident context so the trunk can see, and every agent forked from that trunk sees with it. What a consumer reads back is a marker that says the projector is there, and nothing to call. Sight is the context’s, not an object’s.

The framework treats both through the same contract. It never asks a service what it can do; it asks the service’s *provider* how the artifact reaches the run, and a provider answers with one of two cells — `bind` for an instance, `trunk` for a capability — described under [the provider](#the-provider).

### The set today {#the-set-today}

| Service | Shape | What it is | Status |
| --- | --- | --- | --- |
| `reranker` | instance | The pointwise judge the abilities score with: a cross-encoder on its own context, answering how well a passage meets a query as a logit difference. The judgement behind [context admission](/focal-lens). | Exposed today |
| `vision` | trunk | The projector through which the reasoning model sees an image. Paired from the catalog with the llm when the block names no id, so switching the llm switches the projector. | Exposed today |
| `embedding` | instance | An encoder answering one unit vector per text, in input order, for retrieval that indexes ahead of the question. Serialized on a context of its own; a text longer than its context is refused, never truncated. | Exposed today |
| audio, classification, … | — | The kinds the contract is built to take: a Whisper encoder, a classifier, a speech sanitizer. | Design pattern — the service layer costs a row; the native substrate is separate work |

The set is closed and lives in the framework: a service is added by a contribution, not by a package registering one at runtime. That is a decision about governance rather than a limit of the design — a signed ability that declared a third-party service would reopen the question of who vouches for what it loads — and it is held open for later.

## The lifecycle {#the-lifecycle}

Every service goes through six phases, and each phase has exactly one owner and one place. A harness developer touches the second; an ability author touches the first and the fifth; a framework contributor touches the fourth. Nobody constructs a service, writes a refusal, or sequences acquisition against binding.

| Phase | Who says it | Where | What it means |
| --- | --- | --- | --- |
| **declare** | an ability’s manifest | `ability.json` → `services: ["reranker"]` | the requirement: what this ability cannot work without. Signed into the catalogue, shown to the reviewer. Never the trunk. |
| **configure** | the harness developer | `harness.yml` → `model.reranker:` | the request: naming the block is enabling the service; its keys select which model. An absent block is a decision. |
| **acquire** | the boot | `models/<name>/` | the model file, fetched and digest-verified on the first run and never again; reported step by step while it happens. |
| **bind** | the provider | the owning scope | the artifact becomes what a consumer reads: an instance, or an option on the trunk’s context. |
| **reach** | a harness or an ability | `yield* service('reranker')` | the bound instance, or the marker, from anywhere under the binding. |
| **refuse** | the framework | the same call; the enable gate | one message, naming the block whose presence would have bound it. |

The order matters at the boot: everything is *acquired* before anything is *loaded*, so a first run that needs 600 MB of reranker finds out before it has spent the minutes loading 2.6 GB of trunk, and on the edge a bind that fails fails before a session exists to fail in. The served host binds an instance service once per admitted session, inside that session’s scope: a bind that fails there ends that session alone, and the host keeps serving.

## Naming a model {#naming-a-model}

**The block’s presence is the request; its contents are the selection.** A service is enabled by writing its block under `model:` and disabled by removing it. The keys inside choose which model: `path` outranks `id`; a block with neither takes what its provider can derive, and a block with neither and no derivation is refused before anything runs, naming the key to add.

```yaml label="harness.yml"
model:
  llm:
    id: qwen3.5-4b
    context: 32768
  reranker:
    id: qwen3-reranker-0.6b-q8
    context: 16384
  vision: {}          # no id: the projector the catalog pairs with the llm
```

Three things follow from presence being the trigger.

-   **An empty block is a request.** `vision: {}`, or a bare `vision:`, asks for vision and takes the catalog pairing. `reranker: {}` asks for a reranker and selects none, so the boot refuses: *set `model.reranker.id` (a catalog id) or `model.reranker.path`*. A `vision: {}` under a `path:` llm is the same refusal with one more clause — *none follows from the llm* — because bytes the catalog knows nothing about have no pairing.
-   **A default never requests a model.** `model.reranker.context` defaults to 16384, but only once the block is present. No selection key has a default, so nothing loads that nobody asked for. The 630 MB reranker appears because you wrote a line, never because an installed ability declared one.
-   **Removing a block disables what needs it.** Delete `model.reranker` and the harness still starts; every ability that requires a reranker is refused at enable with the block named, and the run continues without those abilities. Put the block back and they enable again.

Every key, its env name, what it takes and when a change applies is on the [harness.yml reference](/harness-yml#the-model-family). The reranker’s context and the scoring question it is asked are settable there because the service declares them.

## Reading a service {#reading-a-service}

One call, from either consumer, anywhere under the binding:

```ts label="TypeScript"
import { service } from "@lloyal-labs/rig";

const reranker = yield* service("reranker");   // the bound instance
yield* service("vision");                       // the marker: the trunk can see
```

It answers the bound instance, or throws with one message: `` `reranker` is not configured — add `model.reranker` to harness.yml ``. That message is the same whoever asks and whatever the service, which is why no consumer writes a refusal of its own.

**Availability, not permission.** The call tells you whether the harness bound the service. It does not check that *this* caller declared it: every ability scope is seeded with the same bound set, so a harness that configured a reranker has one for every ability and for its own code alike. What an ability may *require* is enforced at the two gates below, not at the read.

### From an ability {#from-an-ability}

An ability reads its services in its setup, once, and hands them to its source and tools at construction. Because the enable gate refused the ability before the factory ran if the requirement was unmet, the read inside a declared ability always answers.

```ts label="src/index.ts"
export const createCorpusAbility = defineAbility(manifest, function* () {
  const reranker = yield* service("reranker");     // declared in ability.json, so this answers

  const cfgStore = yield* AbilityConfigStoreCtx.expect();
  const cfg = (yield* cfgStore.get("corpus")) ?? {};
  const corpusPath = typeof cfg.corpusPath === "string" ? cfg.corpusPath : undefined;
  if (!corpusPath) throw new Error("createCorpusAbility: missing config `corpusPath`");

  const resources = loadResources(corpusPath);
  const chunks = yield* call(() =>
    fitChunks(chunkResources(resources), { maxTokens: DEFAULT_CHUNK_TOKENS, tokenize: (t) => reranker.tokenize(t) }),
  );

  const source = new CorpusSource(resources, chunks, reranker);
  const tools: Record<string, Tool> = {};
  for (const t of source.tools) tools[t.name] = t;

  return { source, tools, skill };
});
```

That is the whole of what the corpus ability does with the service: one read, handed to its source at construction. The framework guarantees the read, so the ability writes no refusal of its own.

### From a harness {#from-a-harness}

A harness reads a service the same way, from its own code: the boot binds before `harness()` runs, on the edge once for the process and on a served host once per admitted session, so the call answers anywhere inside. Nothing has to be declared — the harness named the block.

```ts label="your harness code"
export function* librarySearch(query: string, briefs: Brief[]) {
  const reranker = yield* service("reranker");
  const scores = yield* call(() => reranker.scoreBatch(query, briefs.map((b) => b.summary)));
  return briefs.map((b, i) => ({ ...b, score: scores[i] })).sort((a, b) => b.score - a.score);
}
```

The one read rig makes on a harness’s behalf is sight: when a harness stages attachments for a run, rig’s `admitted()` reads `service("vision")` for any image among them, so a picture handed to a model that cannot see is refused with the same message as any other unconfigured service, before a byte enters the context.

### What a bound service exposes {#what-a-bound-service-exposes}

The uniformity is the lifecycle, not the method set. A bound service exposes what it is:

| Service | Answers | Members |
| --- | --- | --- |
| `reranker` | `Reranker` | `score(query, chunks)` streams progressive results over pre-tokenized chunks; `scoreBatch(query, texts)` answers one logit difference per text, unbounded, positive meaning “yes”; `tokenize(text)` and `tokenizeChunks(chunks)` put text into the reranker’s own vocabulary; `dispose()` is idempotent and the owning scope calls it for you. |
| `vision` | `Trunk` | `artifact` only — the projector’s path. There is nothing to call: an image placed on a branch is projected by the context itself. |
| `embedding` | `Embedder` | `embed(texts)` answers one L2-normalized vector per text, in order, so cosine similarity is a dot product; `tokenize(text)` measures in the encoder’s own vocabulary; `dimension` is the length of every vector. Both are Operations. `embed` consumes *prepared* text: a model’s query or document prefix is the caller’s to add, because the encoder cannot know which side a text is. |

Every score the reranker returns is in logits: the log-odds of its yes/no judgement, comparable across queries to the extent of the model’s calibration, never a 0–1 similarity. The reranker runs at `q8_0` KV precision on its own context because at `q4_0` its verdicts invert on close pairs. The scoring question — what “relevant” means for every ability sharing the judge — is bound once when the reranker is, from `model.reranker.instruction`, with a canary pair scored at boot so a broken setup fails then rather than silently. [A focal lens for context admission](/focal-lens) is what the abilities build on those scores.

## Requiring a service {#requiring-a-service}

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

## What the boot does {#what-the-boot-does}

Everything below is the framework’s. It is here so the behaviour you see on a first run has a reason, not because a harness has to do any of it.

### Acquire {#acquire}

The steps a run performs are **derived** from the model family: the machine, the reasoning model, then every service whose block is present, in the order the providers are declared, each with the spec that satisfies it. No boot and no view keeps a list of services. A step is satisfied the way any model is resolved — a `path` is trusted by possession, an `id` is found in its slot or fetched from the catalog and verified against its digest, fail-closed.

1.  **The machine, before a byte.** The catalog model you named carries a machine class; a box under that class’s floor of total memory — 10 GB for an edge model, 24 GB for an appliance model — is refused with what it has and what it needs, and nothing is downloaded. The check runs on every start, because weights carried onto a box too small for them fail exactly as hard.
2.  **The reasoning model**, then **each service’s model**, reported as `install:step` snapshots on the harness’s own channel: every step, every time, so a view holds no state machine. A run that acquires nothing sends nothing and simply opens.
3.  **Where a view can act, a failed step holds.** On the desktop the platform’s installer — mounted by `HarnessProvider`, themed by the harness’s own CSS custom properties, written by no harness — shows the step list, the active step’s bytes and rate, and offers *try again*, *use a file I already have*, and *stop*. A chosen file is remembered through the harness’s own persistence, the download in flight is cancelled without trying another mirror, and the step re-resolves from the file. In a terminal or a pipe there is nobody to ask, so a failed step ends the run with its reason. A served host acquires before it listens: no browser exists yet to hold for.

### Load and bind {#load-and-bind}

With every artifact on disk, the boot builds the resident context. The trunk providers fold their options in first — the projector’s path and the image token budgets — so every session’s trunk has the same sight. Then the instance providers bind, in the scope that owns them:

-   **On the edge**, once, for the life of the process. The reranker’s context is built beside the trunk’s and torn down with the boot’s scope.
-   **On a served host**, once per admitted session, off the artifacts the boot already acquired. Weights and acquired files are shared; instances and their lifetimes are the session’s. A session whose service fails to bind dies alone and says why on the host’s log; the host keeps serving.

The bound set is put in reach as one context, `Services`, and the registry seeds that same context into every ability’s scope as it enables it. That is the whole mechanism behind `service(name)`: a read of a bag the platform filled.

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
