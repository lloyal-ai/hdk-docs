---
title: "Build your first harness"
description: "Use lloyal-ai to create an application, begin a Session, inspect its procedure, change its topology, and continue from accepted state."
lede: "Put the Lloyal programming model into practice with lloyal-ai"
---

Start at the front door: create a harness, begin a Session over a resident model, then change the TypeScript that governs how work unfolds and what state survives.

The guide follows the CLI and the running application in one progression. Programming-model callouts appear only when the corresponding idea becomes concrete.

::: pull
**Choose → start → change → continue.**
:::

The five key concepts from *Thinking in Lloyal* form the instructional spine, not the visible table of contents.

By the end, you will have changed Agent intent, orchestration topology, and the state later work inherits.

1.  Choose the application
2.  Begin a Session
3.  Find the procedure
4.  Change intent
5.  Change topology
6.  Continue from state

## 1\. Create the harness {#step-1-create-the-harness}

Start the interactive scaffold:

Requires Node 24 or newer.

```sh label="TERMINAL"
npx lloyal-ai new
```

The wizard defines the application boundary before it writes any code. Each choice below becomes an explicit part of the generated harness.

### Name the application {#name-the-application}

Type `hello-harness` and press Enter. The name becomes the project folder and npm package name.

<figure class="flow-shot"><img width="1616" height="1004" decoding="async" loading="lazy" alt="harness.dev at the Harness name step with hello-harness entered" src="/assets/guides/build-your-first-harness-01.png"><figcaption>The harness is named as an application artifact, not as an endpoint or request handler.</figcaption></figure>

A harness is the program you are building. The CLI materialises the project around that application boundary.

::: callout Programming model — owned application lifetime
The generated `harness(...)` is a long-lived program whose work and resources belong to its scope.
:::

### Choose its surfaces {#choose-its-surfaces}

Select CLI, desktop, and web.

<figure class="flow-shot"><img width="1614" height="1008" decoding="async" loading="lazy" alt="harness.dev with CLI, desktop, and web selected" src="/assets/guides/build-your-first-harness-02.png"><figcaption>CLI is always included; desktop and web mount the same harness through their own bindings.</figcaption></figure>

These are three presentations of one application contract—not three agent implementations. The intelligent procedure remains under `harness/`; target-specific wiring is generated under `targets/`.

::: callout Programming model — procedure is separate from presentation
Commands enter the harness and events leave it through one protocol. Each selected surface renders the same running application.
:::

### Choose a trunk model {#choose-a-trunk-model}

Use the recommended Qwen3.5 4B weight.

<figure class="flow-shot"><img width="1614" height="1006" decoding="async" loading="lazy" alt="harness.dev at the trunk model step" src="/assets/guides/build-your-first-harness-03.png"><figcaption>The recommended model is fetched and digest-verified on first run. You can also bring a local GGUF.</figcaption></figure>

The model is part of the application's execution environment. You are not configuring a client to an inference-provider endpoint.

::: callout Programming model — resident inference
The Session and its temporary work run over live resident state rather than reconstructing context around detached calls.
:::

### Choose a starting point {#choose-a-starting-point}

Select **basic**.

<figure class="flow-shot"><img width="1620" height="1002" decoding="async" loading="lazy" alt="harness.dev with the basic Wikipedia research harness selected" src="/assets/guides/build-your-first-harness-04.png"><figcaption><code>basic</code> is a compact Wikipedia research harness; <code>research</code> is the larger tuned recon → plan → Agents → synthesis pipeline.</figcaption></figure>

A template is editable TypeScript, not a hosted mode. It gives the harness an initial procedure and topology that you will change directly later in this guide.

::: callout Programming model — procedure is code
The model supplies learned capability. The harness supplies procedure, topology, Tools, policy, completion, and continuity.
:::

### Materialise the project {#materialise-the-project}

The CLI scaffolds the targets, vendors the signed Wikipedia App, and installs the project dependencies.

<figure class="flow-shot"><img width="1620" height="1008" decoding="async" loading="lazy" alt="harness.dev scaffolding hello-harness and installing dependencies" src="/assets/guides/build-your-first-harness-05.png"><figcaption>The project is materialised from the choices above; the generated code remains yours.</figcaption></figure>

When installation completes, the wizard prints the exact command for every selected surface.

<figure class="flow-shot"><img width="1612" height="1010" decoding="async" loading="lazy" alt="hello-harness ready with commands for CLI, desktop, and web" src="/assets/guides/build-your-first-harness-06.png"><figcaption><code>hello-harness</code> is ready to run as CLI, desktop, or web.</figcaption></figure>

### Begin a Session {#begin-a-session}

Enter the project and start the web target:

```sh label="TERMINAL"
cd hello-harness
npm run dev:web
```

<figure class="flow-shot"><img width="1614" height="1008" decoding="async" loading="lazy" alt="npm run dev:web starting the resident-model host and browser client" src="/assets/guides/build-your-first-harness-07.png"><figcaption>The web target boots the resident-model host and Vite browser client together. On first run, the host fetches and digest-verifies the model.</figcaption></figure>

Open the local address printed by Vite: `http://localhost:5173/`. The browser is a surface over the host; the host owns the resident model and runs the same `harness.ts` application contract.

When the model finishes loading and the browser connects, the application begins a Session. Submit an initial task and watch the starter procedure unfold:

```text label="STRUCTURE"
browser command
  ↓
running Session
  ↓
two research Agents over one shared spine
  ↓
Tools acquire source material
  ↓
one synthesis Agent combines the findings
  ↓
the accepted result is committed to the Session
```

A useful first task is:

```text label="STRUCTURE"
What caused the decline of the Western Roman Empire?
```

::: callout Programming model — the surface is not the intelligence
The browser renders commands and events. The harness, Session, orchestration, and continuity rules remain in the host process as the surface changes.
:::

---

## 2\. Find the application {#step-2-find-the-application}

The scaffold contains runtime and surface wiring, but the application is concentrated in three files:

```text label="STRUCTURE"
harness/
├── harness.ts     the intelligent procedure
├── protocol.ts    commands in and events out
└── state.ts       events folded into renderable state
```

Open `harness/harness.ts` first.

The harness is a headless TypeScript program. The CLI and web UI are surfaces over it; the application procedure does not live in the terminal or browser.

For this guide, you only need to follow:

```text label="STRUCTURE"
harness(...)
  ↓
runQuery(...)
  ↓
withSpine(...)
  ↓
agentPool(...)
  ↓
useAgent(...)
  ↓
session.commitTurn(...)
```

That path puts the programming model into practice.

---

## 3\. Work always belongs somewhere {#step-3-work-always-belongs-somewhere}

The harness itself is a long-lived Effection `Operation`:

```ts label="TYPESCRIPT"
export function* harness(
  ctx: SessionContext,
  events: EventBus<WorkflowEvent>,
  commands: Signal<Command, void>,
): Operation<void> {
  // ...
}
```

Inside it, the scaffold starts an event-forwarding task:

```ts label="TYPESCRIPT"
yield* spawn(function* () {
  for (const ev of yield* each(agentEvents)) {
    events.send(ev as WorkflowEvent);
    yield* each.next();
  }
});
```

The harness then remains inside its command loop:

```ts label="TYPESCRIPT"
for (const cmd of yield* each(commands)) {
  if (cmd.type === "quit") return;

  if (cmd.type === "submit_query") {
    const answer = yield* runQuery(cmd.query, session, events);
    events.send({ type: "answer", text: answer });
  }

  yield* each.next();
}
```

The command loop and event forwarder run concurrently, but neither is detached. Both belong to the harness scope.

> **When the harness ends, its child work ends with it.**

This is the first key concept: asynchronous work has an explicit owner.

---

## 4\. Live attention is a resource {#step-4-live-attention-is-a-resource}

The starter's task handler borrows a temporary spine inside the continuing Session:

```ts label="TYPESCRIPT"
const notes = yield* withSpine<string[]>(
  {
    parent: session.trunk ?? undefined,
    systemPrompt: spinePrompt,
    tools,
  },
  function* (spine) {
    // research work over shared live state
  },
);
```

Read this as:

> Borrow a shared line of live attention, perform owned work inside it, return ordinary data, then reclaim the temporary inference subtree.

The spine may inherit the Session trunk. Research Agents fork from the spine and share its decoded prefix. Their findings leave the scope as strings in `notes`; their branches do not need to survive.

```text label="STRUCTURE"
Session trunk
└── task spine
    ├── research Agent A
    └── research Agent B

branches are reclaimed
notes leave as data
```

This is the second key concept: live inference state has a lifetime and belongs in the program's structure.

---

## 5\. Agents are managed, not launched {#step-5-agents-are-managed-not-launched}

Inside the spine, the starter declares an Agent pool:

```ts label="TYPESCRIPT"
const pool = yield* agentPool({
  tools,
  parent: spine,
  terminal: reportTool,
  maxTurns: MAX_TURNS,
  pruneOnReturn: true,
  policy: new DefaultAgentPolicy({ terminalToolName: "report" }),
  enableThinking: true,
  orchestrate: parallel(
    ANGLES.map((angle, i) => ({
      content: `${query}\n\nFocus: ${angle}`,
      systemPrompt: agentPreamble(apps[0], i),
      seed: 1000 + i,
    })),
  ),
});
```

`parallel(...)` declares the relationship between the tasks. The AgentPool creates the corresponding branches and advances the runnable cohort through its inference loop.

```text label="STRUCTURE"
shared spine
├── Agent A: core facts
└── Agent B: context and significance
```

An Agent is not one detached task and not one remote model request. It is a live branch given intent and managed by the pool.

This is the third key concept: harness code declares Agent relationships; the pool owns their execution.

---

## 6\. Application code controls execution {#step-6-application-code-controls-execution}

The starter is a complete procedure, but none of its cognitive structure is fixed by the framework. Change the application code and the running intelligence changes with it.

### Change the intent {#change-the-intent}

Replace the starter's research angles:

```ts label="TYPESCRIPT"
const ANGLES = [
  "Establish the core facts and timeline.",
  "Identify important disagreements or uncertainty.",
  "Explain the practical significance.",
];
```

Run the same task again.

You changed what interpretations the harness creates without changing the model, Tool, surface, or runtime.

This is the fourth key concept in its first form: application code controls execution by deciding what work exists.

### The tests notice {#the-tests-notice}

Run `npm test` after that change and it fails. The scaffold ships behavioural tests in `test/invariants/`, and they script the model's replies — one per angle, then the settling agent's. A third angle has no reply scripted for it, so the assertions shift.

This is the suite doing its job: it pins what the harness produces, so changing the harness is supposed to be visible here. Add the reply your new angle needs and it passes again. The tests are yours — they came with the project, not with the framework.

### Change the topology {#change-the-topology}

The starter uses `parallel(...)` because each angle can proceed independently from the same starting state:

```text label="STRUCTURE"
parallel
A ─┐
B ─┼─ inherit the same starting spine
C ─┘
```

Now import `chain`:

```ts label="TYPESCRIPT"
import {
  // ...
  parallel,
  chain,
  // ...
} from "@lloyal-labs/lloyal-agents";
```

Replace the `orchestrate` value:

```ts label="TYPESCRIPT"
orchestrate: chain(ANGLES, (angle, i) => ({
  task: {
    content: `${query}\n\nFocus: ${angle}`,
    systemPrompt: agentPreamble(apps[0], i),
    seed: 1000 + i,
  },
  userContent: `Research focus: ${angle}`,
})),
```

The execution now has a different shape:

```text label="STRUCTURE"
chain
A reports
  ↓ accepted finding extends the spine
B inherits A
  ↓ accepted finding extends the spine
C inherits A + B
```

Nothing selected a predefined "deep research mode." Ordinary TypeScript changed which live state later work inherits.

Use `parallel` when tasks need independent breadth. Use `chain` when later work should build on accepted earlier findings.

---

## 7\. Finality and continuity are explicit {#step-7-finality-and-continuity-are-explicit}

After research, the starter creates one synthesis Agent:

```ts label="TYPESCRIPT"
const synth = yield* useAgent({
  systemPrompt: SYNTH_SYSTEM,
  task: renderTemplate(SYNTH_USER, {
    query,
    notes: notes.map((n, i) => `[${i + 1}] ${n}`).join("\n\n"),
  }),
  parent: session.trunk ?? undefined,
  policy: new SynthPolicy(),
  maxTurns: MAX_TURNS,
});
```

The research notes are working state. The synthesis policy accepts the final free-text result, and the harness cleans it into `answer`.

The answer becomes continuing Session state only here:

```ts label="TYPESCRIPT"
yield* call(() => session.commitTurn(query, answer));
```

```text label="STRUCTURE"
research branches
      ↓ temporary findings
synthesis result
      ↓ accepted by the harness
Session commit
      ↓
subsequent work may inherit it
```

Submit a follow-up task that depends on the first result. New work can inherit the committed turn even though the temporary research subtree has been reclaimed.

This is the fifth key concept:

```text label="STRUCTURE"
model output
≠ accepted result
≠ continuing Session state
```

The starter already exercises result acceptance and continuity. Protected external actions add a separate authority boundary, covered in [Adaptive compute](/agent-policy-and-context-pressure).

---

## Make it yours {#make-it-yours}

Four edits change what the application *is* without touching how it runs. Each lives in one file, and every surface reads it from there.

### Name it {#name-it}

The window title, the browser tab, the terminal header and the served host all read one constant:

```ts label="TYPESCRIPT"
export const APP = {
  name: "Field Notes",
} as const;
```

The folder keeps the name you scaffolded with. What people see comes from here, so the two are free to differ.

### Give it a look {#give-it-a-look}

The interface is ordinary CSS in `src/ui/app.css`, and its `:root` block is the whole palette. The `--harness-*` tokens matter more than they look: the platform's own screens read them, so the installer a reader meets *before the app opens* is drawn in your colours.

```css label="CSS"
:root {
  --text: #ece6da;
  --bg: #14161b;
  --link: #e3a248;
  /* The platform's own screens read these. */
  --harness-accent: var(--link);
  --harness-bg: var(--bg);
  --harness-fg: var(--text);
}
```

Change those tokens and the first screen anyone sees changes with them. There is no separate installer theme to keep in step.

### Tell it who it works for {#tell-it-who-it-works-for}

Two sentences, empty as shipped, that every framed prompt carries:

```ts label="TYPESCRIPT"
export const INSTRUCTIONS = {
  purpose: "You help field engineers get oriented on unfamiliar equipment fast.",
  answers: "Open with the one-sentence answer. Name the standard wherever one exists.",
};
```

`purpose` reaches every Agent that thinks about the question. `answers` reaches only the one writing the words a reader gets. Left empty they add nothing — not a blank line, not a stray heading.

### Write its prompts {#write-its-prompts}

Everything the model is told by your own hand is a file in `src/harness/prompts/`: `<name>.system.eta` beside `<name>.user.eta`. They are read again on every render, so an edit is live at the next question with no restart.

These are [Eta](https://eta.js.org) templates, which means they are JavaScript. `<%= %>` writes a value; `<% %>` runs a statement. So a prompt can loop, branch, and stay one file instead of three:

```text label="ETA"
Question: <%= it.query %>

<% for (const source of it.sources) { %>
- <%= source.title %> — <%= source.url %>
<% } %>

<% if (it.sources.length === 0) { %>
No sources were gathered. Say so plainly rather than inventing a summary.
<% } %>
```

Prose the model reads is built the way any other text is. The starter hands its notes in already joined, which is fine while the shape is fixed; build the list in the template instead and the shape of what the model sees lives in the file you are reading.

Every system file opens by handing itself to the one frame, so the identity above is said in the same place every time. It is a *layout*, not an include — the file declares it on its first line and the frame wraps whatever the file goes on to say:

```text label="ETA"
<% layout("./framed", { writesTheAnswer: true }) %>
```

`framed.eta` puts `purpose` before your text and, when the stage writes the words a reader gets, `answers` after it. Setting `writesTheAnswer` is how a file says which it is.

One more thing worth knowing: a key the template reads that was never given renders **empty**, and says so in the engine's log. It never puts the word `undefined` in front of the model.

---

## What you just programmed {#what-you-just-programmed}

| Code | Programming-model concept |
| --- | --- |
| `harness(...)` | Owned application lifetime |
| `spawn(...)` | Owned concurrent work |
| `withSpine(...)` | Scoped live inference state |
| `agentPool(...)` | Managed Agents |
| `parallel(...)` | Independent breadth over shared state |
| `chain(...)` | Sequential inheritance through the spine |
| terminal `report` / `SynthPolicy` | Application-defined completion |
| `session.commitTurn(...)` | Explicit continuity |

The progression was deliberately small:

```text label="STRUCTURE"
create the harness
  → begin a Session
    → find the application
      → change intent
        → change topology
          → continue from accepted state
```

You have now used the five key concepts in a real harness.

---

## Continue {#continue}

Read [Thinking in Lloyal](/thinking-in-lloyal) for the complete execution model behind the code you just changed.

Then read [Adaptive compute](/agent-policy-and-context-pressure) for policy, context pressure, recovery, and lifecycle boundaries.

For the full CLI surface—models, targets, Apps, publishing, and served placements—see [`lloyal-ai` on npm](https://www.npmjs.com/package/lloyal-ai).
