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
yield* waitUntilSettled(session.commitTurn(query, answer));
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

### How the guide unfolds {#how-the-guide-unfolds}

The execution stack establishes the architectural boundary. From there, the guide deepens the model in the same order a harness executes it:

1.  **[Own the work](#own-the-work)** — harness scopes, Operations, `yield*`, `spawn`, and cohorts.
2.  **[Own the state](#own-the-state)** — Agents, branches, spines, trunks, Context, and resources.
3.  **[Compose behaviour](#compose-behaviour)** — Tools, orchestration, policy boundaries, and consequence.
4.  **[Exit cleanly](#exit-cleanly)** — completion, failure, halt, cleanup, and Promise integration.
5.  **[Read it in code](#read-it-in-code)** — the basic harness with the ownership model annotated.

The four lines that carry the model, the async/await translation and the common mistakes are on [From async/await to Lloyal](/async-to-lloyal). What the model makes possible once it is familiar is [Advanced patterns](/advanced-patterns).

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

A harness that forwards the agents' events while it listens for commands looks like this — the shape the scaffold's `initializeHarness` runs for you:

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

The pool advances all runnable branches together, one tick at a time; the phases are in [Adaptive compute](/agent-policy-and-context-pressure#the-pools-decision-cycle).

The AgentPool owns execution. BranchStore batches inference. An orchestrator determines which Agents should exist and which dependencies must be satisfied.

### Agents sit across three structures {#agents-sit-across-three-structures}

An Agent's owner, inherited attention, and logical dependencies are separate facts. Use the [three-structures model](#three-structures-one-control-loop) before inferring one tree from another.

### A spine is not the Session trunk {#a-spine-is-not-the-session-trunk}

These branches have different jobs.

#### Session trunk {#session-trunk}

The trunk represents durable conversational state:

```ts label="TypeScript"
yield* waitUntilSettled(session.commitTurn(query, answer));
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

The pool protects the one model context with a single loop. By default a Tool runs inline on that loop, which is safe for anything — including a Tool that starts agents or touches the calling branch. A Tool may opt out with `fanout = true` only when it never touches the shared model: a wrong `false` costs throughput, a wrong `true` can crash the process. Keep the two ideas apart: *fan-out of agents* is an orchestration shape; *off-loop Tool execution* is a safety declaration. [Tools](/tools#fanout) has the rule.

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

From the basic template, condensed to the lines that carry ownership. The harness itself, in `src/app.ts`:

```ts label="src/app.ts"
export function* harness(ctx, events, commands): Operation<void> {
  const { session, wire, runner, registry } = yield* initializeHarness(ctx, events, { abilities, config });
  // The agent runtime, the event forwarder and the enabled abilities — all owned by this scope.

  const run = yield* useExecution();
  // One long operation at a time: a replacement waits for the last one's cleanup; Stop reaches what runs.

  const article = articles({ session, run, wire, root: () => runner.config().sources.outputDir });
  yield* serveCommands(commands, [article], serveDefaults({ wire, run, abandon: article.abortRun }));
  // A command subscription for the life of the Session; each handler under its own boundary.
}
```

A question, in `src/harness/article.ts`, hands its work to `run` and returns at once:

```ts label="src/harness/article.ts"
yield* run.replace(`ask-${++asked}`, () =>
  scoped(function* () {
    // `scoped` finishes whatever the program started — agents, forks of the model — before the run counts as over.
    const article = yield* write(yield* recalled(), query);   // the program: returns data, never writes memory
    const docId = keep(root(), query, article);                // disk first…
    yield* wire.send({ type: "answer", text: article });       // …then the reader…
    yield* rebase(session, query, article);                    // …then the model's memory, explicitly
  }),
);
```

And the program, in `src/harness/wiki.ts`:

```ts label="src/harness/wiki.ts"
return yield* withSpine({ parent: trunk ?? undefined, systemPrompt: renderSpine({ abilities }), tools }, function* (spine) {
  // Borrow a shared line of attention for exactly this callback.
  const pool = yield* agentPool({ tools, parent: spine, terminal: citedReport.tool, budget, orchestrate: parallel(tasks) });
  // A managed cohort; it returns when every agent has finished.
  const notes = keys.map((k) => citedReport.read(pool.byKey(k) ?? { result: null }) ?? "");
  // Data leaves the scope; the branches do not.
  const settled = yield* useAgent({ ...prompt("synthesize", { query, notes }), parent: spine, policy: new SynthPolicy() });
  return settled.result;
});
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

Adaptive harness patterns, programming the inference trajectory, and acceptance and continuity patterns have their own page: [Advanced patterns](/advanced-patterns).

## Reference {#reference}

The operator reference, the async-to-Lloyal translation, common mistakes and the repository invariants are on [From async/await to Lloyal](/async-to-lloyal).

---

## Continue into adaptive compute {#continue-into-adaptive-execution}

This guide establishes the ownership model. The next guide goes deeper on the lifecycle boundary that production harnesses use most often:

> While work is still owned and running, what should an Agent do next?

`AgentPolicy` can decide to explore or exploit, accept or reject a Tool call, nudge an Agent towards reporting, retry a transient failure, stop one Agent, or recover findings before pruning. It operates inside the ownership model rather than replacing it.

Continue with [Adaptive compute](/agent-policy-and-context-pressure).
