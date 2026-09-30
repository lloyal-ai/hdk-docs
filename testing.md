---
title: "Testing"
description: "Test the real harness — its command loop, its agents, what it keeps on disk — over a scripted model with no weights, in milliseconds, and know what that proves and what only a real run can."
lede: "Run the real program over a scripted model: no weights, no network, milliseconds per scenario."
---

<!--
Checked against source and a real scaffold, 2026-09-30:
  lloyal-sdk  packages/rig/src/testing.ts   runHarness: real harness over MockSessionContext; utterances (text | report | tool);
                                            script steps (send | on | until); rig sends quit after the last step; 30s watchdog
  lloyal      templates/basic/test/invariants/  harness.ts (the app's binding), durability.scenario.test.ts, the others
  The example below was added to a 1.13.0 basic scaffold and run: ✔ in 24 ms.
-->

Every scaffold ships behaviour tests in `test/invariants/`, and `npm test` runs them in about a second. They drive your **real** harness — the command loop, the agents, the prompts, what is written to disk — and only the model is scripted. Nothing is downloaded and nothing touches the network.

```sh label="Terminal"
npm test
```

## When to use what {#when-to-use}

| To prove | Use |
|---|---|
| The program does what it promises: a question is answered, a stop ends the turn, an article is kept | A **scenario** over the scripted model (this page) |
| The view folds events correctly | A plain unit test of `src/ui/state.ts` — the scaffold ships these too |
| What the model will actually do | A **real run**: `LLOYAL_DEV=1 node bin/run.js --query "…"`, then [read the trace](/traces) |

A scenario proves the wiring and the laws; it cannot prove what the model will say.

## Write a scenario {#write-a-scenario}

```ts label="test/invariants/answer.scenario.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { runHarness, answerOf } from "./harness.js";

// Two angles report, then the settling agent writes the article.
const UTTERANCES = [
  { kind: "report" as const, text: "Tardigrades survive near-total dehydration." },
  { kind: "report" as const, text: "They were first described in 1773." },
  { kind: "text" as const, text: "## Tardigrades\n\nMicroscopic animals famous for surviving extremes." },
];

test("a question is answered with the article the settling agent wrote", async () => {
  const run = await runHarness({
    utterances: UTTERANCES,
    script: [
      { send: { type: "submit_query", query: "What is a tardigrade?" } },
      // Wait for the shelf, not the answer: keeping the article is the last thing a turn does.
      { on: (ev) => ev.type === "library" && ev.articles.length === 1 },
    ],
  });
  assert.match(answerOf(run.events), /surviving extremes/);
});
```

Two lists drive it:

- **`utterances`** — what the model says. Each agent that samples for the first time takes the next one, in a deterministic order.
- **`script`** — what the reader does, walked by the events on the wire. When the last step resolves, the rig sends `quit` and hands back everything that happened.

`./harness.js` is the scaffold's own binding of rig's `runHarness` to its `Command` and `WorkflowEvent` types; you rarely change it.

## Script the model {#utterances}

| Utterance | The agent… |
|---|---|
| `{ kind: "report", text, sources? }` | Calls its terminal tool — the voluntary end of its turn |
| `{ kind: "text", text }` | Emits free text: prose, or the JSON a grammar-constrained agent produces |
| `{ kind: "tool", tool: { name, args }, then }` | Calls a tool; after the real result is placed in its context, its next turn is `then` |

Any utterance can carry `stallTokens: n` — filler before the answer, so a scenario can act **during** a live run (press Stop, open another article) without timers. `then` may be a function, asked when that turn begins, so a scenario can decide from what the wire has said.

## Script the reader {#script}

| Step | Does |
|---|---|
| `{ send: command }` | Sends a command now. A function is resolved when it fires — for an id only the wire revealed. |
| `{ on: (ev) => boolean, send? }` | Waits for an event, then optionally sends |
| `{ until, repoke, poke, send? }` | Polls for state that has no event of its own, by sending commands whose echoes reveal it |

## What a run gives back {#what-you-get}

| Field | What it holds |
|---|---|
| `events` | Every event on the wire, in order |
| `outputDir` | A fresh temporary folder the harness wrote into — assert on files |
| `trace` | Every trace event the engine wrote: commits to the trunk, branches pruned — the memory rules as data |
| `halted`, `failure` | Whether the scenario halted the run, and what it failed with, if it did |

A scenario that never reaches its last step fails after 30 seconds rather than hanging. That is the timeout you see when the program asks the model more often than the script answers — see [The tests notice](/build-your-first-harness#the-tests-notice).

## Scenarios that ship {#scenarios-that-ship}

The basic template's `test/invariants/` is the best reference: a turn, a follow-up, a stop mid-run and the next question, quitting mid-run, an unknown command, a turn that finds nothing, the evidence floor refusing an early report, keeping to disk and reading back. Each file names the one behaviour it pins.

## Related {#related}

- [Debug with traces](/traces) — what a real run did.
- [Build your first harness](/build-your-first-harness) — the tests noticing a change.
