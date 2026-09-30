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

### Choose your reading path {#choose-your-reading-path}

#### I need the mental model {#i-need-the-mental-model}

Read:

1.  [Scope termination and Agent termination](#scope-termination-and-agent-termination)
2.  [The four-layer decision path](#the-four-layer-decision-path)
3.  [The two limits](#the-two-limits-are-not-symmetric)
4.  [Recovery](#recovery-save-useful-work-before-pruning)

#### I am configuring `DefaultAgentPolicy` {#i-am-configuring-defaultagentpolicy}

Read:

1.  [AgentPolicy is a rulebook](#agentpolicy-is-a-rulebook)
2.  [Exploration and lifecycle](#exploration-and-lifecycle-are-separate-axes)
3.  [Configuring the default policy](#configuring-the-default-policy)
4.  [Tuning by workload](#tuning-by-workload)

#### I am implementing a custom policy {#i-am-implementing-a-custom-policy}

Read:

1.  [`onProduced`](#onproduced-interpret-the-models-stop)
2.  [`shouldExit`](#shouldexit-stop-before-another-token)
3.  [`beforeAdmit`](#beforeadmit-when-a-result-cannot-fit)
4.  [Tool retry](#transient-tool-failure-park-retry-or-pivot)
5.  [Writing a custom policy](#writing-a-custom-policy)

#### I am debugging pressure or incomplete reports {#i-am-debugging-pressure-or-incomplete-reports}

Read:

1.  [Pressure is a photograph](#pressure-is-a-photograph-not-a-live-gauge)
2.  [The pool decision cycle](#the-pools-decision-cycle)
3.  [Why recovery uses the hard-limit reserve](#why-recovery-uses-the-hard-limit-reserve)
4.  [In-flight report salvage](#in-flight-terminal-report-salvage)

---

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

---

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

---

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

---

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

---

## 5\. Write the rules {#5-policy-surface}

### AgentPolicy is a rulebook {#agentpolicy-is-a-rulebook}

The public policy surface is easiest to understand as a set of questions.

| Hook or property | Question |
| --- | --- |
| `onProduced` | The model stopped or emitted a call. What does it mean? |
| `shouldExplore` | Should this Tool broaden the search or tighten around root intent? |
| `shouldExit` | Must this Agent stop before producing another token? |
| `hooks` | The harness’s part of a tool call’s life — gates, retry, admission, follow-up — as data. What does this harness add to what the tool declared? |
| `onRecovery` | Should the pool force a final report from this stopped Agent? |
| `guardOverrides` | Which declared gates are off, and which read the whole cohort instead of the agent’s own lineage? |
| `pressureThresholds` | Where are the new-work and safety boundaries? |
| `recoveryShape` | Recover for individual quality or cohort throughput? |
| `recoveryBudget` | How large may a cohort recovery turn, or a voluntary report, run? |
| `resetTick` | Which policy state is meaningful only for one tick? |

The pool passes the facts it owns.

Policy combines them with state such as:

-   elapsed time;
-   cost budget;
-   domain rules;
-   previous decisions;
-   task-specific thresholds.

Then it returns an action.

### `onProduced`: interpret the model’s stop {#onproduced-interpret-the-models-stop}

When the model reaches a stop boundary, parsing yields content and Tool calls.

`onProduced()` maps that state to an action:

```ts label="TypeScript"
type ProduceAction =
  | { type: "tool_call"; tc: ParsedToolCall }
  | { type: "return"; result: string }
  | { type: "free_text_return"; content: string }
  | { type: "nudge"; message: string }
  | { type: "idle"; reason: IdleReason };
```

Typical decisions:

-   dispatch a valid non-terminal Tool call;
-   intercept the designated terminal Tool and extract its result;
-   replace a call the budget cannot afford with a nudge — the gates ran before this, so a refused call never arrives here;
-   accept free text for a role whose prose is its result;
-   stop an Agent that reached a budget boundary.

#### Terminal Tools are result contracts {#terminal-tools-are-result-contracts}

A pool may designate a terminal Tool:

```ts label="TypeScript"
agentPool({
  terminal: reportTool,
  // ...
});
```

When the model calls it, the framework intercepts the call instead of executing it as an ordinary external action.

The terminal Tool defines:

-   the schema of a valid Agent result;
-   the point at which the Agent is complete;
-   the grammar used to force a recovery report.

The Tool can be named `report`, `submit`, `finish`, or another harness-specific term.

### The harness’s part of a tool call’s life {#the-harnesss-part-of-a-tool-calls-life}

A Tool defines what an action is and how it runs — and, with `Tool.hooks`, what it says about the life of its own calls: the gates that may refuse one, what a completion means, what to do with a result that does not fit, a follow-up once a result is admitted. [The Abilities guide](/abilities#the-life-of-a-tool-call) describes the four moments. The harness contributes to the same contract, as **data on its policy**, not as methods:

```ts label="TypeScript"
type GuardScope = "lineage" | "cohort";
type GuardOverrides = Readonly<Record<string, false | { scope: GuardScope }>>;

interface AgentPolicy {
  // …
  // Values of the one contract every tool declares its own in,
  // walked in order after the tool’s.
  readonly hooks?: readonly ToolLifecycleHooks[];
  // Overrides of declared gates, by published name — from harness.yml.
  readonly guardOverrides?: GuardOverrides;
}

interface GuardInput {
  tool: string;
  args: Record<string, unknown>;
  // this tool’s earlier calls whose results were read, in the harness’s scope
  attended(): readonly Record<string, unknown>[];
}

interface ToolGuard {
  name: string;                    // published: the override key, the trace value
  reject(i: GuardInput): boolean;  // true refuses the call
  message: string;                 // what the model reads in the call’s place
}
```

At each moment the pool walks one list — the framework’s authorization gate, then the tool’s hooks, then yours in order, then the framework’s defaults — and the first concrete decision wins; `undefined` abstains. So a harness entry beats `DefaultAgentPolicy`’s own opinions (its retry budget, its settle nudge, which it appends as one more entry after yours), and the class’s opinions beat the framework’s defaults. A harness cannot override a tool’s `afterExecute`, `beforeAdmit` or `afterAdmit`: the tool is asked first. What a harness *does* own is scope. A gate reads `attended()` — the arguments of the gated tool’s earlier calls whose results were actually read — in the agent’s own lineage by default; the harness may widen a gate to the whole cohort, or switch it off, by name:

```yaml label="harness.yml"
defaults:
  guards:
    # research’s siblings feed one synthesis: a URL or query any of them
    # attended is not fetched again. `false` switches a gate off.
    url_dedup:   { scope: cohort }
    query_dedup: { scope: cohort }
```

Lineage is the default because it is the safe one: a spreadsheet’s isolated rows, or a delegate’s sub-agent whose forked context already holds the caller’s fetch, must not be deduplicated against siblings. Research is the harness that wants the cohort, and it says so in its own config. `isGuardOverrides` is the one runtime check of the shape, for the config rung that reads it from YAML. The framework’s own gate is never subject to overrides: `auth_reject: false` is inert.

```text label="Structure"
Tool.hooks
    the gates and the meanings the tool declares

Tool.protected + GrantStore
    declares an authorisation requirement; holds consent

the frame (the framework)
    the authorization gate, first; the defaults, last

policy.hooks + policy.guardOverrides
    the harness’s own entries, and the scope of every declared gate

AgentPool
    walks them, in that order, at every moment; enforces the decision
```

Credentials do not need to enter the model context.

### Exploration and lifecycle are separate axes {#exploration-and-lifecycle-are-separate-axes}

`shouldExplore()` adapts retrieval strategy while the Agent remains active. It sets the posture; what that posture changes about the evidence admitted is [context admission](/focal-lens).

#### Explore {#explore}

When context and time are plentiful:

-   favour the Agent’s local task;
-   broaden coverage;
-   admit novel evidence;
-   tolerate landscape discovery.

#### Exploit {#exploit}

As resources tighten:

-   enforce coherence with the original root intent;
-   rank more strictly;
-   avoid low-value tangents;
-   turn existing evidence into a result.

```text label="Structure"
explore ───────────────────────────────→ exploit
```

Lifecycle remains separate:

```text label="Structure"
work ─────────────→ report ────────────→ recover or prune
```

Do not treat exploit mode as an exit signal.

### `shouldExit`: stop before another token {#shouldexit-stop-before-another-token}

`shouldExit(agent, pressure)` runs before `produceSync()`.

It asks:

> Is it unsafe or no longer worthwhile for this Agent to generate another token?

The default fallback is effectively:

```ts label="TypeScript"
return pressure.critical;
```

A custom policy may also consider:

-   elapsed hard time;
-   hard cost budget;
-   domain completion state;
-   a harness-specific stop condition.

When it returns `true`:

-   the Agent stops;
-   its branch remains temporarily available;
-   the pool may call `onRecovery()`;
-   policy does not prune the branch itself.

### `beforeAdmit`: when a result cannot fit {#beforeadmit-when-a-result-cannot-fit}

A Tool may return a result that cannot be admitted while preserving the soft reserve.

The pool first defers it:

```text label="Structure"
result does not fit
        ↓
wait for siblings to complete and prune
        ↓
retry on a later tick
```

This often resolves naturally.

`beforeAdmit` is asked only at the stall-break:

```text label="Structure"
deferred work remains
        +
nothing in the pool can still free room
        ↓
waiting cannot change the outcome
```

The tool’s hook is asked first, then each of the policy’s `hooks`, then the framework. Each sees the agent, the call, the `cost` of placing the result (in the unit `pressure.headroom` reports room in) and the pool’s terminal tool, if any. A contributor may replace the result with a compact nudge:

```ts label="TypeScript"
{ type: "nudge", message: "The result is too large. Report from the evidence already gathered." }
```

Or stop the Agent:

```ts label="TypeScript"
{ type: "drop" }
```

`DefaultAgentPolicy`’s own entry nudges — naming the remaining word budget — when the pool has a terminal tool and the Agent has called something, and drops otherwise. A policy with no entry drops, by the framework’s default. The drop reason on the trace says which: `pressure_settle_reject` when a contributor decided, `settle_stall_break` when the framework’s default did. The pool still owns admission and branch lifecycle.

### Transient Tool failure: park, retry, or pivot {#transient-tool-failure-park-retry-or-pivot}

A Tool may throw `ToolRetryError(message, retryAfterMs)` for a transient condition. Every completion — a return or a throw — is put to `afterExecute`: the tool’s hook, then each of the policy’s `hooks`, then the framework’s default. Each is told which attempt this is, and answers:

```ts label="TypeScript"
type ExecuteDecision =
  | { type: "attempt" }                 // it counts — admit, or end on a throw
  | { type: "retry"; afterMs: number }  // park; the same call runs again
  | { type: "fail"; message?: string }; // a failure the model reads instead
```

The framework’s default retries a `ToolRetryError` once at the tool’s own delay, then fails with the rate-limit message; anything else is an attempt. `DefaultAgentPolicy` contributes the same rule with its own budget, `maxToolRetries`, through `retryUpTo(n)`, which a harness can reuse in an entry of its own.

#### Retry {#retry}

The Agent parks in `awaiting_tool`:

-   no generation turns are consumed;
-   no tokens are produced;
-   siblings continue;
-   the same call is retried later.

A park that wind-down catches is settled as an honest failure — the call did not complete before the run began winding down — and the Agent reports with what it has.

#### Fail {#fail}

The pool settles a compact failure result into the branch so the Agent can choose another route. The entry that decided says why; with no message, the pool says only that the tool failed and will not be retried.

A custom entry can consider:

-   the attempt;
-   remaining wall time;
-   Tool importance;
-   available alternatives;
-   a transient failure the Tool *returned* rather than threw — a provider’s 429 inside a 200 — which is what makes this a decision about every completion.

Avoid unbounded retries.

---

## 6\. Save the work before you reclaim it {#6-recovery}

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
  | {
      type: "extract";
      prompt: {
        system: string;
        user: string;
      };
    }
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

**Ending is a decision, not an event.** Wind down and every Agent reports what it has; cancel one and its siblings carry on; halt and the scope unwinds with everything in it.

#### Graceful wind-down {#graceful-wind-down}

A `WindDown` signal means:

> Stop expanding, drain in-flight work, and return the best available result.

The pool:

-   stops new spawns;
-   allows in-flight Tools to settle;
-   recovers useful findings;
-   converges towards completion.

This suits a **Wrap up now** action.

#### Per-Agent cancellation {#per-agent-cancellation}

A `CancelAgent` signal means:

> Discard this one line of work.

The pool reclaims that Agent while siblings continue.

Depending on the contract, this may deliberately skip recovery.

#### Scope halt {#scope-halt}

A Session release means:

> The query no longer has an owner.

Effection unwinds the entire child tree.

A user asking to wrap up is not the same event as a browser disappearing.

---

## 7\. Tune it for the workload {#7-configuration-and-extension}

### Configuring the default policy {#configuring-the-default-policy}

Most harnesses should configure `DefaultAgentPolicy` rather than implement the entire interface.

```ts label="TypeScript"
const policy = new DefaultAgentPolicy({
  terminalToolName: "report",

  minToolCallsBeforeReturn: 2,

  shouldExplore: {
    context: 0.4,
    time: 0.5,
  },

  budget: {
    context: {
      softLimit: 2048,
      hardLimit: 512,
    },
    time: {
      softLimit: 90_000,
      hardLimit: 120_000,
    },
  },

  recovery: {
    system: "Return the strongest findings already established.",
    user: "Produce a concise evidence-backed report.",
  },

  recoveryShape: "parallel",
  recoveryBudget: 768,

  maxToolRetries: 1,
});
```

Interpretation:

-   retrieval becomes more exploitative as context or time tightens;
-   soft boundaries encourage completion;
-   hard boundaries force exit;
-   stopped Agents may recover;
-   parallel recovery bounds latency and report size.

Tune the policy to the workload, not merely to the model.

### A worked pressure example {#a-worked-pressure-example}

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

### Writing a custom policy {#writing-a-custom-policy}

Custom policy is appropriate when the harness has domain rules that configuration cannot express.

Prefer extending the default:

```ts label="TypeScript"
class CaseworkPolicy extends DefaultAgentPolicy {
  override shouldExplore(
    agent: Agent,
    pressure: ContextPressure,
  ): boolean {
    if (hasUnresolvedMandatoryIssue(agent)) {
      return true;
    }

    return super.shouldExplore(agent, pressure);
  }

  override shouldExit(
    agent: Agent,
    pressure: ContextPressure,
  ): boolean {
    if (caseDeadlineHasPassed()) {
      return true;
    }

    return super.shouldExit(agent, pressure);
  }
}
```

This preserves default handling for:

-   terminal Tools;
-   authorisation and dedup guards;
-   recovery;
-   pressure safety;
-   retries.

#### Override decisions, not execution {#override-decisions-not-execution}

A policy should return actions.

It should not:

-   call native decode;
-   mutate BranchStore;
-   prune branches;
-   execute Tools;
-   create asynchronous side effects inside hooks;
-   maintain a second scheduler.

If a decision requires substantial asynchronous work, it probably belongs in:

-   an orchestrator;
-   a Tool;
-   a Source;
-   or another scoped Operation.

### The synthesiser exception {#the-synthesiser-exception}

A Tool-less synthesiser may treat free text as its terminal result.

The basic scaffold currently expresses that through a narrow `onProduced()` override:

```ts label="TypeScript"
class SynthPolicy extends DefaultAgentPolicy {
  override onProduced(
    ...args: Parameters<DefaultAgentPolicy["onProduced"]>
  ): ReturnType<DefaultAgentPolicy["onProduced"]> {
    const [, parsed] = args;

    if (!parsed.toolCalls[0] && parsed.content) {
      return {
        type: "free_text_return",
        content: parsed.content,
      };
    }

    return super.onProduced(...args);
  }
}
```

This changes one semantic rule:

> For this role, prose is the result.

It does not change ownership, scheduling, branch lifetime, or pressure enforcement.

A future stock text-return policy or `returnMode: "text"` can simplify this common case.

### Tuning by workload {#tuning-by-workload}

#### Interactive assistant {#interactive-assistant}

Prefer:

-   fewer Agents;
-   earlier exploit;
-   tighter time limits;
-   parallel recovery;
-   modest report budgets;
-   low retry count.

#### Broad research {#broad-research}

Prefer:

-   exploration while context is healthy;
-   enough soft reserve for synthesis;
-   `pruneOnReturn`;
-   terminal Tool contracts;
-   parallel recovery for lower effort levels.

#### Deep research {#deep-research}

Prefer:

-   dynamic orchestration;
-   larger context;
-   later exploit thresholds;
-   staggered recovery;
-   generous hard time;
-   explicit downstream synthesis reserve.

#### Casework {#casework}

Prefer:

-   policy guards for institutional rules;
-   domain-specific exit conditions;
-   recoverable intermediate findings;
-   protected action Tools;
-   grants and audit events;
-   procedural orchestration.

Policy should reflect the product’s meaning of **done**.

---

## Quick reference {#quick-reference}

### Common mistakes {#common-mistakes}

#### Treating the soft limit as a kill line {#treating-the-soft-limit-as-a-kill-line}

It is the new-work and nudge boundary. Recovery may use the reserve down to the hard limit.

#### Raising the soft limit to get longer recovery {#raising-the-soft-limit-to-get-longer-recovery}

That nudges earlier. Recovery remains bounded by the hard-limit reserve and current cohort.

#### Making policy prune branches {#making-policy-prune-branches}

Policy returns decisions. AgentPool owns branch lifecycle.

#### Performing async work inside hooks {#performing-async-work-inside-hooks}

Hooks are decision boundaries. Move asynchronous work into an orchestrator, Tool, Source, or Operation.

#### Conflating exploit with exit {#conflating-exploit-with-exit}

`shouldExplore() === false` narrows retrieval. It does not end the Agent.

#### Retrying without considering time {#retrying-without-considering-time}

A retry that cannot finish inside the useful time budget should fail or pivot.

#### Using Session halt for wrap-up {#using-session-halt-for-wrap-up}

A halt removes the owner. Use graceful wind-down when the user wants the best available result.

#### Treating policy as a native-safety escape hatch {#treating-policy-as-a-native-safety-escape-hatch}

The pool validates hard invariants. Policy cannot opt out of runtime safety.

### Rules for coding agents {#rules-for-coding-agents}

```md label="Markdown"
## Lloyal AgentPolicy invariants

- AgentPolicy is a synchronous decision strategy, not a scheduler.
- BranchStore accounts, ContextPressure observes, policy decides, and
  AgentPool enforces.
- Do not mutate branches, prune KV, or call native decode from a policy hook.
- Treat ContextPressure as an immutable decision-boundary snapshot.
- `softLimit` is the new-work and nudge boundary.
- `hardLimit` is the mechanical decode floor and recovery boundary.
- Recovery budgets from `remaining - hardLimit`, not only from `headroom`.
- `shouldExplore` changes retrieval strategy; it does not terminate an Agent.
- `shouldExit` stops an Agent but leaves its branch available for recovery.
- `onRecovery` chooses extract or skip; AgentPool enforces grammar and budget.
- `beforeAdmit` is asked only at the stall-break, after ordinary deferral cannot resolve.
- Wind-down, per-Agent cancellation, and Effection scope halt are different.
- Prefer configuring or extending `DefaultAgentPolicy` over replacing it.
```

---

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
