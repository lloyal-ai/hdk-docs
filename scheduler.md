---
title: "The scheduler"
description: "The machine inside an AgentPool, learned by following one brief: what a cell, a branch, a tick and a schedule are, how work is admitted into one shared cache, what the three lines mean, what happens when nothing can move, how a dropped Agent still reports, and where structured concurrency holds all of it together."
lede: "One context, many Agents, one decision per tick. This is the full mental model, built one word at a time by following one brief through the pool."
---

<!--
Checked against packages/agents/src on 2026-10-12:
  agent-pool.ts (the tick loop, its signals, permits and capacity), scheduler.ts (schedule(), recoveryFor, the stall-break),
  state.ts (TickState, Pending, Schedule, Drop, Recovery), pressure.ts (ContextPressure: headroom, critical, floor, room),
  apply.ts (Applier: applySchedule, enactDrop, recover, finishRecovery, applyOutputs),
  execute.ts (Executor: run, settle, dispatch, spawn, intake; makePermits), AgentPolicy.ts (shouldExit, onRecovery, budgets),
  capture.ts (extractTerminalResult, stripDanglingToolCall), hooks.ts (the hook walk), emit.ts (the projection to trace and bus),
  Agent.ts (observe: the terminal latch), context.ts (wind-down, pause and cancel contracts).
The numbers in the walkthrough are from a traced Fieldnote run of the same date.
-->

Every page before this one has told you what an Agent is, how a pool is driven from above, and what a policy decides. This page is about the machine in between: the loop that, every few tens of milliseconds, decides which Agents sample, which results enter the cache, who is dropped, and how a dropped Agent still gets its findings out. It is the heart of an AgentPool, and it was designed to be understood whole.

The design has one idea in it. The decision is separated from the doing, and the decision is a value. Each tick the pool freezes what it knows into a value, hands that value to a pure function, and gets back a second value that says what this tick does. Only then does anything act.

::: pull
**Observe into a value. Decide as a function. Enact in one fixed order.**
:::

You will not be asked to hold that idea abstractly. The page follows one brief from its first tick to its reports, and introduces each word at the moment the story needs it, so that by the end the whole machine is in your head in the order it runs. The brief is real: three research Agents, one 32k context, pages fetched from the web, the numbers taken from a trace.

It builds on [Structured concurrency](/structured-concurrency), [Continuous Context](/continuous-context) and [Adaptive compute](/agent-policy-and-context-pressure). The policy page is about what an Agent should do next; this one is about the machine that asks.

## 1. Before the first tick {#before-the-first-tick}

A harness has loaded one model and created one context for it. Three words describe what that context is made of, and everything later is accounting over them.

::: callout Cells, the cache, and branches
A **cell** is one slot in the model's key-value cache: the attention state of one token the model has seen. The **cache** is the fixed set of cells the context was created with, here 32,768. Every token the model is shown or produces costs one cell for as long as that line of work exists, and when the line ends its cells return.

A **branch** is one line of work in that cache: a run of positions with its own history, forked from a parent and sharing the parent's prefix. Forking costs nothing; the fork's own tokens are the only cells it adds. The context has a fixed number of **sequences**, the slots a branch can occupy, five in this harness. [Continuous Context](/continuous-context) is the long form of why this is the right primitive.
:::

The brief arrives. The harness builds a **spine**: a branch holding the shared prefix every Agent will fork from, the system prompt and the task. Then it asks the pool for three Agents.

::: callout Agents, spawns, and seats
An **Agent** is a branch with a status, a turn history and a policy watching it. It is not an Effection Task; it is owned by the pool, and the pool is the Task. [Thinking in Lloyal](/thinking-in-lloyal#own-the-state) draws the line between owning work and owning state, and [Structured concurrency](/structured-concurrency#treating-an-agent-as-a-task) shows what goes wrong when the two are confused.

A **spawn** is the request to create one. It is priced before it is admitted: the Agent's own suffix, its task text, is formatted and tokenized so the pool knows how many cells it will fill. A spawn is admitted when three things fit at once: those cells, a vacant sequence to fork into, and a **seat**. The pool's `capacity` is how many Agents may be alive at once; a spawn beyond it waits its turn in request order. [Agents and orchestration](/agents) calls this seats and waves.
:::

Three spawns are priced at a few hundred cells each. All three fit, all three get a sequence and a seat. The pool is ready to tick.

## 2. The tick {#the-tick}

The pool is a loop, and one turn of the loop is a **tick**. Every tick has the same five steps in the same order, and the whole of the rest of this page is what happens inside them.

[![The tick loop: observe, schedule, apply the schedule, execute, apply what came back; fan-out tool children run on their own fibers and hand their completions to the next observe.](/assets/scheduler-tick.svg)](/assets/scheduler-tick.svg)

1. **Observe.** The prune pass reclaims every branch whose work ended last tick, returning its cells. Completed tool calls are taken in. Then the pool samples the cache once: cells in use, cells remaining. That one sample is the only pressure reading this tick will use.
2. **Schedule.** `schedule(state)` runs: a pure function over one value, `TickState`, returning one value, `Schedule`. It reads no store, calls no model, sends no event.
3. **Apply the schedule.** Drops are enacted and their recoveries booked; finished reports are parsed and announced; stall outcomes are announced. If the schedule says the pool is done, the loop ends here.
4. **Execute.** The executor runs the schedule's phases in one fixed order: halt cancelled tool calls, prefill the admitted items, dispatch tool calls, fork and activate admitted spawns, then sample one token from every Agent in the decode set and commit all of those tokens in one batched decode.
5. **Apply what came back.** An Agent that emitted a stop token has its turn parsed, and the policy says whether it made a tool call, returned, or idled. Calls and landed results become pending work for the next tick.

::: callout What the schedule reads and returns
**`TickState`** is everything `schedule()` may read: the tick number, the run clock and the wall clock, the one pressure sample, the Agent roster, the pending record, the signals (paused, wind-down, user cancels, orchestrator done), which Agents have a tool call in flight, and how many sequences are vacant. It is built once per tick and never changes while it is read.

**`Schedule`** is everything this tick does, as fields: `hold`, `halts`, `drops`, `finishes`, `spawns`, `refusedSpawns`, `extends`, `prefills`, `stall`, `abandoned`, `dispatch`, `decode`, the post-admission `pressure`, `alive`, what is `remaining` for next tick, and `close`. The executor runs them in a fixed order; nothing in the schedule is advice.

The **pending record** is what the loop carries between ticks: items waiting to enter the cache, parked retries, dispatch requests, spawn requests and spine extensions. It is the only queued work that crosses from one tick to the next; the Agents themselves, their branches, their histories and the clocks persist as the roster the next `TickState` is built from.
:::

::: callout The operating-system analogy
If you have held a kernel scheduler in your head, the shape is familiar: a run queue, a quantum, processes blocked on I/O, memory pressure, admission control, a last-resort killer. The pool has each of these, with one simplification. There is no context switch. Every Agent in the decode set samples one token and all of those tokens go into one batched decode, so the quantum is one token for everyone at once, and three Agents cost a bigger batch, not three switches.

| Operating system | AgentPool |
| --- | --- |
| process | Agent, a branch of the shared context |
| run queue | the decode set the schedule names |
| quantum | one token per active Agent, one batched decode |
| blocked on I/O | `awaiting_tool`, until its result is admitted |
| memory | cells, one cache for every Agent |
| admission control | the ledger, against headroom or room |
| memory pressure | the soft line: nudge and defer |
| OOM killer | the hard line: drop, then recover the findings |
| deadlock detection | the stall-break |
| process table | the pending record and the Agent roster |
:::

::: owns
The loop is an `Operation`. `useAgentPool` is an Effection resource, and the tick loop is one task spawned inside it; the orchestrator that asks for spawns is another. Both end with the resource, so a harness that stops mid-brief stops the loop with everything it was running. The page on [Structured concurrency](/structured-concurrency#what-effection-guarantees) states the three guarantees this rests on; Frontside's [Resources](https://frontside.com/effection/guides/v4/resources/) and [Scope](https://frontside.com/effection/guides/v4/scope/) guides are the source. [Thinking in Lloyal](/thinking-in-lloyal#own-the-work) is where `Operation<T>` is introduced as work waiting for an owner.
:::

In the brief's first ticks all three Agents are **active**: each samples one token per tick, the three tokens are committed together, and the trace shows the pool ticking about twelve times a second. Nothing is pending. The schedule's only non-empty field is `decode`.

## 3. Where an Agent is {#status}

Three words and one latch say where an Agent is, and the scheduler reads nothing else about it to decide whether it participates.

[![An Agent moves from active to awaiting_tool on a tool call, back to active when its result is admitted, to idle when it returns or is dropped and recovered, and to disposed when the next observe prunes its branch.](/assets/scheduler-status.svg)](/assets/scheduler-status.svg)

- **active**: it samples this tick unless a verdict removes it.
- **awaiting_tool**: its call went out, or its result is waiting for admission. It samples nothing and decides nothing until admission re-activates it; its branch stays resident, so its cells are still in use.
- **idle**: its span is over. The next observe prunes its branch and returns the cells.
- **disposed**: the branch is gone.
- **extracting**, the latch: a one-way flag beside the status that says this Agent is writing its recovery report. We meet it in section 8.

Participation in the next tick is these rules and no others. An active Agent samples. An awaiting Agent returns only through admission. A dropped Agent's working turn is over; it samples again only for its recovery report, under the extracting latch. A recovering Agent is finished, never dropped. An Agent that became active during execute, from an admitted item or a spawn, samples from the next tick, after the scheduler has had its say on it.

## 4. The first tool call {#a-tool-call}

Forty seconds in, the first Agent emits a stop token. Its turn is parsed, the policy's `onProduced` sees a tool call, and a **dispatch request** is booked. The Agent's status becomes `awaiting_tool`. Next tick, the executor dispatches the call. Which fiber runs it depends on one declaration on the tool.

::: callout Inline tools, fan-out tools, and permits
An **inline tool** runs on the loop fiber, and its result is interpreted immediately. Any tool that decodes on the main context must be inline, because the cache has one writer.

A **fan-out tool** declares `fanout: true` and runs on a child fiber spawned under the pool. The child runs only the tool's `execute`; while it runs, its Agent waits and every other Agent keeps sampling. Its **completion**, a returned value or a thrown error, is handed back and interpreted on the loop fiber at the next observe. A halted child hands back nothing.

A **permit** is a counting gate on fan-out children: at most `maxConcurrentTools` run at once, eight by default. A child acquires a permit before `execute` and releases it in an `ensure`, whatever way it ends. A child waiting for a permit is queued first come, first served; a halt while queued removes it from the queue.
:::

::: owns
A fan-out child is `spawn`ed under the pool's scope, so it can never outlive the pool, and its cleanup is written once with `ensure`: release the permit, clear the in-flight mark. The permit itself is an `action`: a child queued for one suspends until a release resolves it, and a halt while queued runs the action's cleanup and leaves the queue. Nothing here is a Promise the loop forgot. Frontside's [Spawn](https://frontside.com/effection/guides/v4/spawn/) and [Actions](https://frontside.com/effection/guides/v4/actions/) guides cover the two primitives; [Structured concurrency](/structured-concurrency#marking-a-native-tool-as-off-loop) says why a tool that touches the model may never be fan-out, and [Tools](/tools) is where `fanout` is declared.
:::

Web search is a fan-out tool. The call goes to a child, the Agent waits, the other two keep sampling. Four seconds later the child completes and the loop's next observe takes the completion in. The **frame** interprets it: a returned value becomes a **pending item**, the result tokenized on the token rail or measured on the embedding rail, each item knowing its cost in cells; a transient failure becomes a **parked retry** with a wall-clock time it comes due; a hard failure is settled in the tool's place. The runner records; it does not interpret.

## 5. A result lands {#a-result-lands}

The search result is a pending item of about 1,200 cells. Whether it enters the cache this tick is admission's decision, and admission is a ledger.

::: callout The ledger, headroom, and the soft line
**Admission** is one pass over the pending record each tick, in a fixed order: cancels, spawns, spine extensions, then items in arrival order. First come, first served.

**Headroom** is the cells above the **soft line**: `remaining − softLimit`. The soft line is the policy's number, 8,192 in this harness, held back for downstream work on the same spine. A working turn's item, a result or a nudge, is admitted only if its cells fit the headroom; a spawn only if its suffix does.

The **ledger** charges each admission as it goes, and the post-admission pressure every later decision reads is derived from the ledger by arithmetic, not by sampling the cache again. The ledger only spends. Cells a prune frees appear in the next tick's sample, never as a refund inside the pass.
:::

Headroom is 20,000 cells. The item is admitted, prefilled in the execute step, and the Agent is re-activated with its tool-call grammar. It samples again from the next tick, now with the result in its context. This is the rhythm of research: a turn, a call, a wait, a result, a turn.

## 6. The cache fills {#the-cache-fills}

Three Agents fetching pages fill a cache fast. Each page costs one to two and a half thousand cells, and by ninety seconds the three have used twelve thousand. Now the lines matter.

[![Remaining cells partitioned by the soft line, the hard line and the floor; a report's room is everything above the floor.](/assets/scheduler-lines.svg)](/assets/scheduler-lines.svg)

::: callout The three lines
The **pressure value** freezes one sample into a few numbers, and three lines partition the remaining cells. Two belong to the policy and govern working turns; one belongs to the context and governs reports.

| Line | Meaning | Set by |
| --- | --- | --- |
| soft line | below it, new results are deferred and the policy nudges the Agent to wrap up | the policy's `softLimit` |
| hard line | below it, a working turn must not sample again: it is dropped, and recovers | the policy's `hardLimit` |
| floor | the decode workspace the next batch needs; nothing writes below it | the context's batch size |

`headroom = remaining − softLimit`. `critical = remaining < hardLimit`. `room = remaining − floor`. A **working turn** is any turn that is not a recovery report, and it lives above the first two lines. A **report** is sized, admitted and finished against the third, which is why the hard reserve is the report's to write into. The pool checks at startup that the hard line sits at or above the floor. How a harness chooses the two policy lines is the subject of [Adaptive compute](/agent-policy-and-context-pressure); the scheduler only enforces them.
:::

At 150 seconds the trace reads: remaining 8,132, soft line 8,192, headroom −60. All three Agents have just made one more call, nudged by the policy's time budget to wrap up with one last search, and all three results have landed at about 2,000 cells each. None fits. All three are **deferred**: carried in the pending record for a later tick.

## 7. Nothing can move {#nothing-can-move}

Deferred work is carried as long as something else can free room or make progress. The scheduler decides that with one predicate.

::: callout `progress` and the stall-break
**`progress`** is true if, in this tick, any of these holds: a prefill or spawn was admitted, a branch is a childless leaf the next observe will reclaim, any Agent is in the decode set, a dispatch is going out, a tool call is in flight, a parked retry will come due, or a drop or finish has already been decided. Each is a lane that advances on its own or is bounded to this schedule.

The **stall-break** is what the scheduler does when deferred items exist and `progress` is false. The pool is stalled: nothing is running, nothing is coming, and the deferred items would wait forever. So each one is decided now. The tool, then the policy, then the frame is asked what to do with it. The usual answer is a **nudge**: an error in the result's place, telling the Agent to report with what it has. The nudge is built as a replacement item and used only if it fits the headroom the stall has left. If it does not fit, or the answer was to drop, the Agent is dropped with the reason `pressure_settle_reject`, and its recovery is decided in the same breath.

Every stalled item is decided in the tick the stall is detected. There is no trailing stop on this path.
:::

At 174 seconds every term of `progress` is false: all three Agents are awaiting, nothing is in flight, nothing has been admitted. The stall-break runs. The policy answers nudge for each; each nudge is bigger than −60 cells of headroom; all three Agents are dropped in one tick with `pressure_settle_reject`. The trace shows the three `pool:agentDrop` records within eight milliseconds of each other.

This is the moment the next word exists for.

## 8. Recovery {#recovery}

A drop ends an Agent's span, but not its obligation to report. Every drop carries a **recovery**, decided at the drop.

::: callout Drops and recoveries
A **drop** is the decision to stop an Agent. It names a reason (`pressure_critical`, `pressure_settle_reject`, `policy_exit`, `terminal_cap`, `wind_down`, `maxTurns`, `pressure_softcut`, `user_cancel`; a stop on prose before any call names none) and carries the recovery. One drop per Agent per schedule: every step that could decide something consults the set of Agents already dropped in this schedule, and every drop goes through one `decide` call, so the list and the set cannot disagree.

A **recovery** is one of four:
- **salvage**: the Agent was mid-report when dropped; parse what it already emitted, no further decode;
- **extract**: prefill a **recovery prompt** and let a report decode in-loop under a budget;
- **skip**: the policy declined, because the Agent had not done enough to be worth asking; it fails cleanly with a diagnostic;
- **none**: a cancel; there is nothing to recover.

An extract runs in one of two **shapes**, chosen per pool by the policy's `recoveryShape`. **Serial** (`'staggered'`, the default) recovers one Agent at a time with no cap: the report owns the whole room, and the next waits for this one's prune. **Cohort** (`'parallel'`) recovers every reaped Agent together, bin-packed with its live siblings, each under a **share** of the room: `room / alive − overhead`, never less than a minimum of 128 tokens and never more than a ceiling of 2,048. Wind-down forces cohort. The share is the number the recovery prompt is told, as a word count, so the model can conclude on its own before the pool's stop.
:::

The recovery prompt is a pending item like any other, admitted at the cost of its prompt plus its whole share, against the room. On admission the Agent is re-activated with the **extracting** latch set and the report grammar alone, and it samples again. Its tokens are counted from that moment.

::: callout The finish
A recovering Agent is not dropped by the policy or by critical pressure. It is **finished**: when its counter reaches its share, or when the room is gone. Finishing parses whatever it wrote, salvaging a partial call if the stop fell inside one, sets the result, announces `agent:recovered`, and idles the Agent. Its branch is pruned at the next observe.
:::

Here the story has two endings, and the difference between them is why the next section exists. In the trace this walkthrough is taken from, the three shares were sized from the cells above the hard line, which at 8,132 remaining against a hard line of 6,144 was a few hundred cells to divide three ways: 342 tokens each. Three reports were cut mid-sentence with six thousand cells unused. Sized from the room, the same tick grants each report the ceiling, and the three reports fit with room to spare.

## 9. Why a value {#why-a-value}

It would be easier to decide as you go: sample an Agent, notice the cache is tight, drop it, move on. Most loops are written that way, and they are hard to reason about for a reason that has nothing to do with their size. The decision is spread across time and places. Whether an Agent is dropped depends on who was visited before it, on a cache that moved under it, on an event that arrived in the middle. Nobody can hold the rule in their head because there is no single place the rule is.

Separating the value from the process puts the rule in one place. `TickState` is a snapshot; it does not change while it is read. `Schedule` is a description of what will happen; it can be printed, compared, and held against the state that produced it. The pressure sample is taken once, and every later number in the tick is derived from it by arithmetic, so two decisions in one tick cannot disagree about how much cache there is. Time is explicit: a tick is an epoch, and nothing decided in one epoch reaches the next except as the pending record and the Agents' own state.

That is also why the story above could be told from a trace and replayed in a test. The `pool:tick` record carries the pressure the schedule read; hand the same state to `schedule()` and it returns the same drops with the same shares. A production run is a sequence of values, and a value can be examined after the fact. The two endings of section 8 were found that way, and the second one was proven that way before it ran.

## 10. The rest of the loop {#the-rest-of-the-loop}

The brief's remaining machinery, each piece defined once, in the order the loop meets it:

- **Verdicts.** After admission, every active Agent receives one verdict in roster order: a wind-down drop if the run is winding down and the Agent is neither recovering nor already emitting the terminal tool; an exit if the policy's `shouldExit` says so, where a policy returning `false` vetoes and one that abstains defers to critical pressure; a finish for a recovering Agent at its share or out of room; a **terminal cap** salvage for an Agent writing a voluntary report past the configured cap; otherwise decode. An Agent mid-terminal-call is salvaged rather than re-prompted: it was already writing its report.
- **Retries.** A parked retry whose wall-clock time has come is re-dispatched. Under wind-down, the rest are **abandoned**: settled as honest failures so the drain can finish.
- **Spine extensions.** An orchestrator's `extendSpine` is a prefill onto the spine, admitted against headroom like everything else, because the spine is the one branch that cannot be pruned and replayed.
- **Wind-down.** A signal from the harness, a Stop or a wrap-up, that forces cohort recovery and drops every working Agent with `wind_down`.
- **Cancel.** A per-Agent signal. A cancel is decided always, even while paused; it halts the Agent's in-flight tool child and ends the span with no recovery.
- **Pause.** A hold, not a halt: a paused tick decides only cancels and carries everything else where it is. The run clock excludes paused spans, so time budgets are not charged for a hold.

::: owns
Wind-down, cancel and pause reach the loop as Effection signals subscribed once, before the loop starts, and read as values on the next tick: the loop never blocks on them. A cancel's halt of a tool child is `task.halt()`, which unwinds the child through its `ensure`s. Frontside's [Events](https://frontside.com/effection/guides/v4/events/) and [Collections](https://frontside.com/effection/guides/v4/collections/) guides cover signals and the streams they feed; [Thinking in Lloyal](/thinking-in-lloyal#exit-cleanly) is the pattern of exiting through the owner.
:::
- **Close.** The pool closes when the orchestrator is done, every Agent is idle or disposed, and nothing is pending or in flight. A drop decides its recovery at the drop, so an idle Agent is final; there is nothing left to sweep.

## 11. The shapes a run can take {#run-shapes}

The brief above took one shape: three Agents fetched pages, stalled together, were dropped in one tick and recovered under shares. A run can take many others, and a reader who cannot name the one in front of them concludes the machine is broken when it is doing exactly what this page describes. So this section names every shape. Each one is a transition the harness has to render. Most are announced on the bus a harness subscribes to; the few that are not, a nudge, a spawn waiting for room, a rerank, are named as such below, so the harness knows what it must infer. There are four families.

[![Every shape a run can take: a turn ends by its own stop token, a verdict or the stall-break; the drop's recovery is salvage, extract, skip or none; and each path lands on one of four transitions the harness renders.](/assets/scheduler-shapes.svg)](/assets/scheduler-shapes.svg)

::: callout The four transitions
- **Stopped, and kept what it wrote.** The Agent's own text is its result. The bus says `agent:return`, or `agent:done` followed at once by `agent:recovered`.
- **Stopped, and now writing up.** The span ended and a recovery report is being produced. The bus says `agent:done`, then a stream of `agent:produce`, then `agent:recovered` or `agent:failed`. When a drop ended the span, `agent:done` carries the drop's reason, so the harness can say why where the text is; a return carries none.
- **Could not finish.** The span ended with no result. The bus says `agent:failed` with a reason code.
- **Delayed, not stuck.** The work the reader is waiting for goes on. Usually the Agent is alive and will sample again; a spawn waiting for room has no Agent yet, and a heal ends one Agent so a replacement carries its task. The bus says `agent:tool_retry`, `run:paused`, or, for some delays, nothing at all.

A harness that renders those four, and names the one it is in, never surprises its reader. The paragraphs below say, for each shape, what in the loop triggers it, what the pool does, what it leaves on the trace and the bus, and what a reader watching the Agent sees.
:::

### Stopped, and kept what it wrote {#kept-what-it-wrote}

- **It returned.** The Agent called the terminal tool and emitted its stop token. The policy's `onProduced` answers `return`; the tool's `onReturn`, the harness's, then the frame's are asked whether the call may end the turn; any of them may reject, and otherwise the first accept stands. Accepted, the result is set and the Agent idles. The bus sees `agent:tool_call` naming the terminal tool, then `agent:return` carrying the result, then `agent:done`. The reader sees the report end on the Agent's own stop token and stand. A rejected return is a nudge instead: the reason goes into the cache in the call's place and the Agent writes again. The frame allows one rejection per Agent, and none once the Agent is out of turns or headroom, because a rejected return costs a turn the Agent must have left.
- **It reported past the cap.** A voluntary report may run to `recoveryBudget` tokens, the ceiling of 2,048 when the harness sets none. At the cap the verdict is a drop with reason `terminal_cap` and a **salvage**: nothing more decodes, and what it wrote is parsed as its result. The trace records `pool:agentDrop` and `pool:recoveryProduce` with the raw text; the bus sees `agent:done` and at once `agent:recovered`. The reader sees the report stop at a fixed length and stand.
- **It was killed mid-report at the hard line.** The critical-pressure verdict, on an Agent already emitting the terminal tool. The policy protects a voluntary report from `shouldExit` only while pressure is not critical; at critical, protection ends, and the drop's recovery is a salvage rather than an extract, because the Agent was already writing its report and a second prompt would ask it to write it again. The reason is `pressure_critical`; the bus sees `agent:done` and at once `agent:recovered`. The reader sees the report stop before its own end, and the kept text stand. This is the one shape where kept text can be shorter than streamed text; the callout at the end of this section says how.
- **Its recovery report ended.** The finish of section 8, reached three ways: the Agent emitted its own stop token, its counter reached its share, or the room is gone. The bus sees `agent:recovered`; the reader, who saw `agent:done` at the drop, sees the write-up end.

### Stopped, and now writing up {#writing-up}

Every shape here is a drop whose recovery is **extract**: a recovery prompt is admitted, the Agent is re-activated under the extracting latch, and a report decodes in-loop. A drop that finds the Agent already writing its report is a salvage instead, and belongs to the family above. The bus sees `agent:done` at the drop, `agent:produce` while the report streams, then `agent:recovered`. What differs is the trigger and the reason on the trace.

- **Out of time.** The policy's `shouldExit` answers true because the Agent's run clock passed the time hard limit, and pressure is not critical. The drop reason is `policy_exit`. The reader sees a working Agent stop mid-search and begin its write-up.
- **At the hard line, alone.** The post-admission pressure is critical and `shouldExit` abstains or agrees; the default policy also staggers this to one Agent per tick. The drop reason is `pressure_critical`. One Agent is sacrificed so that its siblings regain headroom when its branch is pruned. The reader sees one Agent stop while the others continue.
- **Together, at the stall.** Section 7: every deferred item decided in one tick, reason `pressure_settle_reject`, each recovery sized by a share of the room. The reader sees every Agent stop within milliseconds of each other and every write-up stream at once. There is no trailing stop on this path.
- **Wind-down.** The harness sent a wrap-up. The pool halts the orchestrator first, so no new spawn can land against a draining pool, then raises the signal. The next schedule forces cohort shape, drops every working Agent with reason `wind_down`, and abandons every parked retry as an honest failure the model reads. An Agent already writing its report, voluntary or recovery, is left to finish. The bus sees `run:windingDown`, then one `agent:done` per working Agent. The reader sees every Agent begin its write-up together.
- **Out of turns, or stopped without a call.** The policy's `onProduced` answers `idle` because the turn cap was reached, because the policy's soft cut fired, or because the Agent produced prose before any tool call where free text is not accepted as an answer. The drop reason is `maxTurns`, `pressure_softcut` or none, and the recovery is decided like any other. The reader sees a working Agent stop and begin its write-up, or fail, as the next family describes.

### Could not finish {#could-not-finish}

Every shape here ends on the bus with `agent:failed` and a reason code, except the last, a spawn that never became an Agent, which ends as a refusal to the orchestrator and no event at all. The text behind a code lives on the trace, never on the bus.

- **Too little to recover.** At a drop, the policy's `onRecovery` answers `skip`: by default an Agent with fewer than 100 tokens or two tool calls behind it is not worth a recovery prompt. The bus sees `agent:done`, then `agent:failed` with reason `recovery_skipped`. The reader sees an Agent stop and fail at once. One harness-visible example is the planner's own turn: a single Agent with no tools writes its plan as prose, stops, is dropped with no reason, and skips recovery, while the tool that ran it reads the raw output and succeeds. The harness sees done then failed on an Agent whose work stood.
- **No report in the write-up.** The recovery report ended and its parse found no terminal call, or a terminal call with an empty result. The trace records `pool:recoveryFailed` with the first 200 characters of what the model wrote; the bus sees `agent:failed` with reason `no_terminal_call` or `empty_terminal_result`.
- **A tool threw.** The completion was an error the frame does not retry. The Agent is discarded, its branch pruned: the trace records `tool:error` and `pool:settleFailed`, the bus `agent:failed` with reason `tool_error`. A result that could not enter the cache fails the same way with `tool_result_failed`, and a page or image whose prefill the engine refused with `media_prefill_failed`.
- **Cancelled.** The harness cancelled this Agent. Cancels are decided first in every schedule, paused or not; the in-flight tool child is halted, and the span ends with no recovery. The bus sees `agent:failed` with reason `user_cancel` and no `agent:done` before it, so a reader goes straight to cancelled with no write-up in between.
- **A spawn refused.** The orchestrator's `spawn` is carried while something can still free room, and refused once nothing can: the trace records `pool:spawnRefused` with reason `pressure_init` or `no_sequence`, and the orchestrator's call rejects. Nothing is emitted on the bus; the Agent never existed.
- **The cache ran out under a report.** A commit failed with the cache full while recovery reports were decoding. Each in-flight report is announced failed with a reason beginning `scope_error`, and the pool closes partial.

### Delayed, not stuck {#delayed}

The work the reader is waiting for goes on. In most of these the Agent is alive and will sample again. Two are different in kind: a waiting spawn has no Agent yet, and a heal ends one Agent so that a replacement carries its task from the same point. The reader needs to know only what is being waited on.

- **Nudged.** A call was refused by a gate, a result did not fit, or the policy wants the Agent to wrap up: an error in the call's place enters the cache and the Agent reads it next turn. The trace records `pool:agentNudge` with the message and the gate that decided; the bus sees nothing. The reader sees the Agent's next turn change course.
- **Rate-limited.** The tool threw a retryable error inside the frame's attempt budget. The call is parked with a wall-clock due time and re-dispatched when due, under the same call id, with no new `agent:tool_call`. The bus sees `agent:tool_retry` with `retryAfterMs`. A park outlasting the budget becomes a result the model reads, saying the tool is unavailable.
- **Waiting for a seat, a sequence or room.** A spawn beyond `capacity`, with no vacant sequence, or whose suffix does not fit the headroom is carried in request order. Nothing is emitted while it waits. The orchestrator's `spawn` is suspended until it is admitted or refused.
- **Reranking a landed result.** A result ranked on the main context before it is handed to its Agent shares the one context with the decode, so the loop's pulse drops for its length and every Agent's stream slows with it. The trace brackets it with `rerank:start` and `rerank:end`; the bus sees nothing.
- **Healed.** A page or image's prefill failed on the embedding rail in a way that poisons the branch. The original is discarded with `media_prefill_failed`. If this is its first poison and the backend is not suspect, the ladder records a lineage: the Agent's history up to its last completed transaction, with the poisoned turn's own text dropped so the replacement regenerates it. The loop forges a replacement spawn at the next observe, after the prune pass, because the replacement needs the sequence the original just gave back; it is priced whole, admitted by fit, and its lineage replayed onto a fresh fork. The trace records `pool:agentHeal` naming both; the bus sees `agent:failed` for the original, then `agent:spawn` for the replacement carrying the same `key`. The reader sees one Agent fail and a new one begin from the same point. A heal that cannot be forged or admitted stands down, and the original's failure stands alone.
- **Paused.** The harness paused the run. The loop holds at the tick boundary: no sample, no commit, no settle, no dispatch, cancels still decided. Branches stay resident. The run clock stops, so time budgets are not charged; retry parks stay on the wall clock. The bus sees `run:paused`, then `run:resumed` with the paused span.

::: callout Salvage
A **salvage** is the recovery chosen for an Agent that was already emitting the terminal call when it was dropped, at the cap or at the hard line. It is a parse, not a turn: no prompt is admitted, nothing more decodes. The Agent's raw report turn is parsed as the voluntary path would parse it, the terminal call's `result` is read, and from a call cut mid-argument the partial string is read instead.

The kept text is a prefix of the streamed text, and it can be a shorter prefix in two ways. A call cut inside its arguments yields only what the argument held, and a model reaped mid-sentence often restarts the envelope, closing its reasoning and opening a fresh call inside the string it was writing; the fresh, unclosed call is stripped whole, with the close before it, so the fragment never rides into another Agent's prompt as a demonstration. The trace carries the raw text on `pool:recoveryProduce`, so a kept result shorter than its stream is reproducible after the fact.

Why a report reaches the hard line at all: a recovery report is admitted at the cost of its prompt plus its whole share, against the room, so the cells it will write are reserved. A voluntary report reserves nothing; it is a working turn until its stop token, and it lives above the hard line like any other. A harness that wants voluntary reports never cut can set its hard line high enough that a report's length fits below it, or render the salvage honestly: the report was stopped, and this is what it had written.
:::

## 12. Where structured concurrency sits {#structured-concurrency}

The pool is an Effection resource, and every fiber above is inside it. That is what makes the loop safe to reason about.

- **The tick loop is one spawned task** under the pool's scope, and it is the only fiber that writes to the cache. Fan-out children are spawned under the same scope with an `ensure` that releases their permit and clears their in-flight mark, whatever way they end.
- **A cancel is a halt.** Cancelling an Agent with a tool in flight halts that child. The halt unwinds through `ensure`, not `catch`, so a halted child pushes no completion and the loop never sees a ghost result.
- **Nothing outlives the pool.** When the orchestrator errors or the harness stops, the scope ends: the loop, every child, every branch. When the orchestrator merely finishes, the pool closes only once every Agent is final and nothing is waiting, as the close rule in section 10 says. The pool's own `ensure` releases unadmitted spawns and prunes every Agent. There is no teardown code to forget because nothing lives outside the scope.
- **An Agent is not a Task.** It is a branch owned by the pool; the pool is the Task. Stopping an Agent is a drop with a recovery; stopping the pool is a halt of the scope. [Structured concurrency](/structured-concurrency#treating-an-agent-as-a-task) explains why that distinction holds and what goes wrong when it is ignored.

::: owns
Two mistakes the loop's shape is built to make impossible are described on the structured-concurrency page: a [detached background loop](/structured-concurrency#detached-background-loops), which the tick loop would be if it were not spawned inside the resource, and [converting an Operation to async](/structured-concurrency#converting-an-operation-to-async), which a fan-out child would do if it awaited its tool instead of `call`ing it. [Thinking in Lloyal](/thinking-in-lloyal#ensure-cleanup-belongs-to-the-owner) explains why every cleanup above is an `ensure` on the owner rather than a `finally` in the worker.
:::

## 13. The invariants {#invariants}

Everything above, as the rules the suite locks:

- One pressure sample per tick, taken after the previous tick's effects landed; every decision in the tick reads it or an arithmetic derivation of it.
- The ledger only spends; refunds arrive with the next sample.
- One drop per Agent per schedule, and a drop decides its recovery at the drop.
- A working turn never samples below the hard line; a report never writes below the floor; the hard line never sits below the floor.
- A recovering Agent is finished, never dropped; finishing salvages what it wrote.
- Every stalled item is decided in the tick the stall is detected.
- Fan-out completions are interpreted on the loop fiber, never on the child.
- The cache has one writer: the loop fiber.
- The pool closes only when every Agent is final and nothing is waiting or in flight.

## 14. Read it in a trace {#read-it-in-a-trace}

The trace names the phases, and because the decision was a value, the trace is enough to reproduce it. `pool:tick` carries the pressure the schedule read; `pool:agentDrop` carries the reason; `pool:agentNudge` records a nudge whether or not it fit; `pool:recoveryProduce` and `pool:recoveryReturn` carry a report's token count and length; `branch:prefill` carries the cells an admission cost; `tool:dispatch`, `tool:result` and `tool:retry` bracket each call. Line those up against the tick rate and the pressure curve and a run reads like a kernel log. [Debug with traces](/traces) shows the tooling.

## The words, in the order you met them {#the-words}

| Word | Meaning |
| --- | --- |
| cell | one slot in the cache: the state of one token the model has seen |
| cache | the fixed set of cells a context was created with |
| branch | one line of work in the cache, forked from a parent, sharing its prefix |
| sequence | a slot a branch occupies; the context has a fixed number |
| spine | the branch holding the prefix every Agent forks from |
| Agent | a branch with a status, a history and a policy watching it |
| spawn | a priced request for an Agent: suffix cells, a sequence, a seat |
| seat | one of `capacity` places for a live Agent |
| tick | one turn of the loop: observe, schedule, apply, execute, apply |
| `TickState` | everything the scheduler may read, built once per tick |
| `Schedule` | everything the tick does, as fields the executor runs in order |
| pending record | items, retries, dispatches, spawns and extensions carried between ticks |
| status | active, awaiting_tool, idle, disposed; and the extracting latch |
| inline tool | a tool run on the loop fiber, interpreted immediately |
| fan-out tool | a tool run on a child fiber under a permit, interpreted at the next observe |
| permit | the counting gate on concurrent fan-out children |
| completion | how a tool call ended: a value or an error, handed back to the loop |
| pending item | a result, a nudge or a recovery prompt waiting to enter the cache, with its cost in cells |
| admission | the ledger pass that lets pending work into the cache |
| headroom | cells above the soft line; what working turns are admitted against |
| soft line | the policy's nudge and deferral line for working turns |
| hard line | the policy's kill line for working turns |
| floor | the decode workspace the next batch needs; the context's physical line |
| room | cells above the floor; what reports are sized, admitted and finished against |
| working turn | any turn that is not a recovery report |
| `progress` | the predicate that says this tick can still free room or move |
| stall-break | deciding every deferred item in a tick where `progress` is false |
| nudge | an error in a result's place telling the Agent to report with what it has |
| drop | the decision to stop an Agent, with a reason and a recovery |
| recovery | how a dropped Agent reports: salvage, extract, skip or none |
| shape | serial or cohort: one report at a time, or all together under shares |
| share | a cohort report's budget: `room / alive − overhead`, between a minimum and a ceiling |
| extracting | the latch that says an Agent is writing its recovery report |
| finish | ending a recovery at its share or when room is gone, salvaging what it wrote |
| wind-down | the harness signal that drops every working Agent into cohort recovery |
| salvage | the recovery for an Agent already emitting its report: a parse, no prompt, no decode |
| extract | the recovery that admits a recovery prompt and decodes a report in-loop |
| skip | the recovery the policy declines; the Agent fails with `recovery_skipped` |
| terminal cap | the token ceiling on a voluntary report, `recoveryBudget` or 2,048; reached, it is salvaged |
| park | a retryable tool failure held until its wall-clock due time, then re-dispatched |
| lineage | an Agent's history up to its last completed transaction, priced and replayed onto a fresh fork |
| heal | a replacement spawn wearing a lineage, forged once after a poisoning media prefill |
| hold | a paused tick: cancels decided, nothing else moves, the run clock stopped |
| the four transitions | kept what it wrote; writing up; could not finish; delayed, not stuck |

## Related {#related}

- [Adaptive compute](/agent-policy-and-context-pressure): the policy side of the same machine, the lines, and what an Agent should do at each.
- [Continuous Context](/continuous-context): why one cache, forks and prunes are the right primitive for many Agents.
- [Structured concurrency](/structured-concurrency): the ownership model the pool lives inside.
- [Agents and orchestration](/agents): the shapes that drive the pool from above.
