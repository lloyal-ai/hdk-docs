---
title: "Build your first harness"
description: "Create a Lloyal app from the basic template, find the program inside it, and change how it thinks: its angles, its topology, what it remembers, and what it is called."
lede: "Create an app, find the program inside it, and change how it thinks — in about half an hour."
---

<!--
Rewritten 2026-09-30 against a real scaffold: `npx lloyal-ai@1.13.0 new wiki --template basic`.
Every step below was performed on that scaffold:
  - `npm test`: 69 pass as generated; changing the two ANGLES' wording: 69 pass;
    adding a third angle: 12 scenario tests time out (the scripts answer two angles);
    `parallel` → `chain` (keeping `key`): tsc clean, 69 pass.
  - `node bin/run.js --query "Who was Ada Lovelace?"`: a cited article, 3 agents, 12 tool calls.
Files quoted: src/app.ts, src/harness/wiki.ts, src/harness/article.ts, src/harness/prompts.ts,
src/harness/instructions.ts, src/ui/presentation.ts, src/ui/app.css, src/harness/prompts/framed.eta, README.md.
The old screenshots showed `npx harness.dev@latest new` (v0.7.1) and were removed.
-->

You will create the **basic** template — a small Wikipedia research app — then open the one file that decides how it thinks, and change it three ways. Nothing here needs an API key.

Before you start, check [System requirements](/system-requirements): Node.js 24 or newer and about 10 GB of memory.

## 1. Create the app {#create-the-harness}

```sh label="Terminal"
npx lloyal-ai new
```

The wizard asks four things:

| It asks for | Choose | What it decides |
|---|---|---|
| **Harness name** | `hello-harness` | The folder and the npm package name. What people see is set later, in one file. |
| **Targets** | cli, desktop and web | Where the same program can run. The terminal (`cli`) is always included. |
| **Trunk model** | The recommended Qwen3.5 4B | The model that lives inside the app. It is downloaded and verified on the first run — or point it at a `.gguf` you already have. |
| **Template** | `basic` | The starting program. `research` is the larger deep-research pipeline. |

It creates the project, installs its dependencies and a signed Wikipedia **Ability** (the app's source of evidence), and ends by telling you how to run it:

```text label="Terminal"
hello-harness is ready.

  cd hello-harness

  Run it
    cli      npm start
    desktop  npm run dev:desktop
    web      npm run dev:web  (boots the host + browser)

  First run fetches + digest-verifies the model — no API key.
  Add abilities:  npx lloyal-ai install <publisher>/<name>
```

## 2. Run it and ask something {#begin-a-session}

```sh label="Terminal"
cd hello-harness
npm run dev:desktop
```

The first launch shows the installer while it downloads and verifies the model. After that it opens at once.

Ask it something with an answer on Wikipedia — *Who was Ada Lovelace?* — and watch:

```text label="What happens"
your question
  ↓
two agents read Wikipedia at the same time, each from its own angle,
both forked from one shared line of the model's attention (a "spine")
  ↓
each reports its findings, with the pages it cited
  ↓
a settling agent writes one article from their notes
  ↓
the article is saved to disk, shown to you, and kept in the model's memory
  ↓
a follow-up question deepens the same article
```

The same program runs in all three surfaces. `npm run dev:web` serves it to a browser; `npm start` runs it in the terminal.

## 3. Find the program {#find-the-application}

Most of the project is wiring the platform owns. What is yours is small:

```text label="src/"
app.ts          what this app IS: its abilities, its config, its harness
config.ts       its settings, as data
protocol.ts     the events it emits and the commands it accepts
harness/
  wiki.ts       what the MODEL does — the file to edit
  article.ts    an article's life, and the only place the model's memory is written
  classify.ts   sorts saved articles into topics
  prompts/      every word the model is told, one .eta file each
  instructions.ts   who the app is for
ui/
  state.ts      events folded into what every view shows
  presentation.ts   what the app is called
```

Open **`src/harness/wiki.ts`**. Its `write` function takes the model's memory of the page (the *trunk*) and a question, and returns an article. It never writes the memory itself — that is `article.ts`'s job alone.

## 4. Read the program {#read-the-program}

Here is the heart of `write`:

```ts label="src/harness/wiki.ts"
const budget: Budget = { maxTurns: MAX_TURNS, nudge: NUDGE };

// The spine lives for exactly this callback: the angles fork from it, and it is released on return.
return yield* withSpine<string | null>(
  { parent: trunk ?? undefined, systemPrompt: renderSpine({ abilities }), tools },
  function* (spine) {
    const pool = yield* agentPool({
      tools,
      parent: spine,
      terminal: citedReport.tool,
      budget,
      hooks: [EVIDENCE_FIRST],
      orchestrate: parallel(
        ANGLES.map((angle, i) => ({
          key: taskKey(i),
          content: `${query}\n\nFocus: ${angle}`,
          systemPrompt: agentPreamble(abilities[0], i),
          seed: 1000 + i,
        })),
      ),
    });
    const found = ANGLES.map((_, i) => {
      const o = pool.byKey(taskKey(i));
      return o ? citedReport.read(o) ?? "" : "";
    });
    // … then one settling agent writes the article from the notes
  },
);
```

Read it top to bottom:

- **`withSpine`** borrows a shared line of the model's live attention for the length of the callback. Everything the agents need to know in common — the tools, the ability's instructions — is decoded into it **once**, and every agent forks from it instead of re-reading it.
- **`agentPool`** runs the agents. `orchestrate: parallel(...)` says there are two, independent, one per angle. The pool advances them together over one model.
- **`terminal: citedReport.tool`** is how an agent finishes: by calling `report` with its findings and the pages it cited.
- **`budget`** is every number an agent obeys — here, a turn cap and what it is told when it must wind up. The framework derives the policy from it.
- **`hooks: [EVIDENCE_FIRST]`** is one rule of this app's: an agent may not report before it has read something.
- **`pool.byKey`** reads each angle's result back by name, not by the order they happened to finish.

::: owns
The spine, and every agent forked from it, belong to the `withSpine` callback. When it returns — or throws, or the reader presses Stop — they are released. Only **data** leaves: the notes, as strings. That is why there is no cleanup code here to write. Why this works is [Thinking in Lloyal](/thinking-in-lloyal); the forms are Effection's structured concurrency, next to async/await on [Structured concurrency](/structured-concurrency).
:::

## 5. Change what it looks for {#change-the-intent}

The two angles are plain data at the top of `wiki.ts`:

```ts label="src/harness/wiki.ts"
const ANGLES = [
  "Gather the core facts, dates, and definitions.",
  "Gather context, significance, and differing viewpoints.",
];
```

Change their wording to your domain:

```ts label="src/harness/wiki.ts"
const ANGLES = [
  "Establish the core facts and timeline.",
  "Identify important disagreements or uncertainty.",
];
```

Ask the same question again. You changed what the agents look for without touching the model, the tools or the surfaces.

### The tests notice {#the-tests-notice}

```sh label="Terminal"
npm test
```

The project ships behaviour tests in `test/invariants/`. They run the real program over a **scripted** model — no weights, about a second — and they pass with the new wording.

Now add a third angle and run them again. Twelve scenarios fail, each after a 30-second wait: every script answers exactly two angles, then the article, so a third agent waits for a reply that never comes. That is the suite doing its job — it pins what the program does. To keep a third angle, add one more `{ kind: "report", … }` to each scripted turn in `test/invariants/`.

## 6. Change how the agents work together {#change-the-topology}

`parallel` gives each angle the same starting point, so they work independently:

```text label="parallel"
spine ─┬─ angle 1
       └─ angle 2        both start from the same state
```

Swap it for `chain`, and each angle builds on what the one before it found:

```ts label="src/harness/wiki.ts"
orchestrate: chain(ANGLES, (angle, i) => ({
  task: {
    key: taskKey(i),
    content: `${query}\n\nFocus: ${angle}`,
    systemPrompt: agentPreamble(abilities[0], i),
    seed: 1000 + i,
  },
  userContent: `Research focus: ${angle}`,
})),
```

Import `chain` in place of `parallel` from `@lloyal-labs/lloyal-agents`. Keep the `key`: it is how `pool.byKey` finds each angle's result.

```text label="chain"
spine ── angle 1 reports
           ↓ its finding extends the spine
         angle 2 starts from what angle 1 found
```

Nothing selected a "deep research mode". Ordinary TypeScript changed what later work inherits. Use `parallel` for independent breadth, `chain` when each step should build on the last. The tests still pass.

## 7. See what it remembers {#finality-and-continuity-are-explicit}

The agents' notes are working state; they are released with the spine. What survives a turn is decided in one place, `src/harness/article.ts`, in this order: the article is saved to disk, then shown to the reader, then written into the model's memory.

```ts label="src/harness/article.ts"
function* rebase(session: Session, query: string, article: string): Operation<void> {
  // A halt cannot drop a call already inside the model half way.
  yield* waitUntilSettled(session.dispose());
  yield* waitUntilSettled(session.commitTurn(query, article));
}
```

Ask a follow-up and the new turn starts from that memory: the article is still in view, even though every agent that wrote it is gone.

::: owns
`waitUntilSettled`, not `call`, wraps any call that writes into the model's state — `commitTurn`, `commit`, `prefill`, `promote`. A native decode cannot be recalled once it starts, so if the reader presses Stop, the operation must wait for it to finish before anything else touches that memory. With `call` it would move on while the decode is still writing.
:::

A model's output is not an accepted result, and an accepted result is not memory until the program says so. Here the program says so in one function.

## 8. Make it yours {#make-it-yours}

Four edits change what the app **is**, without touching how it runs. Each lives in one file, and every surface reads it from there.

### Name it {#name-it}

```ts label="src/ui/presentation.ts"
export const APP = {
  name: "Field Notes",
} as const;
```

The window title, the browser tab, the terminal header, the served host and the dev pane all read this one constant. The folder keeps the name you scaffolded with.

### Give it a look {#give-it-a-look}

The interface is ordinary CSS in `src/ui/app.css`. Its `:root` block is the palette, and the `--harness-*` tokens matter more than they look: the platform's own screens read them, so the installer a reader meets before the app opens is drawn in your colours.

```css label="src/ui/app.css"
:root {
  --text: #202122;
  --bg: #ffffff;
  --link: #3366cc;
  /* What the platform's own screens draw with — the installer before the app opens. */
  --harness-accent: var(--link);
  --harness-fg: var(--text);
  --harness-bg: var(--bg);
}
```

### Tell it who it works for {#tell-it-who-it-works-for}

Two sentences, empty as shipped, that every framed prompt carries:

```ts label="src/harness/instructions.ts"
export const INSTRUCTIONS = {
  purpose: "You help field engineers get oriented on unfamiliar equipment fast.",
  answers: "Open with the one-sentence answer. Name the standard wherever one exists.",
};
```

`purpose` reaches every agent that thinks about the question; `answers` only the one writing the words the reader gets. Left empty, they add nothing. They are read when a run starts.

### Write its prompts {#write-its-prompts}

Every word the model is told by this app is a file in `src/harness/prompts/`: `<name>.system.eta` beside `<name>.user.eta`. The folder is read on every render, so an edit is live at the next question with no restart.

This is the settling agent's user turn, as shipped:

```text label="src/harness/prompts/synthesize.user.eta"
Question: <%= it.query %>

Wiki notes (cite by the URLs inside them):
<%= it.notes %>

Write the grounded markdown report.
```

They are Eta templates, which means they are JavaScript: `<%= %>` writes a value and `<% %>` runs a statement, so a prompt can branch and loop instead of becoming three files:

```text label="Example — a prompt that branches"
<% if (it.notes.trim() === "") { %>
No notes were gathered. Say so plainly rather than inventing an article.
<% } %>
```

Every system file opens by handing itself to one frame, `framed.eta`, which puts `purpose` first and — for a stage that writes the reader's words — `answers` last:

```text label="src/harness/prompts/synthesize.system.eta"
<% layout("./framed", { writesTheAnswer: true }) %>
You are an article synthesist. …
```

A key a template reads that was never given renders empty and is reported in the engine's log — never the word `undefined` in front of the model — and `npm test` renders every file against its input, so a missing key fails before any model loads.

## What you just used {#what-you-just-programmed}

| Code | What it gives you |
|---|---|
| `withSpine(...)` | One shared line of attention, released when the callback ends |
| `agentPool({ orchestrate })` | Agents run together over one model |
| `parallel(...)` / `chain(...)` | Independent breadth, or each step building on the last |
| `terminal: citedReport.tool` | How an agent finishes, with its citations |
| `budget` | Every number an agent obeys |
| `hooks` | A rule at one moment of a tool call's life |
| `waitUntilSettled(session.commitTurn(...))` | Memory changes only here, and safely |

## Next {#continue}

- [Structured concurrency](/structured-concurrency) — the Effection forms you just read, next to the async/await you know.
- [Ship a desktop app](/ship) — turn it into a `.dmg`.
- The project's own `README.md` has recipes: classify with the resident model, add a second model, write a tool, steer agents with hooks, add a live setting.
