---
title: "Tools"
description: "A tool is a class with a name, a description, a JSON schema and an execute generator. What the model sees of it, what it can read about the agent calling it, what it may return, and the one flag that decides whether it runs beside other agents."
lede: "Give agents an action: a class with a name, a schema and an execute — and, unlike an endpoint tool, the agent's live state within reach."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/agents/src/Tool.ts      Tool (name, description, parameters, protected, fanout, hooks, execute),
                                               ToolRetryError, TOOL_ATTACHMENTS_KEY, TOOL_CONTEXT_KEY, TOOL_IMAGE_ERROR_KEY
  lloyal-sdk  packages/agents/src/types.ts     ToolContext (onProgress, scorer, explore, pressurePercentAvailable, attachments)
  lloyal-sdk  packages/agents/src/context.ts   CallingAgent, Trace
  lloyal-sdk  packages/agents/src/trace-types.ts  TraceEvent is a closed union; scope:open carries name + meta
  lloyal-sdk  packages/agents/src/Agent.ts     attendedResults
  lloyal      templates/basic/README.md        "A tool that lives in your harness" (GlossaryTool)
-->

A tool is an action an agent can take. You write it as a class; the model sees only its name, description and parameter schema, and the pool runs its `execute` when the model calls it. The result goes back into **that agent's** context, and it carries on from there.

## When to use a tool {#when-to-use}

| You want | Use |
|---|---|
| An action or a lookup specific to this app — a glossary, your own database, an internal API | A **tool in your harness** (this page) |
| A capability other harnesses can install, with its own instructions and settings, signed | An [Ability](/abilities), which ships tools |
| A second model — a judge, a classifier, vision | A [service](/services) — a tool can then read it |
| A structured final answer from an agent | A **terminal** tool — see [Typed Decisions from LLMs](/typed-decisions) |

## Quickstart {#quickstart}

```ts label="src/harness/glossary.ts"
import { Tool } from "@lloyal-labs/lloyal-agents";
import type { JsonSchema } from "@lloyal-labs/lloyal-agents";
import type { Operation } from "effection";

export class GlossaryTool extends Tool<{ term: string }> {
  readonly name = "glossary";
  readonly description = "What this organisation means by a term of art.";
  readonly parameters: JsonSchema = {
    type: "object",
    properties: { term: { type: "string", description: "The term, as written" } },
    required: ["term"],
  };
  constructor(private readonly glossary: Record<string, string>) { super(); }

  *execute(args: { term: string }): Operation<unknown> {
    return this.glossary[args.term.toLowerCase()] ?? { error: `no entry for "${args.term}"` };
  }
}
```

Add it to the `tools` the pool is given, beside the abilities' tools:

```ts label="src/harness/wiki.ts"
const tools = [...abilities.flatMap((a) => [...a.tools]), new GlossaryTool(GLOSSARY), citedReport.tool];
```

The tools are written into the shared spine once, so every agent that forks from it can call them, and none pays to read them again.

## The contract {#the-contract}

| Member | What it is |
|---|---|
| `name`, `description`, `parameters` | What the model reasons over when it chooses a call — rendered into its context word for word. Write them with care: they are prompts. |
| `*execute(args, context?)` | An Effection generator. Its return value is serialised to JSON and placed in the calling agent's context as the result. |
| `protected` | Open by default. `true` marks a consequential action: it is refused unless the session holds a grant. See [Human approval](/human-approval). |
| `fanout` | Inline by default. `true` lets it run beside other agents' work — see below. |
| `hooks` | What this tool says about the life of its own calls: its guards, its view of a completion or a result. See [Tool hooks and guards](/tool-hooks). |

## Return a result {#return-a-result}

- **Return a value.** Whatever you return is what the model reads.
- **A domain failure is a result, not an exception.** Return `{ error: "…and what to do instead" }` and the agent changes course in one turn. Throw only when the run genuinely cannot continue.
- **A temporary failure** — a rate limit — is `throw new ToolRetryError(message, retryAfterMs)`: the agent waits at no cost and the call runs again. See [Retry a transient failure](/tool-hooks#retry).
- **Images** go under the `_attachments` key as bytes. They are taken out before the result is serialised and reach the model as images, never as JSON digits; if this model cannot see, the framework says so in the result.
- The framework adds `_contextAvailablePercent` to every result, so the model knows how much room it has.

## Read what the runtime knows {#tool-context}

The second argument of `execute` carries what the pool knows at the moment of the call:

| Field | What it carries |
|---|---|
| `onProgress({ filled, total })` | Live progress, shown on the surfaces as the tool works |
| `explore`, `scorer` | Whether the policy wants this call to explore or exploit, and the scorer to act on it — see [Retrieval](/retrieval) |
| `pressurePercentAvailable` | How much of the context was free when the call was dispatched |
| `attachments` | The files available to the run: what the host staged, and every one a tool result has admitted so far |

**Who is calling** is ambient, not a field. Inside `execute`, `yield* CallingAgent.get()` is the calling agent — its branch to fork from, and `attendedResults(toolName)`, the arguments of this tool's earlier calls whose results that agent actually read, its own and its ancestors'. That is how a reader tool never serves the same page twice to one agent: it asks what the branch already holds.

```ts label="TypeScript"
import { CallingAgent } from "@lloyal-labs/lloyal-agents";

*execute(args: { url: string }): Operation<unknown> {
  const agent = yield* CallingAgent.get();
  const seen = agent?.attendedResults(this.name).some((a) => a.url === args.url);
  if (seen) return { note: "You have already read this page." };
  // …
}
```

A tool may also start agents of its own — `withSpine`, `agentPool` or `useAgent` inside `execute` — forking from the caller's branch, so every agent it starts inherits what the caller already knows. The results return to the caller as this tool's result.

## Run beside other agents: `fanout` {#fanout}

By default the pool runs `execute` itself, on its one loop, and waits for it. That is safe for any tool.

Set `readonly fanout = true` when `execute` never touches the shared model — only network I/O, pure computation, or a *separate* model such as the reranker — and the pool runs it concurrently, so one slow fetch never stalls the other agents.

::: owns
A wrong `fanout = true` is a crash; a wrong `false` is merely a pool that waits. Any tool that starts agents or samples on the calling agent's branch — `withSpine`, `agentPool`, `useAgent`, a delegate — **must** stay inline, because two generations on one model at once crash the process. Leave `fanout` unset unless you can say what the tool touches.
:::

## Record what happened {#trace-events}

Write trace events through the ambient writer. One write feeds three places: the trace file, the calling agent's lineage (stamped for you), and — with `LLOYAL_DEV=1` — the dev pane, live.

```ts label="TypeScript"
import { Trace } from "@lloyal-labs/lloyal-agents";

const tw = yield* Trace.expect();
tw.write({ traceId: tw.nextId(), parentTraceId: null, ts: performance.now(), type: "scope:open", name: "glossary", meta: { term: args.term } });
```

The event types are a closed set, listed in `trace-types.ts`; for something of your own, `scope:open` with a `name` and a `meta` object carries it. The pool stamps the calling agent onto every event written while the tool runs, so you never pass it. In production the writer is a no-op. See [Debug with traces](/traces).

## Related {#related}

- [Tool hooks and guards](/tool-hooks) — refuse, retry, shrink or follow up on a call.
- [Abilities](/abilities) — package tools with instructions and settings for any harness.
