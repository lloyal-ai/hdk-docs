---
title: "Adaptive compute through semantic pruning"
description: "Adaptive compute in a running AgentPool: how policy, context pressure, effort, recovery and wind-down decide what continues. Semantic pruning removes whole branches on judgement rather than compacting the context window on arithmetic."
lede: "Whole lines of work are pruned on judgement, not windows compacted on arithmetic"
---


**Compaction is positional: hit a token count, summarise the window. Pruning here is semantic: AgentPolicy decides a line of work is finished, drifted or no longer owned, and that whole branch returns its KV to its siblings mid-run.** Headroom becomes something the pool recovers rather than something it runs out of — which is what makes effort a dial instead of a budget you spend once.

This guide is how you drive that: what the pool watches, where the limits sit, what an Agent should do next, and how work is saved before its memory is reclaimed.

It assumes the ownership model from [Thinking in Lloyal](/thinking-in-lloyal) — scopes, Agents, and what ends together:

-   Effection owns the lifetime of the harness and pool;
-   the AgentPool owns Agent execution and branch lifecycle;
-   an Agent is not an Effection Task;
-   stopping one Agent is not the same as halting its parent scope.

---

::: pull
BranchStore accounts. ContextPressure observes. AgentPolicy decides. AgentPool enforces.
:::

Policy interprets live execution at explicit lifecycle boundaries. The pool remains responsible for decode, settlement, recovery, and pruning.

The quickest way into the model is to separate ownership, policy, and mechanical safety.

## Start here {#start-here}

### The decision hierarchy {#the-decision-hierarchy}

A policy decision sits inside a larger execution stack:

```text label="Structure"
Effection scope
└── AgentPool                              owns the live execution
    ├── BranchStore                        accounts for inference state
    ├── ContextPressure                    freezes the current resource facts
    ├── AgentPolicy                        chooses the next behavioural action
    └── Pool mechanics                     safely apply that action
        ├── decode and commit
        ├── Tool dispatch and settlement
        ├── recovery
        └── branch pruning
```

Read it from the outside in:

1.  **Effection decides whether the pool still has an owner.**
2.  **BranchStore records what live inference state exists.**
3.  **ContextPressure presents a stable snapshot of what remains.**
4.  **AgentPolicy interprets the situation.**
5.  **AgentPool performs the decision without violating runtime safety.**

Policy never owns the Session, schedules native decode, or prunes branches directly.

### The three questions {#the-three-questions}

#### 1\. Does this work still have an owner? {#1-does-this-work-still-have-an-owner}

That is a **structured-concurrency** question.

```text label="Structure"
Session released
    ↓
harness scope halts
    ↓
pool and all child work unwind
```

AgentPolicy is not consulted to preserve work whose owner has disappeared.

#### 2\. Should this Agent continue? {#2-should-this-agent-continue}

That is a **policy** question.

```text label="Structure"
pool remains alive
    ↓
Agent reaches a decision boundary
    ↓
policy chooses continue, nudge, retry, return, stop, or recover
```

The Agent may stop while its siblings and parent pool continue.

#### 3\. Can the requested action be performed safely? {#3-can-the-requested-action-be-performed-safely}

That is an **AgentPool** question.

Policy can request recovery or provide a preferred report budget. The pool computes what fits, enforces grammar and token limits, and protects the native context.

### The five rules {#the-five-rules}

1.  **Policy is a rulebook, not a scheduler.**
2.  **Pressure is a snapshot, not a mutable global gauge.**
3.  **The soft limit closes new work.**
4.  **The hard limit prevents unsafe continuation and bounds recovery.**
5.  **Policy requests recovery; the pool makes it mechanically safe.**

### The two axes {#the-two-axes}

Pressure affects both strategy and lifecycle, but these are not the same decision.

```text label="Structure"
strategy:
explore ───────────────────────────────→ exploit

lifecycle:
work ─────────────→ report ────────────→ recover or prune
```

An Agent can exploit while still healthy.

`shouldExplore() === false` does not mean the Agent should stop.


### Configure it {#configure-it}

This page is how the pool decides. To **set** its numbers and hooks — the budget row, a custom policy, wrap-up and cancel — see [Agent policy](/agent-policy); for the five moments of a tool call, [Tool hooks and guards](/tool-hooks).

## 1\. Know what you own {#1-ownership-boundary}

### Scope termination and Agent termination {#scope-termination-and-agent-termination}

These events can look similar in a UI but have different meanings.

#### The owner disappears {#the-owner-disappears}

```text label="Structure"
browser disconnects
        ↓
Session is released
        ↓
harness scope halts
        ↓
pool, Tools, subscriptions, and child Operations unwind
```

Effection owns this behaviour.

There is no longer a live parent waiting for the result.

#### One Agent stops inside a live pool {#one-agent-stops-inside-a-live-pool}

```text label="Structure"
pool remains alive
        ↓
policy decides this Agent should stop
        ↓
its branch remains temporarily available
        ↓
recovery may extract useful findings
        ↓
branch is pruned
        ↓
siblings continue
```

AgentPolicy and AgentPool own this behaviour.

The result may still be valuable to the active query.

> **Effection halt ends an ownership scope. Policy termination changes an Agent’s lifecycle inside a scope that still exists.**

Do not use policy hooks to imitate scope cancellation. Do not treat Session cancellation as an ordinary policy stop.

## 2\. See what the pool sees {#2-the-decision-stack}

### The four-layer decision path {#the-four-layer-decision-path}

```text label="Structure"
BranchStore
    owns branches and accounts for live KV cells
        ↓
ContextPressure
    freezes a consistent view of what remains
        ↓
AgentPolicy
    maps Agent state and pressure to an action
        ↓
AgentPool
    executes the action, batches native work, and preserves safety
```

#### BranchStore accounts {#branchstore-accounts}

BranchStore tracks:

-   shared prefixes;
-   private branch suffixes;
-   branch positions;
-   cells consumed by generation and prefill;
-   cells reclaimed by pruning.

It does not decide whether the work is useful.

#### ContextPressure observes {#contextpressure-observes}

`ContextPressure` derives stable facts for one decision boundary:

```ts label="TypeScript"
remaining = nCtx - cellsUsed;
headroom = remaining - softLimit;
critical = remaining < hardLimit;
percentAvailable = round(remaining / nCtx * 100);
```

It does not nudge, kill, retry, or recover an Agent.

#### AgentPolicy decides {#agentpolicy-decides}

Policy receives some combination of:

-   the Agent;
-   parsed model output;
-   a pending Tool result;
-   a pressure snapshot;
-   pool configuration;
-   policy state such as elapsed time.

It returns a declarative action.

#### AgentPool enforces {#agentpool-enforces}

The pool:

-   advances branches;
-   commits sampled tokens;
-   dispatches Tools;
-   admits or defers prefill;
-   forces terminal grammar during recovery;
-   clamps report budgets to what fits;
-   salvages partial reports;
-   prunes branches;
-   emits lifecycle events.

Policy never bypasses those mechanics.

### Pressure is a photograph, not a live gauge {#pressure-is-a-photograph-not-a-live-gauge}

The pool freezes `ContextPressure` at phase boundaries.

Every policy decision in that phase sees the same baseline.

Without a snapshot:

```text label="Structure"
Agent A evaluated first
    sees more space

Agent B evaluated later
    sees less space
```

The same cohort could behave differently merely because an array was iterated in another order.

Instead:

```text label="Structure"
phase begins
    ↓
freeze one pressure snapshot
    ↓
all policy decisions use that snapshot
    ↓
batch native mutations
    ↓
next phase receives a new snapshot
```

SETTLE maintains local admission accounting while building its batch because native `cellsUsed` updates only when the prefill is committed.

> **Reason from the supplied snapshot. Do not poll native pressure inside a hook and do not mutate it.**

### Every Agent spends live-attention budget {#every-agent-spends-live-attention-budget}

Each Agent spends from the Session’s finite live-attention budget through:

-   generated tokens;
-   Tool-result prefill;
-   recovery prompts and reports;
-   nested Agent work;
-   private suffixes across sibling branches.

Shared prefixes are amortised, but new private tokens still occupy live cells.

Pressure is not a static prompt-length limit. It changes as the cohort works.

## 3\. Set the limits {#3-pressure-boundaries}

### The two limits are not symmetric {#the-two-limits-are-not-symmetric}

The most common mistake is treating `softLimit` and `hardLimit` as stronger and weaker forms of the same cutoff.

They have different jobs.

### Soft limit: the new-work boundary {#soft-limit-the-new-work-boundary}

```ts label="TypeScript"
headroom = remaining - softLimit;
```

When `headroom > 0`, ordinary new work may be admitted.

When `headroom <= 0`, the system should contract:

-   do not spawn new research Agents;
-   defer oversized ordinary Tool results;
-   nudge non-terminal calls towards reporting;
-   narrow from exploration towards exploitation;
-   preserve capacity for downstream work and recovery.

The soft limit is advisory.

Crossing it does not automatically make decode unsafe.

### Hard limit: the safety and recovery boundary {#hard-limit-the-safety-and-recovery-boundary}

```ts label="TypeScript"
critical = remaining < hardLimit;
```

The hard limit is mechanical:

-   an ordinary Agent must not continue into another unsafe decode;
-   the pool forces exit before the native crash floor;
-   recovery is budgeted from the space above this line;
-   the configured value must satisfy the runtime’s batch-safety invariant.

```text label="Structure"
used KV       ordinary headroom       soft-to-hard reserve      hard floor
█████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░│
                                      ↑                         ↑
                                  soft limit                hard limit
```

> **Soft says “finish the work”. Hard says “you may not continue the work, but space was reserved to save what you found”.**

### Raising `softLimit` does not reduce recovery to zero {#raising-softlimit-does-not-reduce-recovery-to-zero}

Recovery uses:

```text label="Structure"
remaining - hardLimit
```

not only:

```text label="Structure"
remaining - softLimit
```

Raising `softLimit` nudges earlier. It does not remove the reserved recovery band down to `hardLimit`.

## 4\. Decide in the loop {#4-the-pool-decision-cycle}

### The pool’s decision cycle {#the-pools-decision-cycle}

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

#### SPAWN + EXTEND {#spawn-extend}

-   admit queued Agents if they fit;
-   extend a shared spine for sequential workflows;
-   apply pending per-Agent cancellation.

#### PRODUCE {#produce}

-   freeze a pressure snapshot;
-   ask policy whether an Agent must exit before generation;
-   sample one token for every active branch;
-   parse stop boundaries and Tool calls;
-   run the gates on the emitted call — the framework’s authorization, the tool’s own, the harness’s — before the policy is asked;
-   ask `onProduced()` what the output means.
-   for a call of the terminal tool, ask `onReturn` whether the turn may end, and what the result becomes.

#### COMMIT {#commit}

-   commit the sampled cohort through BranchStore.

#### DRAIN {#drain}

-   receive completed off-loop Tool executions;
-   return their post-processing to the single native loop;
-   ask `afterExecute` what each completion was — an attempt, a retry, a failure.

#### SETTLE {#settle}

-   decide whether Tool results and recovery turns fit;
-   defer oversized ordinary work;
-   ask `beforeAdmit` when waiting cannot resolve the deferral — the tool’s hook, the harness’s, else drop;
-   batch prefill, book each admitted item and ask `afterAdmit` for a follow-up, then reactivate the admitted Agents.

#### DISPATCH {#dispatch}

-   ask `shouldExplore()` how content-boundary Tools should score;
-   execute Tool calls;
-   ask `afterExecute` what an inline completion was; park a retry, settle a failure.

Policy is consulted at specific decision boundaries. It does not control the loop.

## 5\. Save the work before you reclaim it {#6-recovery}

### Recovery: save useful work before pruning {#recovery-save-useful-work-before-pruning}

An Agent may stop without a voluntary terminal result because of:

-   context pressure;
-   elapsed time;
-   maximum turns;
-   graceful wind-down;
-   a policy hard exit.

Its branch may still contain useful evidence.

`onRecovery()` chooses:

```ts label="TypeScript"
type RecoveryAction =
  | { type: "extract"; prompt: PromptText }   // { systemPrompt, content } — your words, given the report's word budget
  | { type: "skip" };
```

#### Policy owns the meaning {#policy-owns-the-meaning}

Policy decides:

-   whether the work is worth extracting;
-   how to instruct the Agent to compress it;
-   whether recovery should be staggered or parallel;
-   an optional preferred report budget.

#### AgentPool owns the mechanics {#agentpool-owns-the-mechanics}

The pool:

-   computes what safely fits;
-   forces the terminal Tool grammar;
-   prefills the recovery turn;
-   applies a token stop where bounded;
-   parses the terminal result;
-   salvages truncated output where possible;
-   emits recovery events;
-   prunes the branch.

> **Policy asks for the report. The pool guarantees that asking is mechanically safe.**

#### Recovery is a real turn {#recovery-is-a-real-turn}

Recovery is not string extraction from hidden state.

The pool injects a final instruction into the Agent’s live branch and constrains generation to the terminal result contract.

### Why recovery uses the hard-limit reserve {#why-recovery-uses-the-hard-limit-reserve}

Near the soft boundary:

```text label="Structure"
remaining ≈ softLimit
```

there may be almost no ordinary headroom:

```text label="Structure"
headroom = remaining - softLimit ≈ 0
```

If recovery were budgeted only from `headroom`, the system would be unable to report exactly when reporting is required.

Instead:

```text label="Structure"
recovery capacity = remaining - hardLimit
```

The band between soft and hard limits is available for safely converting unfinished work into a result.

The soft boundary means:

> Stop opening ordinary work.

It does not mean:

> No more recovery tokens may be decoded.

### Choose what recovery costs {#staggered-and-parallel-recovery}

**You set how much effort the pool spends saving work.** `recoveryShape` picks between lossless and fast.

#### Staggered {#staggered}

```text label="Structure"
recover A
    ↓
prune A
    ↓
recover B
    ↓
prune B
```

Properties:

-   one Agent at a time;
-   each report benefits from earlier pruning;
-   larger or uncapped reports;
-   maximum individual finding preservation;
-   blocks pool progress;
-   suited to high-effort, quality-first workflows.

#### Parallel {#parallel}

```text label="Structure"
budget the cohort
        ↓
admit recovery turns
        ↓
decode them in the pool loop
        ↓
prune each as it finishes
```

Properties:

-   reports share recovery capacity;
-   report sizes are mechanically bounded;
-   better batching and latency;
-   suited to low/medium effort and graceful wind-down.

An explicit `recoveryBudget` is a preference. The pool clamps it to what safely fits.

### In-flight terminal-report salvage {#in-flight-terminal-report-salvage}

If an Agent is force-stopped while already emitting its terminal Tool call, restarting recovery would:

1.  discard the partial report;
2.  inject another turn;
3.  consume additional KV;
4.  risk failing again in the same exhausted context.

The pool instead parses and salvages the existing partial terminal output without further decode.

This is a pool mechanic, not a policy hook.

Policy decides that the Agent should stop. The pool chooses the least-destructive safe route.

### Three ways to end work {#wind-down-per-agent-cancellation-and-scope-halt}

Wrap-up reaps every agent to recovery; cancelling one agent discards it with no recovery; a halt unwinds the scope with everything in it. How a harness sends each is on [Agent policy](/agent-policy#end-work-early).

## 6\. A worked pressure example {#7-configuration-and-extension}


Assume:

```text label="Structure"
nCtx      = 32,768
softLimit = 2,048
hardLimit =   512
cellsUsed = 29,500
```

Then:

```text label="Structure"
remaining = 3,268
headroom  = 1,220
critical  = false
```

Ordinary work still has approximately 1,220 cells above the soft reserve.

Later:

```text label="Structure"
cellsUsed = 30,900
remaining = 1,868
headroom  =  -180
critical  = false
```

The soft boundary is crossed:

-   stop opening research;
-   defer oversized ordinary results;
-   nudge towards reporting;
-   recovery still has up to `1,868 - 512 = 1,356` cells above the hard line.

Later:

```text label="Structure"
cellsUsed = 32,300
remaining = 468
critical  = true
```

An ordinary Agent must not produce another token.

The pool stops it before decode and applies salvage or recovery.

> `headroom <= 0` and `critical === true` are not the same state.

## Relationship to the programming model {#relationship-to-the-programming-model}

Structured concurrency answers:

> Who owns this work, and what happens when its owner ends?

AgentPolicy answers:

> While the owner and AgentPool remain alive, what should this Agent do next?

```text label="Structure"
Effection scope
    owns the pool
        ↓
AgentPool
    owns Agent execution and BranchStore mechanics
        ↓
ContextPressure
    presents stable resource facts
        ↓
AgentPolicy
    returns behavioural decisions
        ↓
AgentPool
    safely applies them
```

That separation allows harness developers to customise judgement under scarcity without rewriting lifecycle management or inference scheduling.

Return to [Thinking in Lloyal](/thinking-in-lloyal).
