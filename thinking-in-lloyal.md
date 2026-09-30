---
title: "Thinking in Lloyal"
description: "How owned lifetimes, live inference state, Agents, Tools, orchestration, finality, and continuity fit together."
lede: "Structured concurrency, scoped capabilities, and live inference state"
---

Lloyal gives applications control through inference rather than only around model calls. [Build with Lloyal](/) introduces that architectural shift; this guide explains the execution model that makes it possible. Lloyal gives application code structured ownership of both the work being performed and the model's live inference-state tree.

A query can create a temporary inference subtree, fork concurrent Agents from shared state, route evidence into selected lineages, change what receives further work, commit the accepted result, and reclaim the entire working tree when its owning scope ends.

Lloyal makes those relationships explicit directly in TypeScript.

::: pull
**A harness is a tree of owned lifetimes governing a tree of live inference state.**
:::

Structured ownership determines what lives and dies together. Application control determines what the owned execution does next.

The quickest way into the model is to follow one query from command to committed result.

## The execution stack {#the-execution-stack}

A Lloyal harness programs intelligence over a branch-aware inference stack.

<div aria-label="The Lloyal execution stack" class="execution-stack" role="group"><div class="stack-layer stack-layer--harness"><div class="stack-layer-name">Harness</div><div class="stack-layer-copy">Application procedure · product behaviour · domain rules</div></div><div class="stack-connector"><span>programs</span></div><div class="stack-layer"><div class="stack-layer-name">Harness Development Kit</div><div class="stack-layer-copy stack-components"><div class="stack-component"><a href="https://www.npmjs.com/package/@lloyal-labs/sdk" rel="noopener noreferrer" target="_blank"><code>@lloyal-labs/sdk</code></a><span class="stack-component-desc">Live inference-state primitives used by the HDK</span></div><div class="stack-component"><a href="https://www.npmjs.com/package/@lloyal-labs/lloyal-agents" rel="noopener noreferrer" target="_blank"><code>@lloyal-labs/lloyal-agents</code></a><span class="stack-component-desc">Agents · Tools · orchestration · policy · grants · replay</span></div><div class="stack-component"><a href="https://frontside.com/effection/guides/v4/collections/" rel="noopener noreferrer" target="_blank">Effection</a><span class="stack-component-desc">Operations · scopes · resources · collections · structured concurrency</span></div></div></div><div class="stack-connector"><span>executes through</span></div><div class="stack-layer stack-layer--bindings"><div class="stack-layer-name">Platform bindings</div><div class="stack-layer-copy stack-components"><div class="stack-component"><a href="https://github.com/lloyal-ai/lloyal.node" rel="noopener noreferrer" target="_blank"><code>@lloyal-labs/lloyal.node</code></a><span class="stack-component-desc">Node.js · desktop · server</span></div><div class="stack-component"><code>@lloyal-labs/lloyal-react-native</code><span class="stack-component-desc">React Native · JSI · mobile (planned)</span></div></div></div><div class="stack-connector"><span>binds</span></div><div class="stack-layer stack-layer--kernel"><div class="stack-layer-name"><a href="https://github.com/lloyal-ai/liblloyal" rel="noopener noreferrer" target="_blank">liblloyal</a></div><div class="stack-layer-copy">KV tenancy · Branched Inference · fork and prune · Continuous Tree Batching</div></div><div class="stack-connector"><span>extends</span></div><div class="stack-layer stack-layer--runtime"><div class="stack-layer-name"><a href="https://github.com/ggml-org/llama.cpp" rel="noopener noreferrer" target="_blank">llama.cpp</a></div><div class="stack-layer-copy">Model loading · tokenisation · sampling · CPU and accelerator backends</div></div></div>

Each layer establishes a different part of the execution model.

-   **[llama.cpp](https://github.com/ggml-org/llama.cpp)** executes the model across CPU and accelerator backends.
-   **[liblloyal](https://github.com/lloyal-ai/liblloyal)** gives resident inference state identity, lineage, KV tenancy, fork-and-prune semantics, and batched execution across a live branch tree.
-   **Platform bindings** preserve those semantics in each host runtime through [`@lloyal-labs/lloyal.node`](https://github.com/lloyal-ai/lloyal.node) today, with `@lloyal-labs/lloyal-react-native` planned for mobile.
-   **The HDK** combines [`@lloyal-labs/sdk`](https://www.npmjs.com/package/@lloyal-labs/sdk), [`@lloyal-labs/lloyal-agents`](https://www.npmjs.com/package/@lloyal-labs/lloyal-agents), and [Effection](https://frontside.com/effection/guides/v4/collections/) into the public harness programming model.
-   **The harness** defines the application procedure: what work exists, what state it inherits, what may happen next, and what becomes durable.

The package names identify the layers that make the HDK work; harness authors normally program its high-level surfaces rather than composing `@lloyal-labs/sdk` directly.

[**Effection**](https://frontside.com/effection/guides/v4/collections/) is the structured-concurrency library used by the HDK. It gives asynchronous work an ownership tree: Operations run inside scopes, child work cannot silently outlive its owner, cancellation propagates through descendants, and cleanup belongs to the scope that acquired the resource.

**liblloyal gives inference a tree of live states. Effection gives application work a tree of owned lifetimes. The HDK aligns the two.**

Generator functions and `yield*` are how Effection represents scoped Operations in TypeScript. They are the syntax of the lifetime model, not Lloyal's architectural idea.

Harness developers program the application procedure through the HDK; the layers beneath it preserve those semantics down to resident model execution.

---

## What happens when a query runs {#what-happens-when-a-query-runs}

```text label="Structure"
Session
└── harness                                      stays alive and owns the work
    └── query Operation
        ├── withSpine                            borrows shared inference state
        │   └── AgentPool                        owns Agent execution
        │       ├── orchestrator                 declares task relationships
        │       ├── Agents                       branches with intent
        │       └── AgentPolicy                  decides what happens next
        └── answer
            └── session.commitTurn(...)          makes the result durable
```

A command arrives while the harness is alive.

The query runs beneath that harness, so its lifetime is already accounted for. It may fork a spine from the Session trunk, giving a cohort of Agents a shared line of attention. The orchestrator declares which tasks can proceed together and which depend on earlier findings. The AgentPool advances the resulting branches as a cohort. Policy is consulted at explicit lifecycle boundaries, while Tools and application state supply evidence and domain meaning.

While the query is underway, ordinary application code can observe branch and Agent state, resource pressure, Tool history, validators, and product state. It can then expand or prune topology, change retrieval mode, admit different evidence, continue or recover selected lineages, permit or reject consequential actions, and decide which result becomes continuing state.

When the run finishes, findings leave the temporary inference tree as ordinary data. The accepted answer is committed to the Session. The spine and worker branches are reclaimed.

If the Session disappears before that happens, the ownership tree unwinds the work instead.

That is the core model. The rest of the guide gives each relationship a precise shape.

### Three structures, one control loop {#three-structures-one-control-loop}

The same query looks different depending on the question being asked.

#### Ownership: what ends together? {#ownership-what-ends-together}

```text label="Structure"
Session
└── harness
    ├── event forwarder
    └── query
        ├── pool
        └── synthesiser
```

This is the **lifetime tree**, managed by Effection. It determines cancellation and cleanup.

#### Inference: what attention state is inherited? {#inference-what-attention-state-is-inherited}

```text label="Structure"
session trunk
└── query spine
    ├── researcher branch A
    └── researcher branch B
```

This is the **inference-state tree**. It determines sharing, lineage, and pruning.

#### Workflow: what depends on what? {#workflow-what-depends-on-what}

```text label="Structure"
landscape
├── domain A
├── domain B
└── domain C
        ↓
    synthesis
```

This is the **orchestration graph**, programmed by the harness. It determines collaboration and dependency.

#### Control: what can change next? {#control-what-can-change-next}

```text label="Structure"
observe live execution
        ↓
combine with application state
        ↓
make a decision
        ↓
change topology · evidence · inference
lifecycle · authority · continuity
        ↓
observe the resulting execution
```

This is not a fourth graph. It is the harness's control loop over the other three structures.

The structures often line up, but they are not interchangeable. An Agent can inherit from one branch, depend logically on another task, and still be owned by a broader query scope. The control loop may observe all three, but it acts through explicit surfaces and lifecycle boundaries rather than through one omnipresent supervisor.

#### Six questions for reading any Lloyal program {#six-questions-for-reading-any-lloyal-program}

1.  **Who owns this work?**
2.  **Which live state does it inherit?**
3.  **What may enter or transform that state?**
4.  **Who decides what happens next, and at which boundary?**
5.  **What may become an accepted result or external consequence?**
6.  **What survives when the scope ends?**

Those questions scale from a single Tool call to an adaptive multi-stage harness.

### Five key concepts {#five-key-concepts}

#### Work always belongs somewhere {#work-always-belongs-somewhere}

An `Operation<T>` does not float like an eager Promise. It runs beneath a scope that owns its completion, failure, children, and cleanup.

```ts label="TypeScript"
const result = yield* operation;
```

Read `yield*` as:

> **Perform this work here, under the current owner.**

#### Live attention is a resource {#live-attention-is-a-resource}

A Branch represents a live line of model state, not a transcript reference. A spine can be borrowed, extended, inherited, transformed, and pruned. Its lifetime therefore belongs in the program's structure.

```ts label="TypeScript"
const findings = yield* withSpine(options, function* (spine) {
  return yield* runResearch(spine);
});
```

#### Agents are managed, not launched {#agents-are-managed-not-launched}

An Agent is a branch with intent, policy-relevant state, history, and a result. It is not one Effection Task and not one remote model request.

The AgentPool owns Agents and advances all runnable branches through a shared inference loop.

#### Control happens at explicit boundaries {#control-happens-at-explicit-boundaries}

Different parts of the harness control different dimensions of the execution:

-   orchestration decides which lineages exist, where they inherit from, and what depends on what;
-   `AgentPolicy` decides at production, dispatch, exit, settlement, retry, and recovery boundaries;
-   Tools acquire and transform external information for a selected lineage;
-   direct Branch operations can inspect or shape next-token inference when a specialised operator needs them;
-   Session and spine operations decide what becomes inherited or continuing state.

There is no single “reasoning policy” object that secretly owns the whole program. The behaviour emerges from ordinary code composed across these boundaries.

#### Finality, authority, and durability are explicit {#finality-authority-and-durability-are-explicit}

```text label="Structure"
model proposal
≠ accepted application result
≠ permitted external action
≠ continuing Session state
```

A terminal Tool or policy decision may accept a result. A guard or grant may determine whether a proposed action is allowed. The application may require additional evidence, validation, or approval. The resulting state becomes durable only through an explicit continuity decision.

```ts label="TypeScript"
yield* call(() => session.commitTurn(query, answer));
```

Data can leave a scope. Owned runtime state normally cannot.

### `withSpine`: borrow live attention, return durable findings {#withspine-borrow-live-attention-return-durable-findings}

`withSpine` is the clearest expression of the Lloyal model:

```ts label="TypeScript"
const notes = yield* withSpine(
  {
    parent: session.trunk ?? undefined,
    systemPrompt,
    tools,
  },
  function* (spine) {
    const pool = yield* agentPool({
      parent: spine,
      tools,
      terminal: reportTool,
      orchestrate: parallel(tasks),
    });

    return pool.agents
      .map((agent) => agent.result)
      .filter((result): result is string => Boolean(result));
  },
);
```

Read it as:

> Borrow a shared line of live attention, perform owned work inside it, return durable findings, then reclaim the temporary inference subtree.

`withSpine` creates or forks a spine, performs its body, and prunes the spine subtree when the body returns, throws, or is halted.

> **Data may leave a scope. Owned runtime state normally may not.**

This is valid:

```ts label="TypeScript"
return agents.map((agent) => agent.result);
```

The strings survive.

This is normally wrong in intent:

```ts label="TypeScript"
return spine;
```

The JavaScript handle may escape, but the branch is disposed when `withSpine` closes.

An API that genuinely transfers branch ownership should say so explicitly.

---

#### What this changes {#what-this-changes}

-   Concurrent Agents inherit shared attention instead of reconstructing context.
-   Cancellation reclaims both application work and its inference subtree.
-   Findings can survive without keeping worker branches alive.
-   Durable conversation state changes only through explicit commit.
-   Application code can change topology, evidence flow, lifecycle, and continuity while the execution is underway.

### Four lines that carry the model {#four-lines-that-carry-the-model}

```ts label="TypeScript"
const value = yield* operation;
```

Perform owned work and resume with its result.

```ts label="TypeScript"
const task = yield* spawn(operation);
```

Start concurrent work without detaching it from the current scope.

```ts label="TypeScript"
const findings = yield* withSpine(options, body);
```

Borrow live inference state, return durable data, and reclaim the temporary subtree.

```ts label="TypeScript"
yield* call(() => session.commitTurn(query, answer));
```

Cross into a Promise boundary and persist the result explicitly.

### How the guide unfolds {#how-the-guide-unfolds}

The execution stack establishes the architectural boundary. From there, the guide deepens the model in the same order a harness executes it:

1.  **[Own the work](#own-the-work)** — harness scopes, Operations, `yield*`, `spawn`, and cohorts.
2.  **[Own the state](#own-the-state)** — Agents, branches, spines, trunks, Context, and resources.
3.  **[Compose behaviour](#compose-behaviour)** — Tools, orchestration, policy boundaries, and consequence.
4.  **[Exit cleanly](#exit-cleanly)** — completion, failure, halt, cleanup, and Promise integration.
5.  **[Read it in code](#read-it-in-code)** — the basic harness with the ownership model annotated.
6.  **[Advanced patterns](#advanced-patterns)** — adaptive control, direct inference programming, acceptance, continuation, and replay.

The first sections establish the mental model. Advanced patterns shows what qualitatively different programs those relationships can express together.

---

## Own the work {#own-the-work}

### A harness is a scope {#a-harness-is-a-scope}

The application contract is deliberately small:

```ts label="TypeScript"
export function* harness(
  ctx: SessionContext,
  events: EventBus<WorkflowEvent>,
  commands: Signal<Command, void>,
): Operation<void> {
  // Your intelligent application lives here.
}
```

The function remains alive for the Session.

Its arguments establish the application boundary:

-   `ctx` is the resident model and native Session context;
-   `events` carries application events down to whichever surface is mounted;
-   `commands` carries typed commands from that surface back into the harness;
-   `Operation<void>` says the harness is a scoped asynchronous program.

A typical lifetime looks like this:

```text label="Structure"
served Session
└── harness
    ├── enabled Abilities
    ├── event-forwarding task
    └── command loop
        └── query
            ├── temporary spine
            │   └── agent pool
            │       ├── researcher
            │       └── researcher
            └── synthesiser
```

When the Session is released, the harness scope ends. Its child tasks, subscriptions, Tool executions, pools, and temporary inference branches unwind with it.

You do not need to manually enumerate every outstanding child and cancel it.

The ownership tree already knows.

### `Operation<T>`: work waiting for an owner {#operation-t-work-waiting-for-an-owner}

An Effection `Operation<T>` is not an eager `Promise<T>`.

It is a description of asynchronous work that can be performed inside a scope:

```ts label="TypeScript"
function* lookupCustomer(id: string): Operation<Customer> {
  // ...
}
```

Calling an operation-producing function does not yet say what should own it:

```ts label="TypeScript"
const operation = lookupCustomer(id);
```

An Operation must be:

-   performed with `yield*`;
-   started as a child with `spawn`;
-   joined with `all` or `race`;
-   returned to the caller;
-   or handed to another API that explicitly owns Operations.

> **Every `Operation` must be yielded, spawned, joined, raced, returned, or deliberately transferred to another owner. Never leave one floating.**

### What `yield*` means in Lloyal {#what-yield-means-in-lloyal}

The operative definition is:

> **`yield*` performs an Operation here, as part of the current scope, and resumes with its result.**

Read:

```ts label="TypeScript"
const result = yield* operation;
```

as:

> Do this work here, under the current owner.

Three outcomes are possible:

```text label="Structure"
current scope
└── operation
    ├── returns a value  → resume with the value
    ├── throws an error  → propagate the error here
    └── owner is halted  → unwind the operation with its owner
```

`yield*` resembles `await` because it suspends and later resumes with a value.

But “`yield*` is Effection’s spelling of `await`” is incomplete. It omits the ownership guarantee.

#### Do not teach bare `yield` {#do-not-teach-bare-yield}

Harness authors use `yield*`, not bare `yield`.

Bare `yield` belongs to JavaScript’s generator protocol. The Lloyal programming model composes Operations with `yield*`.

### `spawn`: concurrency without orphaned work {#spawn-concurrency-without-orphaned-work}

The basic harness forwards agent events while it separately listens for commands:

```ts label="TypeScript"
const { session, events: agentEvents } = yield* initAgents(ctx);

yield* spawn(function* () {
  for (const event of yield* each(agentEvents)) {
    events.send(event);
    yield* each.next();
  }
});

for (const command of yield* each(commands)) {
  // ...
  yield* each.next();
}
```

`yield* spawn(...)` does not wait for the child body to finish.

`spawn()` completes after creating and attaching a live child Task. The parent continues while the child runs concurrently.

```text label="Structure"
harness
├── event forwarder
└── command loop
```

The child remains owned. If the harness exits, the forwarder is halted automatically.

#### Avoid fire-and-forget {#avoid-fire-and-forget}

This work has no visible structured owner:

```ts label="TypeScript"
void someAsyncLoop();
```

or:

```ts label="TypeScript"
somePromiseReturningFunction();
```

Use `spawn()` when work should continue concurrently under the current scope.

### `all`: a concurrent cohort {#all-a-concurrent-cohort}

Orchestrators use `all()` when several Operations should run concurrently and complete as a cohort:

```ts label="TypeScript"
const agents = yield* all(
  tasks.map((task) => ctx.spawn(task)),
);

yield* all(
  agents.map((agent) => ctx.waitFor(agent)),
);
```

This means:

1.  create the Agents as a cohort;
2.  wait for every Agent to finish;
3.  propagate failure through the same structured scope.

It does not imply one model request or one JavaScript fiber per Agent.

---

## Own the state {#own-the-state}

### An Agent is not an Effection task {#an-agent-is-not-an-effection-task}

An Agent is a branch with intent:

```text label="Structure"
Branch
+ task
+ policy
+ grammar and sampler state
+ tool history
+ result provenance
= Agent
```

Agents are plain objects managed by the AgentPool.

They are not:

-   independent Effection resources;
-   one fiber each;
-   one HTTP request each;
-   one model endpoint call each.

The pool advances all runnable branches through a phased loop:

```text label="Structure"
SPAWN + EXTEND
      ↓
PRODUCE
      ↓
COMMIT
      ↓
DRAIN
      ↓
SETTLE
      ↓
DISPATCH
```

The AgentPool owns execution. BranchStore batches inference. An orchestrator determines which Agents should exist and which dependencies must be satisfied.

### Agents sit across three structures {#agents-sit-across-three-structures}

An Agent's owner, inherited attention, and logical dependencies are separate facts. Use the [three-structures model](#three-structures-one-control-loop) before inferring one tree from another.

### A spine is not the Session trunk {#a-spine-is-not-the-session-trunk}

These branches have different jobs.

#### Session trunk {#session-trunk}

The trunk represents durable conversational state:

```ts label="TypeScript"
yield* call(() => session.commitTurn(query, answer));
```

A later query can inherit the committed turn.

#### Temporary spine {#temporary-spine}

A spine is a scoped workspace:

-   it may fork from the trunk;
-   it may hold a shared system-and-tools header;
-   `chain` may extend it between tasks;
-   nested Agents may inherit from it;
-   it is reclaimed when its scope ends.

The common pattern is:

```text label="Structure"
durable trunk
└── temporary query spine
    ├── temporary worker A
    └── temporary worker B

worker findings escape as data
        ↓
answer is committed to trunk
```

Do not use branch survival as persistence.

### Context: inherited capability, not global state {#context-inherited-capability-not-global-state}

Lloyal uses Effection Context so descendant Operations can access runtime capabilities without manually threading every value through every call.

`initAgents()` installs capabilities such as:

-   the active `SessionContext`;
-   the active `BranchStore`;
-   the Agent event channel;
-   the trace writer.

Descendants can read them:

```ts label="TypeScript"
const ctx = yield* Ctx.expect();
const store = yield* Store.expect();
const events = yield* Events.expect();
```

During Tool dispatch, the runtime can install narrower facts:

-   `CallingAgent`;
-   `TraceParent`;
-   current grants;
-   the current shared spine format.

The rule is:

> **Ambient, but not global. Inherited, but only inside the owning scope.**

A nested scope may shadow a Context value for its own descendants without mutating unrelated siblings.

Context answers:

> What is available here?

Scope answers:

> How long is it available?

### Resources: acquire a live capability {#resources-acquire-a-live-capability}

Some Operations do not merely compute a value and finish. They expose a live capability while keeping backing work alive beneath the caller.

`useAgentPool()` is a resource. It can expose a Subscription while the pool and its branches remain live.

```text label="Structure"
yield* resource
        ↓
receive live capability
        ↓
use it inside this scope
        ↓
scope exits
        ↓
provider halts and resources clean up
```

So `yield*` can mean:

> Acquire this capability and keep its provider alive beneath me.

Higher-level `agentPool()` composes the resource and returns a completed result with branches cleaned up. Most harness authors should prefer it unless they deliberately need the lower-level live pool.

---

## Compose behaviour {#compose-behaviour}

> **Post-training produces a tendency. A harness produces a procedure.**

The model supplies language, representation, judgement, and learned competence. The harness supplies the application-specific procedure: which state exists, what evidence enters it, when work changes course, what counts as completion, and what may become consequence.

### Tools are scoped evidence programs {#tools-are-scoped-evidence-programs}

A Tool returns an Operation:

```ts label="TypeScript"
class SearchTool extends Tool<{ query: string }> {
  readonly name = "search";
  readonly description = "Search the corpus";
  readonly parameters = {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  };

  *execute(args: { query: string }): Operation<unknown> {
    return yield* call(() => this.search(args.query));
  }
}
```

A Tool runs for a particular Agent. Its result returns to that Agent's continuing lineage, where inference resumes with the new information.

A Tool can:

-   acquire information from an external service or local source;
-   score, filter, redact, validate, or transform material before returning it;
-   emit progress and read scoped Context;
-   inspect pressure, exploration mode, and peer Tool history through its `ToolContext`;
-   call `withSpine` or start a nested AgentPool;
-   fork nested work from the calling Agent's branch so it inherits the caller's live state.

Acquisition and admission are separate concerns:

```text label="Structure"
retrieve or calculate evidence
        ↓
rank · filter · redact · validate
        ↓
return to the calling Agent
        ↓
prefill into that lineage
        ↓
continue inference from transformed state
```

The Tool runs inside the pool's scope. It is not ownerless background work, and its result is not broadcast to every lineage unless the harness explicitly makes it shared state.

### Structured ownership does not imply every operation is concurrency-safe {#structured-ownership-does-not-imply-every-operation-is-concurrency-safe}

The pool protects the main `llama_context` with a single-loop discipline.

By default, a Tool executes inline on the pool loop. This is safe even when it:

-   invokes `useAgent`;
-   starts a nested pool;
-   touches the calling branch;
-   performs native work on the main context.

A Tool may opt into off-loop execution only when it guarantees that it performs no native operation on the main context:

```ts label="TypeScript"
readonly fanout = true;
```

Appropriate cases include:

-   network I/O;
-   pure CPU work;
-   a separate reranker context that serialises itself.

A wrong `false` may reduce throughput.

A wrong `true` may violate native safety.

Keep these concepts separate:

-   **agent fan-out**: an orchestration shape;
-   **off-loop Tool execution**: an execution-safety declaration.

### Control is split across explicit boundaries {#control-is-split-across-explicit-boundaries}

The harness can govern a continuing execution without pretending every decision belongs in one abstraction.

| Surface | The decision it owns |
| --- | --- |
| Orchestrator | Which lineages exist, where they fork from, what depends on what, and what findings extend the spine |
| `AgentPolicy` | Whether output is accepted, a Tool is dispatched, retrieval explores or exploits, a lineage exits, failed work retries, or incomplete work recovers |
| Tool or scorer | What information is acquired, transformed, admitted, withheld, or returned |
| Branch operations | How a specialised program samples, validates, steers, constrains, forks, or merges inference state |
| Session and spine | Which accepted state becomes inherited, durable, or canonical |
| Guards and grants | Whether a proposed Tool call is permitted to create external consequence |

Use the highest-level surface that expresses the invariant. Drop to direct Branch operations when the requirement is inherently about token selection, logits, search, or state promotion—not merely because a lower-level operation exists.

### In Lloyal, control flow is orchestration {#in-lloyal-control-flow-is-orchestration}

An orchestrator is an ordinary Operation over `PoolContext`:

```ts label="TypeScript"
type Orchestrator = (ctx: PoolContext) => Operation<void>;
```

JavaScript control flow remains the language of orchestration.

#### Parallel breadth {#parallel-breadth}

```ts label="TypeScript"
const agents = yield* all(
  tasks.map((task) => ctx.spawn(task)),
);

yield* all(
  agents.map((agent) => ctx.waitFor(agent)),
);
```

#### Sequential depth {#sequential-depth}

```ts label="TypeScript"
for (const step of steps) {
  const agent = yield* ctx.waitFor(
    yield* ctx.spawn(step.task),
  );

  if (agent.result && step.userContent) {
    yield* ctx.extendSpine(step.userContent, agent.result);
  }
}
```

#### Conditional work {#conditional-work}

```ts label="TypeScript"
if (ctx.canFit(estimatedTokens)) {
  yield* ctx.waitFor(
    yield* ctx.spawn(task),
  );
}
```

#### Dependencies {#dependencies}

A dependent node can simply perform the Task representing its dependency before it spawns.

You do not need to encode every workflow into a generic graph DSL.

> **Loops, conditions, errors, and lexical scopes are orchestration primitives.**

#### Encode invariants as structure, not mode flags {#encode-invariants-as-structure-not-mode-flags}

A production harness should branch because the work has a different structural requirement, not because a generic `mode` string happened to select another path.

Examples:

-   a warm Session trunk enables continuation because there is state to inherit;
-   multiple independent findings justify synthesis because there is something to aggregate;
-   one finding can become the answer directly;
-   dependent work uses a chain because later tasks must inherit earlier accepted findings;
-   independent work uses parallel execution because no dependency exists;
-   only accepted findings extend the spine.

The structure explains the behaviour and makes the invariant reviewable in code.

### Finality, authority, and continuity are different decisions {#finality-authority-and-continuity-are-different-decisions}

```text label="Structure"
model proposes
      ↓
policy and completion conditions
      ↓
application accepts
      ↓
guard · grant · approval where required
      ↓
external consequence
      ↓
explicit continuity decision
```

A model proposal is only a candidate. Policy can reject it or require more evidence. A protected Tool can still be denied when the Session lacks a grant. An allowed Tool call can still fail. A successful action does not automatically decide which branch or answer becomes continuing state.

Keeping these boundaries distinct prevents a schema-valid model output from silently becoming an institutionally wrong action.

---

## Exit cleanly {#exit-cleanly}

### Normal completion, failure, and halt {#normal-completion-failure-and-halt}

These endings are different.

#### `return` {#return}

The Operation completed normally:

```ts label="TypeScript"
return answer;
```

Its parent resumes with the value.

#### `throw` {#throw}

The Operation failed:

```ts label="TypeScript"
throw new Error("No Ability is enabled");
```

The error propagates to the nearest recovery boundary:

```ts label="TypeScript"
try {
  const answer = yield* runQuery(query);
} catch (error) {
  events.send({
    type: "error",
    message: String(error),
  });
}
```

#### Parent halt {#parent-halt}

The owner disappears:

```text label="Structure"
connection closes
    ↓
Session is released
    ↓
harness scope halts
    ↓
children and resources unwind
```

This is lifetime termination, not a domain-level AgentPolicy decision.

Graceful wind-down, Agent recovery, and per-Agent cancellation occur inside a still-live scope and are covered in the AgentPolicy guide.

### `ensure`: cleanup belongs to the owner {#ensure-cleanup-belongs-to-the-owner}

Use `ensure()` when a scope must perform cleanup as it exits:

```ts label="TypeScript"
let tookPermit = false;

yield* ensure(() => {
  if (tookPermit) permits.release();
});

yield* permits.acquire();
tookPermit = true;
```

Cleanup runs when the scope:

-   returns normally;
-   throws;
-   or is halted by its parent.

The same principle is embedded throughout the framework:

-   Agent setup registers branch pruning;
-   `withSpine` prunes its subtree;
-   bindings register disposers;
-   subscriptions end with their scopes.

Do not design around remembering cleanup later.

> Make cleanup structurally inseparable from ownership.

### `call`: crossing the Promise boundary {#call-crossing-the-promise-boundary}

Lloyal code often invokes ordinary synchronous or Promise-returning APIs:

```ts label="TypeScript"
const modelPath = yield* call(() =>
  resolveModel({ projectRoot, role: "llm", spec }),
);
```

Use `call()` for:

-   filesystem APIs;
-   network clients;
-   Promise-based SDKs;
-   async Session methods;
-   native wrappers returning Promises.

#### `call()` does not make external work magically cancellable {#call-does-not-make-external-work-magically-cancellable}

When the owner ends, Effection can stop waiting and unwind its side.

Whether the underlying activity physically stops depends on the integration:

-   an abort-aware fetch can stop;
-   a child process can be killed if cleanup is registered;
-   an arbitrary third-party Promise may continue internally.

For long-running work, bind the provider’s `AbortSignal`, disposer, or cancellation API to the Effection scope.

---

## Read it in code {#read-it-in-code}

### The basic harness, annotated {#the-basic-harness-annotated}

```ts label="TypeScript"
export function* harness(ctx, events, commands): Operation<void> {
  const { session, events: agentEvents } = yield* initAgents(ctx);
  // Install the Agent runtime in this harness scope.

  yield* spawn(function* () {
    for (const event of yield* each(agentEvents)) {
      events.send(event);
      yield* each.next();
    }
  });
  // Start an event-forwarding child owned by the harness.

  const registry = yield* createAppRegistry({ configStore });
  // Acquire the Ability registry and its scoped capabilities.

  for (const app of apps) {
    yield* registry.enable(app);
  }
  // Enable each capability under the registry’s ownership.

  for (const command of yield* each(commands)) {
    // Own a command subscription for the Session lifetime.

    const notes = yield* withSpine(options, function* (spine) {
      // Borrow temporary shared inference state.

      const pool = yield* agentPool({
        parent: spine,
        orchestrate: parallel(tasks),
      });
      // Run and join a managed Agent cohort.

      return pool.agents.flatMap((agent) =>
        agent.result ? [agent.result] : []
      );
      // Return durable data; temporary branches remain scoped.
    });

    const synth = yield* useAgent({
      parent: session.trunk ?? undefined,
      task: renderSynthesis(notes),
    });
    // Perform one managed synthesis Agent.

    yield* call(() =>
      session.commitTurn(command.query, synth.result ?? "")
    );
    // Persist the durable turn explicitly.
  }
}
```

The code visibly answers:

-   who owns each activity;
-   which work is concurrent;
-   which capabilities are inherited;
-   which inference state is temporary;
-   which value becomes durable;
-   what unwinds when the Session ends.

---

## Advanced patterns {#advanced-patterns}

The preceding sections teach how to see a Lloyal execution. These patterns show what the same primitives can express when topology, observation, evidence flow, inference shaping, lifecycle policy, authority, and continuity are composed deliberately.

They are not built-in modes. Each is an application procedure assembled from ordinary TypeScript and the public inference primitives. Most harnesses should stay at the Agent, Tool, orchestrator, and policy level. Direct Branch operations are appropriate when the invariant is genuinely about token selection, search, logits, or state continuity.

### Begin with the invariant {#begin-with-the-invariant}

Do not start by choosing an orchestration factory or a number of Agents.

Start with:

> **What must remain true while this intelligent application investigates, concludes, acts, and continues?**

For each pattern, identify:

```text label="Structure"
invariant
→ required live states
→ ownership and inheritance
→ observations
→ allowed interventions
→ acceptance and authority
→ continuity
→ observable test
```

The runtime owns safe execution, cancellation, branch cleanup, batching, and grant enforcement. The harness owns the semantic decisions: what evidence means, which contradiction is material, what burden of proof applies, which state is canonical, and when consequence is acceptable.

### Adaptive harness patterns {#adaptive-harness-patterns}

#### Contradiction-triggered expansion {#contradiction-triggered-expansion}

**Invariant:** no final result while a material contradiction remains unresolved.

**State shape:** preserve the current interpretation and the conflicting observation as distinct live states. Create only the focused work needed to resolve their disagreement.

```text label="Structure"
current interpretation
        │
        └── conflicting observation
                    │
          preserve current lineage
                    +
          provenance challenge
                    +
          applicability challenge
                    +
          alternative explanation
                    │
                 reconcile
                    │
          extend only resolved finding
```

A custom orchestrator can inspect harness-owned contradiction state, conditionally `spawn` challenge Agents, `waitFor` them, and extend the spine only after the resolution passes the application's completion gate. `AgentPolicy` can keep the unresolved lineage alive or prevent terminal acceptance.

**Why it is different:** the graph is not declared once and then executed blindly. New topology appears because evidence changed the application’s understanding of the workload.

---

#### Minority-lineage preservation {#minority-lineage-preservation}

**Invariant:** majority convergence must not erase unique, higher-authority, or high-consequence evidence.

```text label="Structure"
majority convergence
        │
        ├── minority evidence immaterial → prune
        │
        └── minority evidence material
                    → preserve
                    → seek corroboration
                    → reconcile
                    → accept or block completion
```

The harness records provenance and materiality outside the model. It may preserve a minority Agent, spawn a verification lineage, withhold completion, or prune the branch when the unique evidence proves immaterial.

**Why it is different:** the application owns the survival rule. “Consensus” is not whatever the model or the largest cohort happens to prefer.

---

#### Dynamic retrieval phase switching {#dynamic-retrieval-phase-switching}

**Invariant:** retrieval should pursue the question the workload currently needs answered, not one static search objective.

```text label="Structure"
discovery
→ governing facts found
→ applicability search
→ candidate outcome
→ contradiction search
→ materiality check
→ explanation-quality retrieval
```

`AgentPolicy.shouldExplore()` supplies a live explore/exploit decision at Tool dispatch. A Tool receives that decision through `ToolContext.explore` and can combine it with application-owned phase state, root intent, local branch state, pressure, and peer history.

```ts label="TypeScript"
class PhasePolicy extends DefaultAgentPolicy {
  constructor(private readonly state: WorkloadState) {
    super({ terminalToolName: "report" });
  }

  override shouldExplore(agent: Agent, pressure: ContextPressure): boolean {
    const phase = this.state.forAgent(agent.id).phase;
    if (phase !== "discovery") return false;
    return pressure.percentAvailable > 40;
  }
}
```

The boolean boundary is intentionally small. Richer semantics—verification, falsification, applicability, or explanation—remain application and Tool concerns.

---

#### Materiality-aware compute allocation {#materiality-aware-compute-allocation}

**Invariant:** spend further inference only on uncertainty capable of changing the useful outcome.

```text label="Structure"
uncertainty exists
→ could resolving it change the outcome?
    ├── no  → stop or prune
    └── yes → continue, fork, retrieve, or recover
```

Pressure reports what the runtime can afford. Materiality reports what the application considers worth affording.

```ts label="TypeScript"
class MaterialityPolicy extends DefaultAgentPolicy {
  constructor(private readonly state: WorkloadState) {
    super({ terminalToolName: "report" });
  }

  override shouldExit(agent: Agent, pressure: ContextPressure): boolean {
    const s = this.state.forAgent(agent.id);
    if (pressure.critical) return true;
    if (!s.uncertaintyCouldChangeOutcome) return true;
    return s.noMaterialProgressTurns >= 3;
  }
}
```

A custom orchestrator can also use `ctx.canFit(...)` before spawning focused work. Recovery policy decides whether an incomplete but material branch deserves a final extraction rather than silent pruning.

### Programming the inference trajectory {#programming-the-inference-trajectory}

These patterns move below Agent lifecycle and operate directly on live Branch state. They are the clearest proof that the harness can program inference rather than only arrange calls around it.

#### Verifier-before-commit generation {#verifier-before-commit-generation}

**Invariant:** a candidate continuation must pass an application validator before it becomes branch state.

```text label="Structure"
sample candidate
      ↓
application validates
   ┌──┴──────────────┐
accept              reject
   ↓                  ↓
commit        alter distribution
              and resample
```

The critical distinction is:

> **A sampled candidate is not yet committed inference state.**

`Branch.produce()` samples without advancing the branch. `Branch.commit()` accepts and decodes the chosen token. Between them, application code can validate, steer, replace logits, or change grammar.

```ts label="TypeScript"
function* commitVerifiedToken(
  branch: Branch,
  accepts: (candidate: { token: number; text: string }) => boolean,
): Operation<boolean> {
  const rejected = new Set<number>();

  while (true) {
    const candidate = yield* call(() => branch.produce());
    if (candidate.isStop) return false;

    if (accepts(candidate)) {
      branch.clearSteer();
      yield* call(() => branch.commit(candidate.token));
      return true;
    }

    rejected.add(candidate.token);
    branch.steer(
      [...rejected].map((token) => ({ token, bias: -Infinity })),
    );
  }
}
```

Use this for local syntax or semantic validators, impossible world-state transitions, phase-specific structure, or specialised token-level scoring. Grammar remains preferable when the whole valid language can be expressed structurally; verifier-before-commit is valuable when validity depends on live application state.

---

#### Diverse tree search {#diverse-tree-search}

**Invariant:** preserve several genuinely different continuations, spend work on promising paths, and remove dominated subtrees without reconstructing the shared prefix.

```text label="Structure"
shared live state
      ↓
fork alternatives
      ↓
reseed · steer · produce · score
      ↓
expand promising paths
prune dominated subtrees
      ↓
retain or promote winner
```

Branches can fork from roots or intermediate branches. Sampler reseeding prevents identical stochastic continuations. Path-local steering can penalise sibling choices. `produce()` separates proposal from advancement, while cohort `commit()` advances the active frontier together.

```ts label="TypeScript"
const frontier = yield* all(
  seeds.map((seed) => call(async () => {
    const branch = await root.fork();
    branch.reseedSampler(seed);
    return branch;
  })),
);

for (let depth = 0; depth < maxDepth; depth++) {
  const proposals = frontier.map((branch) => [
    branch,
    branch.produceSync(),
  ] as const);

  const live = proposals.filter(([, p]) => !p.isStop);
  if (live.length === 0) break;

  yield* call(() => store.commit(
    live.map(([branch, p]) => [branch, p.token]),
  ));

  // Application-owned scoring decides which paths expand or prune.
  pruneDominated(frontier, scoreBranch);
}
```

A real search owns cleanup explicitly and promotes or retains the winner before the candidate scope closes.

**Why it is different:** the application is not asking for several detached answers. It is maintaining and governing a search tree of continuing model states.

---

#### Expert-state synthesis {#expert-state-synthesis}

**Invariant:** expert lineages should remain distinct while contributing directly to a common synthesis, rather than first being flattened into one textual summary.

```text label="Structure"
expert A state ─┐
expert B state ─┼─ align to one synthesis task
expert C state ─┘
                       ↓
             capture token distributions
                       ↓
               merge into destination
                       ↓
          decode under destination grammar
               and sampler policy
```

`Session.prefillAligned()` gives the trunk and experts the same next task while preserving each lineage's prior state. `BranchStore.mergeLogits()` adds expert distributions into the destination. The destination's grammar and sampler still determine the selected token.

```ts label="TypeScript"
function* synthesizeFromExperts(
  session: Session,
  store: BranchStore,
  experts: Branch[],
  task: string,
  alpha = 0.25,
): Operation<string> {
  yield* call(() => session.prefillAligned(task, experts));

  const destination = session.trunk;
  if (!destination) throw new Error("Expert synthesis requires a trunk");

  let output = "";

  while (true) {
    store.mergeLogits(destination, experts, alpha);
    const next = destination.produceSync();
    if (next.isStop) break;

    output += next.text;

    // Advance every lineage with the selected synthesis token so their
    // distinct histories remain aligned for the next distribution merge.
    yield* call(() => store.commit([
      [destination, next.token],
      ...experts.map((expert) => [expert, next.token] as [Branch, number]),
    ]));
  }

  return output;
}
```

The built-in merge applies one equal `alpha` to each expert. A custom weighting operator can read and write captured logits when experts need different weights.

**Why it is different:** the experts preserve their own evidence and attention histories while contributing to each next-token decision.

### Acceptance and continuity patterns {#acceptance-and-continuity-patterns}

#### Burden-of-proof scaling {#burden-of-proof-scaling}

**Invariant:** the evidence and validation required must increase with the consequence of the proposed result or action.

```text label="Structure"
advisory output
→ modest evidence threshold

persistent recommendation
→ stronger evidence + provenance + validation

consequential action
→ corroboration + deterministic checks + grant + approval
```

The harness owns risk tier and evidence-completeness state. `AgentPolicy.onProduced()` can reject premature terminal output. Deterministic validators can check structure and domain rules. `ToolGuard`, protected Tools, Session grants, and human commands keep permission distinct from model preference.

This pattern preserves four separate facts:

```text label="Structure"
the model proposed it
≠ the result is accepted
≠ the Session is authorised
≠ the application should execute it now
```

---

#### Verified-state continuation {#verified-state-continuation}

**Invariant:** later work must inherit the state the application actually accepted, not merely a summary of whichever candidate happened to finish last.

```text label="Structure"
candidate lineages
        ↓
validator or human selection
        ↓
accepted winner
        ↓
Session.promote(...)
        ↓
later work forks from accepted state
```

```ts label="TypeScript"
const winner = candidates.find((candidate) =>
  validator.accepts(candidate.result)
);

if (!winner) throw new Error("No candidate satisfied the invariant");

// Promote while the candidate branch is still live in its owning scope.
yield* call(() => session.promote(winner.branch));
```

Promotion is both a topological operation and a product decision. The candidate scope must remain alive until selection and promotion complete.

**Why it is different:** the accepted inference state itself becomes the basis for follow-up work. Continuity is not reconstructed later from a lossy prose summary.

---

#### Counterfactual policy replay {#counterfactual-policy-replay}

**Invariant:** a changed policy, prompt, validator, model, or stage should be evaluated from equivalent inherited state.

```text label="Structure"
historical inherited state
→ reconstruct
→ replace policy or stage
→ rerun
→ compare outcome and trace
```

```ts label="TypeScript"
const checkpoint = extractSpineCheckpoint(traceEvents, {
  poolTraceId,
});

const spine = yield* reconstructBranch(checkpoint);

const result = yield* agentPool({
  parent: spine,
  tools,
  policy: revisedPolicy,
  orchestrate: replacementStage,
});
```

Replay reconstructs the seed prompt and ordered spine extensions. It does not promise bit-identical future generation when sampler state or other nondeterministic inputs differ. The object under comparison is the application procedure and its trace, not only the final prose.

---

#### Temporal applicability {#temporal-applicability}

**Invariant:** evidence may influence a lineage only when it applies to the relevant time, jurisdiction, version or world state.

**State shape:** keep event time, effective dates, jurisdiction, version and supersession in application state. Use them to evaluate evidence before admission and again before completion.

```text label="Structure"
relevant time or state discovered
→ select governing version
→ evaluate candidate evidence
    ├── applicable  → admit to authorised lineage
    └── superseded  → reject or retain as provenance
→ validate applicable basis before completion
```

A custom Tool or scorer can compare retrieved evidence with harness-owned applicability state. The orchestrator can route applicable evidence into selected lineages, while policy prevents completion when the governing basis remains unresolved.

```ts label="TypeScript"
// admission — evidence enters a lineage only when it governs
class GoverningFilings extends Tool<{ query: string }> {
  constructor(private readonly basis: ApplicabilityState) { super(); }

  *execute(args: { query: string }): Operation<unknown> {
    const hits = yield* search(args.query);
    return {
      applicable: hits.filter((hit) => this.basis.governs(hit)),
      superseded: hits.filter((hit) => !this.basis.governs(hit)),
    };
  }
}

// completion — no report while the governing basis is unresolved
class RequiresBasis extends DefaultAgentPolicy {
  constructor(private readonly basis: ApplicabilityState) {
    super({ terminalToolName: "report" });
  }

  override onProduced(...args: OnProduced): ProduceAction {
    const [, parsed, , config] = args;
    const reporting = parsed.toolCalls[0]?.name === config.terminalToolName;
    if (reporting && !this.basis.resolved) {
      return { type: "nudge", message: "State which version governs before reporting." };
    }
    return super.onProduced(...args);
  }
}
```

Both comparisons are deterministic. `governs()` tests effective date, jurisdiction and supersession against harness-owned state; a relevance score cannot stand in for it, because a superseded filing scores highest on the question it was superseded on. The policy holds the terminal tool rather than editing the answer, so the model still writes the report — it simply cannot finish one whose governing basis was never established.

The same shape carries across domains:

-   **Software engineering:** use the API version and dependency state present at the failure time.
-   **Legal or policy analysis:** apply the rule in force on the relevant date.
-   **Travel:** use current entry rules for the intended journey period.
-   **Game world:** reason from the world state at the event time rather than current state.

**Why it is different:** semantic relevance is not validity. The application determines which evidence governs which live state rather than asking the model to infer applicability from a mixed transcript.

### Additional compositions {#additional-compositions}

The same grammar supports further patterns that can be added when a product needs them:

-   **Cross-source invariant transfer:** establish governing constraints in one stage, extend only the accepted constraints into the spine, and make later source work inherit them.
-   **Source-diverse evidence portfolio:** treat independent source classes as an application invariant rather than trusting top-K relevance alone.
-   **Entitlement-aware evidence admission:** allow private evidence to influence an authorised lineage while filtering or withholding its representation from other lineages and public output.

These are not special framework modes. They are different combinations of topology, Tool semantics, policy, application state, and continuity.

### Design your own advanced pattern {#design-your-own-advanced-pattern}

Use this worksheet.

#### State {#state}

What live interpretations, candidates, or expert states must exist?

#### Ownership {#ownership}

What work ends together, and which temporary branches must remain alive until selection or promotion?

#### Inheritance {#inheritance}

What state should each lineage receive? Which findings are allowed to extend the spine?

#### Observation {#observation}

Which model, pressure, evidence, domain, external-system, and human signals matter?

#### Intervention {#intervention}

Can the harness spawn, retrieve, steer, constrain, validate, retry, recover, prune, merge, or promote?

#### Acceptance and authority {#acceptance-and-authority}

What separates a model proposal, an accepted result, a permitted action, and an executed consequence?

#### Continuity {#continuity}

What becomes shared state, the Session trunk, or a reconstructable checkpoint?

#### Test {#test}

What trace and application state prove the invariant held even when the final answer looks plausible?

> **Start from the application invariant, not from the number of Agents.**

### Advanced-pattern failure modes {#advanced-pattern-failure-modes}

#### Creating fan-out without a survival policy {#creating-fan-out-without-a-survival-policy}

More branches are not automatically better. Define what preserves, expands, recovers, prunes, and wins before creating a large frontier.

#### Confusing permission with authority {#confusing-permission-with-authority}

A grant means the Session may invoke a protected Tool. It does not mean the application must accept every proposed invocation or that evidence and approval conditions are satisfied.

#### Treating summaries as the only persistent state {#treating-summaries-as-the-only-persistent-state}

Summaries are useful data. They are not equivalent to promoting an accepted live state or deliberately extending a spine with selected findings.

#### Assuming replay means bit-identical output {#assuming-replay-means-bit-identical-output}

Reconstructed inherited state can be equivalent while later sampling diverges. Compare policy decisions, invariants, outcomes, and traces rather than assuming identical tokens.

---

## Reference {#reference}

### Operator ownership reference {#operator-ownership-reference}

`yield*` performs the Operation it receives. Different Operations complete at different moments.

| Code | Meaning |
| --- | --- |
| `yield* operation` | Perform scoped work and receive its result |
| `yield* spawn(operation)` | Attach and start a concurrent child |
| `yield* all(operations)` | Run and join an owned cohort |
| `yield* race(operations)` | Race owned alternatives and halt losers |
| `yield* call(() => promise)` | Cross deliberately into Promise-based code |
| `yield* ensure(cleanup)` | Register cleanup for scope exit |
| `for (... of yield* each(stream))` | Consume a subscription owned by the scope |
| `yield* context.expect()` | Read an inherited scoped capability |
| `yield* resourceOperation` | Acquire a live capability whose provider remains beneath you |

This matters most with `spawn` and resources: `yield*` does not always mean “wait for every activity underneath this call to finish”.

### Follow the return type {#follow-the-return-type}

Two APIs may share a method name but have different semantics.

```ts label="TypeScript"
events.send(event);
```

may be synchronous.

```ts label="TypeScript"
yield* channel.send(event);
```

may return `Operation<void>` and require `yield*`.

Do not infer from names such as `send`, `read`, or `close`.

Let TypeScript tell you whether an API is:

-   synchronous;
-   Promise-returning;
-   or Operation-returning.

A floating-Operation lint rule would be valuable for harness projects.

### Async-to-Lloyal Rosetta Stone {#async-to-lloyal-rosetta-stone}

| JavaScript instinct | Lloyal/Effection form | Ownership meaning |
| --- | --- | --- |
| `async function` | `function*(): Operation<T>` | A composable scoped program |
| `await work()` | `yield* work()` | Perform work under the current owner |
| `Promise<T>` | `Operation<T>` | Work waiting to be placed in a scope |
| `Promise.all(...)` | `yield* all(...)` | Run and join an owned cohort |
| fire-and-forget Promise | `yield* spawn(...)` | Start a child that cannot outlive this scope |
| `Promise.race(...)` | `yield* race(...)` | Race owned alternatives and halt losers |
| call an async API | `yield* call(() => ...)` | Cross deliberately into Promise code |
| `finally` cleanup | `ensure()` or a resource | Bind cleanup to scope exit |
| `for await` | `for (... of yield* each(stream))` | Consume a scoped subscription |
| global dependency | Effection Context | Inherit a capability inside a scope |
| temporary workspace | `withSpine(...)` | Borrow live inference state and reclaim it |

Further language-level references:

-   [https://frontside.com/effection/guides/v4/thinking-in-effection/](https://frontside.com/effection/guides/v4/thinking-in-effection/)
-   [https://frontside.com/effection/guides/v4/async-rosetta-stone/](https://frontside.com/effection/guides/v4/async-rosetta-stone/)

### Common mistakes {#common-mistakes}

#### Converting an Operation to `async` {#converting-an-operation-to-async}

Avoid:

```ts label="TypeScript"
async function runResearch() {
  // ...
}
```

when the function must compose Lloyal Operations.

Use:

```ts label="TypeScript"
function* runResearch(): Operation<Result> {
  // ...
}
```

#### Calling an Operation without performing it {#calling-an-operation-without-performing-it}

Avoid:

```ts label="TypeScript"
ctx.spawn(task);
```

Use:

```ts label="TypeScript"
const agent = yield* ctx.spawn(task);
```

#### Treating an Agent as a Task {#treating-an-agent-as-a-task}

Avoid:

```ts label="TypeScript"
yield* agent;
```

Use:

```ts label="TypeScript"
yield* ctx.waitFor(agent);
```

#### Returning a scoped branch {#returning-a-scoped-branch}

Avoid relying on:

```ts label="TypeScript"
const spine = yield* withSpine(options, function* (spine) {
  return spine;
});
```

Return findings or another explicitly durable value.

#### Detached background loops {#detached-background-loops}

Avoid:

```ts label="TypeScript"
void listenForever();
```

Use:

```ts label="TypeScript"
yield* spawn(listenForever);
```

#### Assuming `call()` cancels every Promise {#assuming-call-cancels-every-promise}

Bind provider cancellation into the scope where available.

#### Marking a native Tool as off-loop {#marking-a-native-tool-as-off-loop}

Do not set `Tool.fanout = true` when the Tool may touch the main SessionContext, a branch, or a nested Agent runtime.

### Repository invariants {#repository-invariants}

```md label="Markdown"
## Lloyal structured-concurrency invariants

- A harness is a long-lived Effection scope.
- Read `yield*` as “perform this operation here, under this owner.”
- Do not convert Operation generators into async functions.
- Do not call and ignore a value of type `Operation<T>`.
- Perform Operations with `yield*`, `all`, `race`, `spawn`, or return them.
- Use `spawn` only for concurrent children owned by the current scope.
- Use `call()` at Promise or async-library boundaries.
- An Agent is not an Effection Task; the pool advances Agents.
- Agent concurrency is executed by the pool over BranchStore.
- A Branch or spine normally cannot outlive the scope that created it.
- Return durable findings from `withSpine`, not live branch handles.
- Effection Context values are scoped capabilities, not globals.
- Follow TypeScript return types: some `send()` methods are synchronous,
  while Channels return Operations that must be yielded.
- Do not mark a Tool as `fanout` if it may touch the main SessionContext.
```

---

## Continue into adaptive compute {#continue-into-adaptive-execution}

This guide establishes the ownership model and shows the advanced procedures it can express. The next guide goes deeper on the lifecycle boundary that production harnesses use most often:

> While work is still owned and running, what should an Agent do next?

`AgentPolicy` can decide to explore or exploit, accept or reject a Tool call, nudge an Agent towards reporting, retry a transient failure, stop one Agent, or recover findings before pruning. It operates inside the ownership model rather than replacing it.

Continue with [Adaptive compute](/agent-policy-and-context-pressure).
