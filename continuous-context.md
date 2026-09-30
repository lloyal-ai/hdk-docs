---
title: "Continuous Context"
description: "Why live inference state changes the application boundary"
---

A model call gives an application a response. Continuous Context gives it an evolving intelligent procedure it can govern.

Ordinary model APIs expose inference as a sequence of requests. The application owns prompts, messages, workflow state and Tool results; the serving system owns the execution that interprets them.

Lloyal gives a live line of inference application-visible identity, ancestry and lifetime across evidence, delegation, policy and continuation.

::: pull
**A transcript records what an execution said. A lineage is the execution that said it.**
:::

Continuous Context is the architectural consequence of preserving that distinction through the whole stack.

The quickest way into the model is to follow one lineage from kernel state to vertical application behaviour.

![Same model, different degree of control: without Lloyal application policy acts around model calls; with Lloyal it governs reasoning while it is underway.](/assets/guides/index-01.png)

## Context is not the context window {#context-is-not-the-context-window}

**Every other system rebuilds the model’s state from a transcript. Continuous Context keeps the execution itself.** A message history can reconstruct what was said. It cannot establish that a new execution carries the same processed state as the one it replaces.

Which matters because the word *context* is overloaded. It can mean:

-   the text submitted in a request;
-   the maximum token window supported by a model;
-   the messages stored by an Agent framework;
-   application state attached to a workflow;
-   or the processed state through which the model is currently continuing.

Continuous Context refers to the last of these, together with the application structures that give it identity and ownership.

```text label="Structure"
conversation history
    records content

workflow state
    records application progress

live inference state
    is the instantiated model execution continuing from that content
```

All three matter. They are not interchangeable.

What a transcript cannot carry: the processed carrier, the current stochastic state, the grammar state, the next-token distribution, the reasoning trajectory.

Continuous Context does not mean that one Branch decodes forever. A Branch may be advancing, waiting for a Tool, excluded from the current decode cohort, retained for later comparison, or finished but still alive for downstream use. Continuity is the persistence of identity and ancestry across those transitions—not constant activity.

---

What that buys, in six places:

-   [**Specialists inherit the live case**](#stateful-delegation) — not a summary handed down.
-   [**Conclusions form against the governing evidence**](#evidence-admission-by-applicability) — not whatever happens to dominate attention.
-   [**Compute follows what the case reveals**](#adaptive-execution) — not a decomposition fixed before execution.
-   [**Options are compared from one understanding**](#matched-continuations) — not from separate reconstructions of it.
-   [**What survives is the state you accepted**](#verified-continuation) — not the last response to finish.
-   [**Deeper procedures stay practical**](#practical-depth) — on device, on-premises and on frontier compute.

## The boundary created by model calls {#the-boundary-created-by-model-calls}

Request-shaped systems divide an intelligent application at the model-call boundary.

```text label="Structure"
application state
    ↓
construct request
    ↓
provider-owned inference
    ↓
receive response
    ↓
update application state
```

Orchestration frameworks are powerful on the application side of that boundary. They can checkpoint a graph, route work, call Tools, create subgraphs, wait for human approval, validate a response, append a new message and call again.

What they cannot obtain from an ordinary model endpoint is ownership of the execution inside the call. A later request may contain equivalent messages and still begin a new trajectory.

That distinction is often immaterial for short, disposable calls. It becomes material when:

-   reasoning is long-lived;
-   the outside world changes while work is underway;
-   only some lineages should receive new evidence;
-   specialist work must inherit more than a prepared handoff;
-   domain policy must act before a conclusion or consequence settles;
-   alternatives must depart from a common instantiated state;
-   or later work must continue from the state the application actually accepted.

Lloyal does not replace workflow orchestration. It adds another controlled object beneath it: the live inference-state tree.

---

## Inside a live Branch {#inside-a-live-branch}

Continuous Context begins below the Agent abstraction.

At the kernel layer, a Branch identifies one instantiated continuation of the model. Its state includes:

| Kernel state | Why it matters |
| --- | --- |
| **Sequence carrier** | The processed transformer KV or recurrent model state from which decoding continues |
| **Position and fork head** | Where the lineage currently is and where it departed from its parent |
| **Sampler chain and PRNG state** | The current stochastic continuation, including sampling position—not merely an initial seed |
| **Penalty history** | The generated-token history used by repetition, frequency and presence penalties |
| **Grammar state** | The current parser state constraining what may be generated next |
| **Captured logits and bias** | The Branch's private next-token distribution and application-supplied token bias |
| **Metrics** | Per-lineage execution measurements such as perplexity |
| **Topology** | Parent and child relationships used for ancestry, reclamation and promotion |

### Fork copies execution, not a description of execution {#fork-copies-execution-not-a-description-of-execution}

`fork()` creates a child sequence and copies the parent's live carrier into it. It clones the parent's sampler chain—including its current PRNG and penalty state—along with grammar state, captured logits, metrics, bias, position and lineage metadata.

With captured logits cloned, parent and child initially expose the same next-token distribution. If neither receives a different intervention, both begin from the same model and stochastic state.

```text label="Structure"
parent at position p
    ├── processed carrier
    ├── sampler + current PRNG state
    ├── grammar state
    └── next-token distribution
             ↓ fork
child at position p
    ├── copied carrier
    ├── cloned sampler + current PRNG state
    ├── cloned grammar state
    └── cloned next-token distribution
```

This is the foundation for matched continuations. Several children can depart from one instantiated state with only an application-declared intervention changed. Reconstructing the same messages in several new model calls does not establish the same initial condition.

An initial seed remains useful for provenance. It is not the mechanism that makes live siblings equivalent. Reseeding a child resets its random stream and turns diversity into part of the intervention.

A fork clones inference state, not arbitrary application behaviour. Per-token steering callbacks, for example, are attached deliberately by the harness rather than implicitly inherited. State equality and policy equality are separate claims; a matched experiment must control both.

### Cohorts preserve separate lineages while sharing execution {#cohorts-preserve-separate-lineages-while-sharing-execution}

Each eligible Branch samples from its own captured logits and sampler. The resulting tokens are then accepted and decoded as one cohort through `decode_each()`:

```text label="Structure"
Branch A samples token a ─┐
Branch B samples token b ─┼─ one batched decode ─► new logits A · B · C
Branch C samples token c ─┘
```

Every Branch advances at its own position and receives its own resulting logits snapshot. The batch shares a model dispatch; it does not collapse the lineages into one conversation.

External or replayed material has a different shape. `decode_scatter()` accepts a different token delta for each Branch, packs the work into available batch capacity and advances each destination through its own material. This is how selected Tool results, task suffixes or evidence can be processed across an asymmetric tree without turning the tree into separate model servers.

Fork, cohort decode and scatter prefill establish three distinct properties:

1.  **Common ancestry is exact.** A child begins from the parent's processed state rather than a textual approximation of it.
2.  **Change can be selective.** Different lineages can receive different deltas or controls after the fork.
3.  **Execution remains shared.** Distinct continuations advance through one resident model and one tree-aware batching surface.

> **The kernel-level deduction:** a live fork exposes several application-owned continuations of one instantiated model state. A model endpoint exposes responses from which an application may attempt to reconstruct several new executions. Those are different experimental and operational objects. The kernel therefore supports the real wedge: not merely trajectory preservation, but matched policy continuations from the same instantiated model state.

When work loses relevance, pruning releases the Branch and its unique state. When one result should become the basis of later work, promotion can retain the accepted Branch and remove the alternatives.

These are kernel semantics. They become an application architecture only when another layer owns their lifetimes.

---

## From Branches to continuous Agents {#from-branches-to-continuous-agents}

The TypeScript runtime is not a convenience wrapper around the kernel. It turns Branches into scoped, lifecycle-managed Agents.

At the Agent layer, a Branch acquires application meaning:

```text label="Structure"
live Branch
+ task and caller
+ Tool and parser state
+ policy and authority
+ lifecycle and trace
= Agent
```

At the pool layer, Agents become a managed execution cohort, advanced together one decode tick at a time — spawn, produce, commit, settle, dispatch; the phases, and what is decided in each, are in [Adaptive compute](/agent-policy-and-context-pressure#the-pools-decision-cycle).

The architectural contract is single ownership: while a pool owns a model context, changes to its Branch tree enter through the pool's lifecycle. That is what makes batching and branching compatible with cancellation, waiting, Tool settlement and cleanup. A Branch is not handed out as unmanaged mutable state; it remains part of an owned execution scope.

An Agent waiting for external work is not reconstructed and is not consuming a decode position merely to remain alive. Its Branch remains owned by the pool while the Agent stays out of inapplicable ticks. When the Tool result is settled into that Branch, the Agent becomes eligible again and continues from the resulting state.

The same lifecycle composes recursively. A delegation Tool starts a nested AgentPool with the calling Agent's Branch as its parent. Every delegated specialist receives an explicit task while inheriting the live case state that caused the parent to delegate. The nested Effection scope owns the sub-Agents and their work; their findings return as a Tool result into the still-owned parent lineage.

```text label="Structure"
calling Agent Branch
        ↓ delegate
nested AgentPool scope
    ├── specialist A Branch
    ├── specialist B Branch
    └── specialist C Branch
        ↓ findings settle
calling Agent continues
```

Pressure, cancellation, Tool retry, recovery, completion and scope exit also belong to this lifecycle. Finished Branches may remain alive while a result is being provided so downstream verification or forking can use them. Cleanup follows ownership; promotion deliberately selects what survives beyond temporary work.

Three different structures are therefore aligned:

```text label="Structure"
inference-state tree    what live model state is inherited
lifetime tree           what work and state end together
orchestration graph     what depends on what
```

The harness operates a control loop over all three. The kernel makes live ancestry real. Effection makes its lifetime accountable. The Agent runtime determines which Branches advance, wait, reactivate, delegate, recover and conclude.

> **The runtime-level deduction:** live inference state becomes useful to a product only when its ownership survives the whole Agent lifecycle. Structured concurrency turns exact Branch continuations into scoped intelligent work that can wait on reality, recruit specialists, recover locally and end without leaking state or work.

The result is not merely forkable KV. It is a lifecycle-managed tree of intelligent work:

| Transition | Continuous-context meaning |
| --- | --- |
| **Fork** | Create a child that inherits the parent's instantiated state |
| **Wait** | Keep the lineage resident while external work completes |
| **Settle** | Admit a Tool result or other accepted content into that lineage |
| **Reactivate** | Continue the same Agent after the new material is processed |
| **Delegate** | Spawn scoped specialists from the calling Agent's live state |
| **Prune** | End a lineage and reclaim its state without disturbing surviving relatives |
| **Promote** | Make an accepted Branch the basis of later work |
| **Replay** | Reconstruct retained content when the original live state no longer exists |

Replay is valuable, but it is a different operation. A live fork continues an instantiated execution. Replay rebuilds one from retained content.

---

## The application owns the intelligent procedure {#the-application-owns-the-intelligent-procedure}

Continuous Context matters because the model is only one part of a vertical application.

```text label="Structure"
general model capability
+ live Abilities
+ domain procedure and policy
+ authority and completion rules
+ continuous inference lineage
= vertical intelligent application
```

### Abilities provide contact with reality {#abilities-provide-contact-with-reality}

Continuous Context does not make a model current by itself. Abilities give the harness portable capabilities through which it can perceive and act:

-   live browsers and operational systems;
-   telemetry, market and event feeds;
-   case-management and institutional records;
-   databases and internal services;
-   specialist APIs;
-   local or remote document and corpus retrieval;
-   transformations, validators and actions.

These are not merely sources appended to a prompt. An Ability can observe, calculate, filter, validate, obtain authority, act and report progress inside the application's procedure.

### The harness supplies domain meaning {#the-harness-supplies-domain-meaning}

The harness owns facts the model should not be asked to improvise:

-   which source or version governs;
-   whether evidence applied at the relevant time and place;
-   what burden of proof a consequence requires;
-   which Tools a Session may invoke;
-   what may enter a particular lineage;
-   when specialist work is required;
-   what constitutes completion;
-   and which result becomes continuing state.

The model contributes generative intelligence. The application determines the institutional semantics under which that intelligence is allowed to operate.

### The lineage keeps them in one procedure {#the-lineage-keeps-them-in-one-procedure}

Without a live lineage, Abilities and policy communicate with the model through repeated requests. With Continuous Context, their observations and decisions can govern an execution that remains identifiable as it waits, delegates, branches and continues.

That is the fusion point behind [vertical inference](https://verticalinference.lloyal.ai/): domain capabilities and application policy do not merely surround model outputs; they participate in the evolution of the reasoning process.

---

## What this unlocks {#what-this-unlocks}

Continuous Context is one contract with several consequences. No single consequence is the architecture by itself.

### Stateful delegation {#stateful-delegation}

**Specialist intelligence remains coherent with the developing case, and expertise can be recruited when the need emerges rather than fixed into the workflow beforehand.**

An Agent can encounter a question, call a delegation Tool and spawn a nested AgentPool from its own Branch.

```text label="Structure"
lead Agent discovers a specialist question
        ↓
delegate from the lead's live Branch
        ↓
specialists inherit the instantiated case state
        ↓
specialist findings return as a Tool result
        ↓
the lead continues from its existing lineage
```

The delegated task remains explicit, but it is not the specialist's only context. Each sub-Agent inherits the live state that made the task relevant. The parent does not need to compress the case into a handoff and then reconstruct itself after the specialists return.

Delegation may recurse to arbitrary depth subject to application policy and context pressure. Effection scopes align each nested pool's lifetime with the Agent that created it, while the branch tree preserves inference ancestry.

### Evidence admission by applicability {#evidence-admission-by-applicability}

**Conclusions are formed against the governing evidence rather than whichever mixture of old and new material happens to dominate the model's attention.**

Abilities acquire observations. The harness decides what those observations mean and where they may enter.

```text label="Structure"
observation arrives
        ↓
authority · time · jurisdiction · subject checked
        ↓
admit to affected live lineages
        ↓
continue, expand, hold or prune under application policy
```

Semantic relevance is not the same as applicability. A filing can be relevant but superseded; a rule can be authoritative but not yet in force; a market or navigation advisory can govern one position or time window but not another.

The application should resolve those predicates deterministically where it can, then admit the result into the lineages it governs. Unaffected work need not receive it. Material conflict can create focused topology instead of forcing stale and current evidence to compete inside one undifferentiated prompt.

### Adaptive execution {#adaptive-execution}

**The application allocates intelligence according to what the case reveals, not only according to a static decomposition chosen before execution.**

The intelligent procedure does not need to be fully specified before the model begins.

The harness can respond to observations from the model, Tools, product state, humans and external systems by changing what happens next:

-   expand a material contradiction;
-   recruit a specialist;
-   switch retrieval strategy;
-   increase the burden of proof;
-   preserve a minority lineage;
-   redirect or constrain generation;
-   recover a partial result;
-   prune dominated work;
-   or prevent a proposed consequence from settling.

Graph orchestration remains part of this. The difference is that new work can inherit the live state whose observations caused the graph to change.

### Matched continuations {#matched-continuations}

**An application can evaluate policies or courses of action from one instantiated understanding of the case, producing a more defensible comparison and trace.**

Sometimes an application must compare alternatives rather than merely generate several candidates.

A live parent can be forked into children that initially share the same processed model state, sampler and PRNG position, grammar state and next-token distribution. The application can then vary one declared intervention across the children.

```text label="Structure"
one accepted live state
        ↓ fork
matched continuation A  ← intervention A
matched continuation B  ← intervention B
matched continuation C  ← intervention C
```

For a matched comparison, children should inherit the parent's sampler state rather than be reseeded. Reseeding is a diversity intervention; it changes the object being compared.

This is different from submitting equivalent histories to several endpoint calls. Reconstructed calls may be nominally comparable, but their differences combine the declared intervention with fresh-run variance.

### Verified continuation {#verified-continuation}

**The state that survives is the state the application accepted—not merely a prose summary of the last response to finish.**

Generation, acceptance, authority and continuity are separate decisions.

An Agent may propose a result. A validator or human may accept it. A Session may be authorised to act on it. The application may then promote the accepted Branch so later work inherits that state.

```text label="Structure"
candidate state
        ↓ validation or selection
accepted state
        ↓ promotion
basis of later work
```

### Practical depth {#practical-depth}

**Richer domain procedures become practical on device, on-premises and on shared frontier placements without changing the harness contract.**

Continuous Tree Batching advances eligible branches as one cohort. Shared ancestry is retained rather than repeatedly prefilling the same material, and Agents waiting for external work do not occupy decode slots for that tick.

The systems advantage is not merely lower token cost. It changes what can fit inside a product's latency, memory and deployment envelope: more specialist work, deeper investigation and more deliberate survival policy over one resident model.

---

## Demonstration by example {#demonstration-by-example}

Consider an application responsible for a time-sensitive operational decision.

A lead Agent begins with an established case state. As it reasons, the need for specialist work emerges from the case itself:

1.  It delegates an operational question from its live state to an Ability connected to the relevant current system.
2.  A second specialist evaluates the contractual, regulatory or authority constraints governing the decision.
3.  Their findings settle into the lead's continuing lineage rather than into a replacement lead call.
4.  A material external event arrives before the decision settles.
5.  Application code verifies the event's authority, effective window, scope and affected obligations.
6.  The harness admits it into the governing lineage, expands only the work it changes and prevents an obsolete conclusion from settling.
7.  The lead may delegate focused follow-up work, compare viable courses from the updated state and promote the accepted decision.

The visible output may be concise. The intelligence lies in the procedure behind it: which live systems were consulted, which evidence governed, what specialist knowledge was inherited, why the procedure changed and which state was authorised to conclude.

An endpoint-orchestrated implementation can reproduce the workflow steps and may reach the same output. What it cannot obtain from an ordinary endpoint is the same continuity contract. Each specialist and returning lead must be instantiated from explicit application state, and an event arriving during a call can only affect a later call or cause the current execution to be abandoned.

Continuous Context does not guarantee a superior answer on every task. It gives applications a stronger basis for producing timely, coherent and institutionally defensible outcomes where continuity, changing evidence and domain procedure matter.

---

## Workflow continuity and inference continuity {#workflow-continuity-and-inference-continuity}

This distinction is easiest to see directly.

| Endpoint orchestration | Continuous Context |
| --- | --- |
| Owns messages, graph state and checkpoints | Also owns identities and ancestry of live model states |
| Delegates through an explicit task and reconstructed history | Delegates by forking the calling Agent's live state plus an explicit task |
| A Tool result becomes content for a later model call | A Tool result settles into the waiting lineage before it continues |
| New evidence changes subsequent workflow state | New evidence can govern selected live lineages at an application-defined boundary |
| Alternatives begin as independent model executions | Alternatives can fork from one instantiated parent |
| Validation accepts, rejects or retries a completed call | Policy can also constrain what may enter, continue, conclude or act |
| Audit records nodes, messages, Tools and responses | Trace can additionally preserve inference ancestry, survival and promotion |
| Continuation means reconstruct and call again | Continuation can mean advance the same resident lineage |

This is not a criticism of graph orchestration. Lloyal harnesses also use orchestration graphs. The distinction is which state the graph is able to govern.

If another framework owns the inference layer and exposes equivalent live-state semantics, it has crossed the same architectural boundary. Ordinary hosted model endpoints do not.

---

## What the research shows {#why-the-research-matters}

Continuous Context is not founded on the claim that transcripts are useless or every rerun fails. It begins from a narrower observation: reconstructed executions should not be treated as behaviourally interchangeable without evidence.

The research establishes several pressures on that assumption.

### Reruns diverge early {#reruns-diverge-early}

[On Randomness in Agentic Evals](https://arxiv.org/abs/2602.07150) analysed 60,000 agent trajectories across several models and scaffolds. In the divergent pairs studied, small early differences cascaded into different solution strategies.

The implication is not that stochasticity is undesirable. It is that restarting an Agent creates a new draw rather than resuming the discarded execution.

### Deterministic settings are not an endpoint guarantee {#deterministic-settings-are-not-an-endpoint-guarantee}

[Non-Determinism of “Deterministic” LLM System Settings](https://aclanthology.org/2025.eval4nlp-1.12/) found material variation across repeated hosted calls under temperature zero, top-p one and fixed seeds.

Seeds are useful provenance and diversity controls. They do not give an application ownership of provider execution state.

### Evidence conflict is not solved by co-presence {#evidence-conflict-is-not-solved-by-co-presence}

[Resolving Knowledge Conflicts in Large Language Models](https://arxiv.org/abs/2310.00935) and [Adaptive Chameleon or Stubborn Sloth](https://arxiv.org/abs/2305.13300) show the difficulty of reasoning when contradictory knowledge and evidence coexist.

Appending a correction beside stale material does not establish which fact governs, where its influence propagated or whether the old material should remain only as provenance. Those are application semantics.

### Position changes whether the model uses it {#position-changes-use}

[Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) showed that where relevant information appears inside a supported context can materially affect whether models use it successfully.

Rebuilding a prompt, moving evidence or appending a late correction is therefore not semantically neutral merely because the same facts remain present.

### Processed state has systems value {#processed-state-has-systems-value}

[Pensieve](https://dl.acm.org/doi/10.1145/3689031.3696086), [SGLang](https://proceedings.neurips.cc/paper_files/paper/2024/hash/724be4472168f31ba1c9ac630f15dec8-Abstract-Conference.html) and tree-structured serving research show that retained processed state and shared ancestry have material systems value.

Those systems optimise serving. Lloyal exposes the live tree as an application-owned programming surface and aligns it with policy, Tools, Agents and structured lifetimes.

Together, the research explains why the distinction matters. The Lloyal runtime supplies the mechanism. A harness supplies the domain procedure.

---

## What Continuous Context does not mean {#what-continuous-context-does-not-mean}

**It is not an infinitely growing conversation.** Working branches are scoped. Temporary subtrees are pruned. Accepted findings can become ordinary data, extend a spine or be promoted deliberately.

**It is not a claim of deterministic generation.** Generation remains stochastic. Deterministic application control means the harness decides which state is held, forked, admitted, constrained, continued, pruned or promoted.

**It is not universal evidence sharing.** Shared ancestry does not require every descendant to receive every observation. Admission and inheritance are application decisions.

**It is not continuation at all costs.** Sometimes the correct policy is to prune an invalid subtree and begin from a clean ancestor. Continuous Context makes continuation, reconciliation and pruning application choices rather than consequences imposed by a request boundary.

**It is not a replacement for durable content.** Applications still need messages, evidence records, Tool results, accepted turns, traces and replayable checkpoints. Live state and durable content solve different problems.

**It is not orchestration hidden inside the kernel.** The kernel supplies live Branch semantics. The TypeScript runtime supplies Agents, scoped concurrency, lifecycle, cohorts, Tool settlement, recovery and orchestration. The harness supplies domain meaning.

## The design test {#the-design-test}

Before introducing agents or branches, ask what must remain true while the application observes, reasons, delegates, acts and continues — then make the state, contact, applicability, inheritance, intervention, authority, continuity and proof explicit. The worksheet is in [Advanced patterns](/advanced-patterns#design-your-own-advanced-pattern).

Do not begin with the number of Agents. Begin with the application invariant and the live states required to preserve it.

---

## The mental model {#the-mental-model}

Model endpoints made inference look like a function:

```text label="Structure"
prompt → response
```

Agent frameworks made the surrounding workflow programmable:

```text label="Structure"
state → graph → model calls → Tools → updated state
```

Continuous Context makes the evolving inference process part of the application:

```text label="Structure"
live lineage
    ↕ Abilities and evidence
    ↕ domain policy and authority
    ↕ delegation and orchestration
    ↕ fork, settle, prune and promote
```

That is the architectural reason for Lloyal.

The application is no longer limited to preparing a request and judging its answer. It can govern how intelligence remains situated, specialises, changes course and becomes durable while the work is underway.

Continue with [Thinking in Lloyal](/thinking-in-lloyal) to learn how structured ownership, Agent lifecycles, Tools, policy and the live inference-state tree compose in TypeScript.
