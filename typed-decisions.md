---
title: "Typed Decisions from LLMs"
description: "Get a typed value back from the resident model — a number, an enum, an object — constrained by grammar so there is nothing to parse, and classify many items against one option list at the cost of one."
lede: "Make the model answer in exactly the shape you asked for: a number in range, one of a list, an object — nothing to parse, nothing else it can say."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/rig/src/tools/output.ts        defineOutput (tool, read, schema; capture overload), citedReport
  lloyal-sdk  packages/agents/src/create-agent-pool.ts schema (eager grammar), acceptFreeText, enableThinking note
  lloyal-sdk  packages/agents/src/use-agent.ts         agent(opts) — single scoped agent
  lloyal      templates/basic/src/harness/classify.ts  nameTopics (terminal output), fileUnder (schema pool)
  lloyal      templates/basic/README.md                "Classify anything with the resident model"
-->

A typed output is a zod schema turned into a grammar. The model decodes under that grammar, so it **cannot** produce anything but the shape — there is no JSON to repair, no "the model said something else", and `read` hands you the typed value or `null`, never a guess.

There are two ways to use one, and the basic template's `classify.ts` uses both.

## When to use which {#when-to-use}

| You want | Use |
|---|---|
| An agent that works — searches, reads — and then **finishes** with a typed result | A **terminal** output: `terminal: output.tool` |
| The model's answer **to be** the value, with nothing before it — a label, a number, a choice | A **constrained** agent or pool: `schema: output.schema` |
| Findings with their citations woven in | `citedReport`, the terminal the templates' research agents end on |

## Quickstart: classify {#quickstart}

File every item under one of a list of topics, by number:

```ts label="src/harness/classify.ts"
import { agentPool, parallel } from "@lloyal-labs/lloyal-agents";
import { defineOutput } from "@lloyal-labs/rig";
import { z } from "zod";

const pick = defineOutput("topic", z.number().int().min(0).max(topics.length));

const pool = yield* agentPool({
  systemPrompt: render("topic.system", { topics }),   // the list, by number, on the shared spine
  schema: pick.schema,          // the grammar: the answer IS a number in range
  enableThinking: false,        // nothing reasons before it
  acceptFreeText: true,         // the answer is prose-shaped: keep it as the result
  orchestrate: parallel(items.map((item) => ({ systemPrompt: "", content: render("topic.user", { item }) }))),
});

const picks = pool.outcomes.map((outcome) => pick.read(outcome));   // number | null, one per item
```

Every item's agent forks from **one** spine that holds the option list, so the list is paid for once however many items there are, and they decode together. To classify something else, change three things: the options, the schema (`z.enum(["urgent", "routine", "refer"])` reads as well as a number), and what each agent is shown.

::: owns
`schema` constrains what is generated and nothing more. Whether the answer is kept is `acceptFreeText`'s decision, and whether the agent reasons first is `enableThinking`'s. With `enableThinking: false` the grammar admits the value alone; leave thinking on and the model reasons, then answers in shape.
:::

## Finish a working agent with a typed result {#terminal-output}

When the agent must use tools first, give the output as its **terminal** — the tool that ends its turn:

```ts label="src/harness/classify.ts"
import { agent } from "@lloyal-labs/lloyal-agents";

const named = defineOutput("topics", z.object({ topics: z.array(z.string()) }));

const namer = yield* agent({
  ...prompt("topics", { articles: listings, tool: named.tool.name }),
  terminal: named.tool,
  enableThinking: false,
});

const topics = named.read(namer)?.topics ?? [];
```

The output's schema is the terminal tool's parameters, so the model can only call it with the shape. A call that misses it — a field absent, the wrong type — is refused once, and the model reads which field was wrong and calls again. `agent(...)` is a single agent in its own scope; `useAgent(...)` is the same thing held open, so later work can fork from it.

A terminal output is **not** a tool to add to `tools`: calling it ends the turn, and a pool that dispatches it instead is told so.

## Cited findings {#cited-report}

`citedReport` is the same primitive with a capture: its schema is `{ result, sources: [{ title, url }] }`, forced by the grammar, and at capture the sources are woven into the findings as inline citations. `citedReport.read(outcome)` returns the finished text. It is the one citation mechanism — don't add a second.

```ts label="src/harness/wiki.ts"
import { citedReport } from "@lloyal-labs/rig";

const pool = yield* agentPool({ tools, parent: spine, terminal: citedReport.tool, budget, orchestrate });
const found = ANGLES.map((_, i) => {
  const o = pool.byKey(taskKey(i));
  return o ? citedReport.read(o) ?? "" : "";
});
```

## Make your own capture {#capture}

Pass a `capture` to turn the validated value into the text the agent's result becomes. `read` then returns that text:

```ts label="TypeScript"
const verdict = defineOutput(
  "verdict",
  z.object({ decision: z.enum(["approve", "reject"]), reason: z.string() }),
  { capture: ({ decision, reason }) => `${decision.toUpperCase()}: ${reason}` },
);
```

A captured output has no `schema`, because its result is text, not the value — use it as a terminal only.

## Related {#related}

- [Tools](/tools) — the terminal tool is a tool like any other, with one job.
- [Agent policy](/agent-policy#accept-prose) — `acceptFreeText`.
