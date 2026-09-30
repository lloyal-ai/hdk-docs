---
title: "Abilities"
description: "A packaged capability — manifest, source, tools, skill — that any harness can enable. What the model learns about it, how it is built, how it is distributed and signed, and why it runs in-process."
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
| `configSchema` | Optional JSON Schema for operator-supplied config — read in the setup or at a tool’s call, see [The setup](#the-setup). |
| `services` | Optional. The services the Ability requires — `reranker`, `vision`, `embedding`. A service exists when the harness carries its block in `harness.yml` and the block resolves to a model — one it names, or for `vision` the projector paired with the reasoning model; the harness never provisions one because an Ability asked, and an Ability whose requirement the file does not name is refused at enable. The trunk model is never listed. |

### Services {#services}

**Abilities let your agents compose models.** `ability.json` declares `services: ["reranker"]`: the requirement, and a governed disclosure signed into the catalogue. The harness provides it by naming the model in `harness.yml` — `model.reranker: { id: qwen3-reranker-0.6b-q8 }` — and the ability reads it with one line, `yield* service("reranker")`, guaranteed to answer because an ability whose requirement is not configured is refused before its factory runs, naming the block. The ability gets a live model on a context of its own, never a promise of one.

**One provisioned model, several judgements.** The reranker exposes a single primitive — `scoreBatch(query, texts)`, a logit difference per text — and the judgements that ship are choices of *reference* against one criterion. `search` scores passages against the query for relevance. `delegate` scores proposed sub-tasks against the original query for entailment, dropping the ones that drifted, then against the caller’s own task for similarity, refusing work already running further up the tree. The criterion itself — the `<Instruct>` sentence — is bound once per reranker from `model.reranker.instruction`, so it is a harness-level decision rather than an Ability-level one. What that scoring decides — which chunks of a page or a corpus reach the model at all — is [context admission](/focal-lens).

Two Abilities that declare `reranker` share one instance. A harness that names no `model.reranker` loads none, and the Abilities that need one do not enable; the harness starts either way. The whole contract — what a service is, its lifecycle, what a bound one exposes, and how a new kind is added — is the [Services](/services) guide.

**The Abilities you install decide which models your application needs; `harness.yml` decides which it runs.** A plugin asks for a package. An Ability asks for a model, and the harness that names it has it.

### The setup {#the-setup}

**One signed artefact, bound to your data when you enable it.** The setup is a generator returning the parts, and its output is validated when the factory runs — the same moment the Ability comes alive against your instance of the domain.

| part | role |
| --- | --- |
| **source** | Access to a live system, plus retrieval intelligence: the tools getter, a contents advert, and a reranker-backed scorer. |
| **tools** | The actions. Each carries a JSON-Schema `parameters`, an `execute` generator that may read the Ability's config at the call, and a `protected` flag marking sensitive or write operations. |
| **skill** | The per-spawn preamble — *how* an agent should investigate with this Ability. Rendered per spawn, never folded into the shared spine. |

**Config is read where it is used, and that decides when a save applies.** An Ability’s stored config — the object `configSchema` describes — is read through `AbilityConfigStoreCtx`, from the setup and from any tool’s `execute`. Read in the setup, a value becomes a resource the Ability owns for its life: a corpus index built from a path, a pacer for keyless search. Read in a tool at the call, a value follows the reader’s save at once: the next search of every agent already holding the tool goes through the key saved a moment ago. Prefer the call for anything that is a value rather than a resource. A save under a live run re-enables the Ability either way; what a running agent already holds keeps working, on the build it took, until its run ends, and the next run takes the new build.

## Build one {#build-one}

```sh label="TERMINAL"
npx lloyal-ai ability:new jira --publisher acme
```

You get a complete, buildable Ability: a manifest, a source, two working tools, and a skill template. Edit `ability.json` first — particularly `useWhen` — then replace the tool bodies with your backend.

Tool descriptions and parameter schemas are not incidental either. They are rendered into the model's context and are what it reasons over when choosing a call, so they are worth the same care as `useWhen`.

## Tools {#tools}

A tool is the unit of action. The model sees only its name, description and parameter schema; everything else — how it runs, what it may cost, when the harness refuses it — is the runtime’s discipline, and it is worth knowing exactly, because your `execute` body runs *inside* that discipline, not beside it.

### The contract {#tool-contract}

Subclass `Tool<Args>` from `@lloyal-labs/lloyal-agents`. Four members are required; two flags and one value change how the runtime treats you.

| member | role |
| --- | --- |
| `name` · `description` · `parameters` | What the model reasons over when choosing a call. Rendered into context verbatim — worth the same care as `useWhen`. |
| `*execute(args, context)` | An Effection generator. **The return value is what the model reads** — JSON-serialised and prefilled into the agent’s context as the tool result. A domain failure is a result, not an exception: return `{ error: "…and what to do instead" }` and the agent pivots in one turn. Throw only when the run genuinely cannot continue. |
| `protected` | Open by default — read/gather tools stay callable by any agent, the frontier pattern. `true` marks a consequential action: the framework’s authorization gate refuses it unless the session holds a grant. The model can request; it cannot authorise. See [the trust boundary](#security). |
| `fanout` | Inline by default: `execute` runs on the single tick-loop fiber — safe for any tool, and *required* for anything that decodes on the main context (`delegate`, `plan`, anything nesting an agent pool). `true` moves it to a child fiber so one slow fetch never stalls the cohort — legal only when it issues **no native op on the main context**. A wrong `true` is a segfault; a wrong `false` is merely a parked loop. The default is the safe one. |
| `hooks` | What this tool says about the life of its own calls — a gate that may refuse one, what a completion means, what to do with a result that does not fit, a follow-up once a result is admitted. One value of one type, `ToolLifecycleHooks`, declared beside `protected` and `fanout` so a subclass inherits it. Every position is optional; the harness and the framework fill in the rest. See [the life of a tool call](#the-life-of-a-tool-call). |

**Transient failure is a first-class outcome.** Throw `ToolRetryError(message, retryAfterMs)` — rate limiting is the canonical case — and the pool parks the agent (`awaiting_tool`, skipped by PRODUCE at zero cost: no turns, no tokens, no KV) and re-executes the same call after the delay. The model never sees infrastructure weather in its context. How many times is an `afterExecute` decision — your own hook’s, the harness’s, else the framework’s default of one retry — after which an honest “unavailable — use other sources” result settles in the tool’s place, because at that point the outage is a fact the model needs. The park is observable end to end (`agent:tool_retry` on the bus, `tool:retry` in the trace), so a waiting agent is never mistaken for a hung one. One rule for the signal itself: it must travel as a *throw from execute* — never thrown across a scope you captured at construction time, which crashes that scope and everything it owns.

### Execution semantics {#tool-execution}

**Dispatch is per-agent serial, inter-agent concurrent.** Each agent has at most one call in flight — it parks until your result settles, which is the decision boundary that keeps its next token conditioned on what the tool actually said. Across agents, fan-out tools run concurrently behind a permit gate. Results return to the loop fiber, and SETTLE prefills them into the agent’s KV *under the pressure budget*: an oversized result defers while siblings finish and free cells, and only at a genuine stall is `beforeAdmit` asked — your hook, then the harness’s, else the framework drops — whether to shrink it to a directive or drop the agent to recovery. Your result reaching attention is admission, not delivery.

Everything the runtime knows on your behalf arrives as `context`:

| field | what it carries |
| --- | --- |
| `attachments` | The assets available to the run — what the host staged, then every root a tool result has admitted, in admission order. Roots only; a tool that needs the bytes resolves them through the store. |
| `explore` · `scorer` | The policy’s explore/exploit verdict for *this dispatch*, plus the entailment scorer to act on it. You read the flag; you never compute it. |
| `pressurePercentAvailable` | KV headroom at dispatch — recorded into your trace events so the funnel is attributable, never re-derived. |
| `onProgress` | Live progress (`{filled, total}`) → `agent:tool_progress` on the bus. |

Who is calling is ambient, not a field. Inside `execute`, `yield* CallingAgent.get()` is the calling agent: its `branch` to fork from (the `delegate` pattern above), and `attendedResults(tool)` — the arguments of this tool’s earlier calls whose results that agent actually read, its own and, by the fork, its ancestors’. That is how `read_file` never serves the same page twice: it asks what the branch already holds, not what a sibling did.

### Events out of execute {#tool-events}

**You record what happened; the surfaces read the record.** Inside `execute`, write trace events through the ambient writer — and that single write feeds three consumers. The file (`trace-*.jsonl`) carries it for replay. The pool’s per-dispatch wrapper stamps it with the calling agent and call id — real lineage, even though your code never knows who called it. And under `LLOYAL_DEV` the same write is mirrored live onto the event bus as `agent:trace`, where the dev pane renders it — the admission funnel, the exploit re-rank, your tool’s own vocabulary — with zero UI code in your Ability. In production the writer is a no-op and the mirror does not exist.

```ts label="src/tools/my-tool.ts"
const tw = yield* Trace.expect();
tw.write({ traceId: tw.nextId(), parentTraceId: null, ts: performance.now(),
  type: "rerank:end", topResults, selectedPassageCount, durationMs, tool: this.name });
// file + lineage + live pane, from one write — parentTraceId is stamped for you
```

**Retrieval tools should not hand-roll any of this.** `admitChunks` is the platform’s admission pipeline as one call: cross-encoder scoring with progress, the explore/exploit dual scoring, the selection gate — top-K within a token budget (page content) or a score floor with honest rejects (corpus) — and every funnel event above, written with the full numbers. Chunk your content, hand it over, render the result:

```ts label="src/tools/fetch-page.ts"
const admitted = yield* admitChunks(reranker, chunks, args.query, context, {
  tool: "fetch_page", url, select: { mode: "budget", topK, tokenBudget },
});
return { content: admitted.passages.map(p => p.text).join("\n\n---\n\n"),
         ...(admitted.alsoOnPage.length ? { alsoOnPage: admitted.alsoOnPage } : {}) };
```

The reference `fetch_page` and corpus `search` are both consumers of the same call — an Ability that uses it gets the dev pane’s admission view as a byproduct of using the mechanics.

### The life of a tool call {#the-life-of-a-tool-call}

A call passes through four moments on its way from the model’s output to the agent’s context, and at each one the pool asks one question. The answers come from three contributors of **one type**, `ToolLifecycleHooks`: the tool’s own `hooks`; the harness’s, a list of the same values carried as data on its policy; and the framework’s frame — the authorization gate, plus a default for every other moment. One rule composes them: **the first concrete decision wins, and `undefined` abstains.** The frame’s gate is asked first, because authorization precedes everything; the frame’s defaults are asked last, so every call ends with a decision. At every other moment your tool is asked before the harness.

| moment · the question | when | your answer | if nobody answers |
| --- | --- | --- | --- |
| `beforeDispatch`  
*May this call run?* | PRODUCE — the model emitted a call, before the policy routes it | a list of gates; a gate whose `reject(i)` returns `true` refuses the call with its `message` | it runs |
| `afterExecute`  
*Was that an attempt?* | DISPATCH (inline) or DRAIN (fan-out) — `execute` returned or threw | `attempt` · `retry { afterMs }` · `fail { message? }` | a `ToolRetryError` is retried once, then fails; anything else is an attempt |
| `beforeAdmit`  
*Shrink it, or stop the agent?* | SETTLE — the result does not fit and nothing can free room | `nudge { message }` · `drop` | drop |
| `afterAdmit`  
*Anything to say next?* | SETTLE — the item is on the agent’s ledger | `followUp { message }` · `none` | none |

#### `beforeDispatch`: may this call run {#beforedispatch-may-this-call-run}

Gates run on what the model emitted, *before* the policy routes it — so a gate’s message beats a budget nudge, and a call the policy swaps or rewrites is gated again at the dispatch. A gate is three things: a published `name` (the key a harness overrides it by, and the value on the trace — renaming it is a breaking change for your Ability), a `reject(i)` predicate, and the `message` the model reads in the call’s place. It sees the call as `{ tool, args, attended() }`, where `attended()` is the arguments of this tool’s earlier calls whose results were actually read — computed only if you ask, and in **the scope the harness chose**: the agent’s own lineage unless the harness widened the gate to the whole cohort. A gate does not choose its scope, and it does not list the tools it applies to: declared on a tool, it gates that tool; contributed by a harness, it selects by `i.tool`.

```ts label="src/tools/guards.ts"
export const urlDedup: ToolGuard = {
  name: "url_dedup",
  reject: ({ args, attended }) => {
    const url = trimmed(args.url);
    return !!url && attended().some((a) => trimmed(a.url) === url);
  },
  message: "This URL was already attempted in this run. Try a different source.",
};

// src/tools/fetch-page.ts — beside `protected` and `fanout`
readonly hooks: ToolLifecycleHooks = { beforeDispatch: [urlDedup] };
```

A refusal is booked on the agent as a `nudge` — the model reads your message as the tool result and pivots in one turn — and traced as `pool:agentNudge { guard: "url_dedup" }`. The framework’s own gate, `auth_reject`, runs before yours and cannot be switched off by any harness; its refusal is the one traced as `tool:authReject`.

#### `afterExecute`: was that an attempt {#afterexecute-was-that-an-attempt}

The call completed: `execute` returned a value, or it threw. The question is whether that counts. `attempt` lets it stand — a value goes on to admission, a throw ends the agent with a tool error. `retry { afterMs }` parks the agent, at no cost to its turns or its context, and runs the same call again; the model never sees the wait. `fail { message? }` settles a failure the model reads in the tool’s place — give a message, or the pool says only that the tool failed and will not be retried. You are told which `attempt` this is, so a budget is one comparison. The framework’s default is the rate-limit rule above; a hook that recognises a transient failure inside a *returned* value — a provider’s 429 wrapped in a 200 — belongs here too.

#### `beforeAdmit`: the result does not fit {#beforeadmit-the-result-does-not-fit}

Asked only at a genuine stall: the result cannot be placed without breaking the agent’s reserve, and nothing in the pool — no sibling finishing, no retry due — can still free room. You see the `cost` of placing it, in the unit `pressure.headroom` reports room in, and the pool’s terminal tool when it has one. `nudge { message }` replaces the result with your message, booked as a `nudge` and never attended; `drop` ends the agent and hands it to recovery. The default policy nudges (“report your findings now within N words”) when there is a terminal tool to report with and the agent has called something; the framework’s default is to drop. On the trace a contributor’s drop reads `pressure_settle_reject`; the framework’s default reads `settle_stall_break`.

#### `afterAdmit`: the item is on the ledger {#afteradmit-the-item-is-on-the-ledger}

Runs once per admitted item, after admission — a deferred item when it finally lands, a dropped item never, a recovery prompt never. You are shown the `outcome` (`toolResult` or `nudge`) and the `result` exactly as the agent received it: your value with the framework’s meter on it, or a nudge’s `{ error }`. Return `followUp { message }` and the message is placed after the result for the model to read before it calls again — a reflection prompt, or a hint that a refusal means “report now”. A hook that throws yields no follow-up and cannot touch the admission.

#### Whose decision is whose {#whose-decision-is-whose}

-   **Yours:** the gates that make sense for your tool, and what its completions and results mean. Declared once, they travel with the Ability.
-   **The harness’s:** scope, by gate name, from `harness.yml` — `defaults.guards: { url_dedup: { scope: cohort } }` widens your gate to every agent in the pool (research: sibling agents feed one synthesis); `url_dedup: false` switches it off (a spreadsheet: isolated rows must not see each other’s fetches). And its own hooks, asked after yours.
-   **The framework’s:** authorization, first and non-negotiable; the defaults, last. [The policy page](/agent-policy-and-context-pressure#the-harnesss-part-of-a-tool-calls-life) has the harness’s side.

Two of the policy’s decisions still land on you from outside this contract, and knowing them saves re-implementing them inside `execute`: **explore/exploit** is decided per dispatch by `shouldExplore` and handed to you as `context.explore` (`admitChunks` acts on it for you); and **budgets speak through results** — an over-budget agent’s next call is replaced with a nudge naming its remaining word budget, which is why a result that is *selective* beats one that is complete.

## A signed record of everything it says to your model {#the-attention-surface}

**You can read what an Ability puts in your context window without running its code.** At publish time the CLI constructs your Ability and reads back what it actually registers — every tool name, description and parameter schema, plus the skill template. That is written into the tarball as `attention-surface.json`, so the signature covers it.

This exists so a reviewer, and anyone installing, can read **exactly what an Ability injects into a model's context without executing its code**. It is derived from the code rather than declared, so it reports what the Ability really does, not what its author says it does.

```sh label="TERMINAL"
What acme/jira adds to your model's context:
  protocol:  jira_research
  use when:  investigating tickets, their history and linked work
  tools:     jira_search, jira_fetch
```

## Distribution {#distribution}

An Ability is a signed npm tarball. Two routes put it in a harness's `node_modules`, and both converge on the same runtime path — a plain static `import` of the factory, handed to `registry.enable`. There is no runtime "load an Ability by name" verb.

### The signed channel {#the-signed-channel}

**Deep access is the reason for the gate, and the gate is what makes deep access safe.** Anything reaching a harness that does not own it flows through `apps.lloyal.ai`: reviewed for contract conformance, tool safety, manifest validity and signature provenance before listing. A first-party harness may also depend on an Ability it owns from a private source, as an ordinary npm dependency — not a parallel public path.

The framework points at that catalogue by default. The install command takes a *name*, never a URL; the catalogue URL and the Ed25519 trust roots are compile-time constants. Every harness therefore resolves Abilities through the same verified channel, and the protocol does not fragment into incompatible sub-catalogues.

### Installing {#installing}

```sh label="TERMINAL"
npx lloyal-ai install acme/jira@^1.2.0
```

**One command, and a verified chain from publisher to process.** The install verifies before anything is written: it fetches the signed catalogue and checks its Ed25519 signature against the vendored trust roots; resolves your semver range to a version the catalogue pins; fetches the manifest and cross-checks name, version and size; fetches the tarball and verifies the signature over its raw bytes; then cross-checks a sha512 integrity digest. Only then is the package vendored and installed. A failure at any step rolls back — nothing unverified is left behind.

## The trust boundary is the prompt {#security}

Abilities run **in-process** with the model. That is the performance story — no IPC, no serialisation on the hot tool path, one shared spine across many agents — and it is also the security story: with no process boundary, the trust boundary becomes the prompt itself.

### Three attacks {#three-attacks}

1.  **Catalogue escape.** An Ability-supplied string interpolated into the shared spine could carry a newline, a fake role marker, or a code fence — convincing the model the catalogue has ended and the prompt is now elsewhere.
2.  **Cross-ability injection.** Abilities share one prompt surface. A web page fetched by one Ability could contain text instructing the model to call another Ability's tool.
3.  **Unauthorised writes.** A model may decide to call a write tool because of a planning mistake or an injected page. It must not be able to perform the write without the session — not the model — having consented.

### The defences {#the-defences}

**An Ability writes into the model’s attention, so what it may say is fixed before it runs.** Metadata is grammar-constrained at definition time. Names match a strict pattern; `useWhen` is length-bounded and rejects role markers, code fences and newlines; the skill may not re-emit the boundary marker; tool names must match the manifest exactly. These checks throw synchronously, so a malformed Ability never enters the registry, and the worst case is a rejected Ability rather than a compromised spine.

**Every per-spawn message is prefixed with a boundary marker** naming the protocol in force, so instructions arriving through fetched content are read as content inside a discipline rather than as a new instruction frame.

**Sensitive tools are marked `protected`** and require session-level consent. The model can request; it cannot authorise.
