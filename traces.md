---
title: "Debug with traces"
description: "Turn on the trace and the dev pane, read what every agent saw and did — the exact prompt, each tool call, every refusal and recovery — and go from a symptom to the event that explains it."
lede: "See exactly what every agent was shown, what it called, and why it stopped — from a live pane, or from the file afterwards."
---

<!--
Checked against source and a real run, 2026-09-30:
  lloyal-sdk  packages/rig/src/trace-sink.ts   useTraceWriter: LLOYAL_DEV=1 only; trace-<iso>-<id>.jsonl in sources.outputDir;
                                               every write mirrored live as agent:trace; failure to open never stops the run
  lloyal-sdk  packages/rig/src/boot.ts         dev = process.env.LLOYAL_DEV === '1'
  lloyal-sdk  packages/agents/src/trace-types.ts  the event union (listed below)
  lloyal      templates/*/package.json         dev:desktop and dev:web set LLOYAL_DEV=1; start does not
  Real run: basic scaffold, `LLOYAL_DEV=1 node bin/run.js --query "What is a tardigrade?"` →
            trace-2026-09-30T06-12-32-590Z-13b83aa4.jsonl; the jq recipes below were run against it.
-->

Every harness can record a **trace**: one JSON line per thing that happened — each prompt as the model saw it, each turn, each tool call and result, every nudge, drop and recovery, every branch created and pruned. The same events feed a live **dev pane** while the run is going.

## Turn it on {#turn-it-on}

Tracing is on when `LLOYAL_DEV=1`, and off — at zero cost — otherwise.

| You run | Tracing |
|---|---|
| `npm run dev:desktop`, `npm run dev:web` | On: the scripts set `LLOYAL_DEV=1` |
| `npm start` | Off — run `LLOYAL_DEV=1 npm start` |
| `node bin/run.js --query "…"` | Off — prefix `LLOYAL_DEV=1` |

A trace file is written per session to `sources.outputDir` — the project folder for the basic template, `reports/` for research — named `trace-<time>-<id>.jsonl`. If it cannot be opened, the run goes on without it: tracing is observability, never a dependency.

## The dev pane {#dev-pane}

With `LLOYAL_DEV=1`, the desktop and web surfaces mount the developer's pane beside your app:

- **Timeline** — every agent's lane on the one shared context, with what it is doing now. A lane can be cancelled.
- **Sources** — what each retrieval admitted, rejected and re-ranked, and why.
- **Settings** — every configured key, its value and which layer it came from; a save applies live.
- **Wrap up** — ends the run with what the agents have.

It reads the same events as the file, as they are written, so it shows exactly what the file will contain.

## Read the file {#read-the-file}

Each line is one event with a `type`, a `traceId`, the `parentTraceId` it belongs under, a timestamp, and — for anything an agent did — its `agentId`. [jq](https://jqlang.org) is the quickest way in:

```sh label="Terminal"
# What happened, by kind
jq -r '.type' trace-*.jsonl | sort | uniq -c | sort -rn

# Every tool call: who called what, with which arguments
jq -c 'select(.type=="tool:dispatch") | {agentId, tool, args}' trace-*.jsonl

# The exact prompt an agent was given
jq -r 'select(.type=="prompt:format" and .agentId==3) | .promptText' trace-*.jsonl

# Every refusal and nudge, with the words the model read
jq -c 'select(.type=="pool:agentNudge") | {agentId, tool, guard, message}' trace-*.jsonl
```

From the run behind this page, the last one shows a guard and the budget at work:

```json label="pool:agentNudge"
{"agentId":4,"tool":"wikipedia_fetch","guard":"title_dedup","message":"This article was already fetched in this run. Try a different title."}
{"agentId":4,"tool":"wikipedia_search","message":"Turn limit reached — report your findings now within 1200 words."}
```

## Start from the symptom {#start-from-the-symptom}

| Symptom | Look at | What it tells you |
|---|---|---|
| Agents do not use their tools | `tool:dispatch` | Whether anything was dispatched at all — then `prompt:format` to see whether the tools were in the prompt |
| An agent reports too soon | `agent:turn` | What the model actually emitted, turn by turn |
| An agent stops before it finishes | `pool:agentDrop` | The drop reason — pressure, time, turns — and who decided |
| A stopped agent's report is empty | `pool:recoveryProduce`, `pool:recoveryReturn`, `pool:recoveryFailed` | Every recovery attempt ends in exactly one of these |
| A call was refused | `pool:agentNudge` (a guard's `name`), `tool:authReject` (a protected tool) | Which rule refused it, and the message the model read |
| A tool is slow, or seems hung | `tool:retry`, `tool:result` | A parked retry is waiting, not hung; `tool:result` has the duration |
| The answer ignores the research | `spine:extend` | Whether the findings reached the spine the next step forked from |
| A bad plan or sub-question | `prompt:format` | The prompt the planner saw |
| Retrieval admitted the wrong passages | `rerank:start`, `rerank:end`, `entailment:content:exploit` | The whole funnel: candidates, scores, what was admitted |

## Every event {#every-event}

| Family | Events |
|---|---|
| Scopes | `scope:open`, `scope:close` |
| Prompts | `prompt:format` — the exact text the model saw |
| Branches | `branch:create`, `branch:prefill`, `branch:prune` |
| The pool | `pool:open`, `pool:close`, `pool:tick`, `pool:pause`, `pool:resume`, `pool:windDown`, `pool:spawnRefused` |
| Agents | `agent:spawn`, `agent:turn`, `agent:done`, `pool:agentNudge`, `pool:agentDrop`, `pool:agentDefer`, `pool:agentHeal` |
| Recovery | `pool:recoveryProduce`, `pool:recoveryReturn`, `pool:recoveryFailed`, `pool:settleFailed` |
| The spine | `spine:extend` |
| Tools | `tool:dispatch`, `tool:result`, `tool:error`, `tool:retry`, `tool:settle_order`, `tool:authReject` |
| Retrieval | `rerank:start`, `rerank:end`, `entailment:search`, `entailment:search:reordered`, `entailment:delegate`, `entailment:delegate:echo`, `entailment:content:exploit` |

The full shapes are the `TraceEvent` union in `@lloyal-labs/lloyal-agents`. A tool of your own can write to the same trace — see [Tools](/tools#trace-events).

## A real run proves what a test cannot {#real-run}

`npm test` runs the program over a scripted model: it proves the wiring, the rules and the prompts' shape, but not what the model will do. `LLOYAL_DEV=1 node bin/run.js --query "…"` is a real run on the resident model, and its trace is the thing to read before explaining a behaviour. After changing engine code, restart the `dev:*` command before judging: the engine is bundled once when it starts.

## Related {#related}

- [Troubleshooting](/troubleshooting) — the errors you will see, and what they mean.
- [Testing](/testing) — the scripted model.
