---
title: "Prompts"
description: "Every word your app says to the model is an Eta file in src/harness/prompts/, read again on every render — edit it and the next question hears it. The frame, the app's two instructions, loops and branches, and what happens to a missing input."
lede: "Every word your app says to the model is a file you can edit while it runs."
---

<!--
Checked against a 1.13.0 basic scaffold, 2026-09-30:
  src/harness/prompts.ts       Eta({ views: prompts/, cache: false, autoEscape: false }); guardedInput; render(); prompt()
  src/harness/prompts/README.md  the file table, `it`, missing keys, what you can write, two rules
  src/harness/prompts/framed.eta the frame: purpose, body, answers when writesTheAnswer
  src/harness/instructions.ts  INSTRUCTIONS { purpose, answers } — read when a run starts
  test/invariants/prompts.test.ts renders every file from its input contract
-->

Everything your app tells the model in its own words lives in `src/harness/prompts/`, one file per text. Nothing is a string in code. The folder is read again on every render, so an edit reaches the **next question**, with no restart and no rebuild.

## The files {#the-files}

A prompt is a pair: `<name>.system.eta` is the system prompt, `<name>.user.eta` the user turn, rendered with the same input. In the basic template:

| File | Who reads it | What it receives (`it.*`) |
|---|---|---|
| `framed.eta` | Every system prompt, as its layout | `purpose`, `answers`, `body` (the file that handed itself over), `writesTheAnswer` |
| `topics` | The agent that names the topics | `articles`, `smallestPile`, `tool` |
| `topic` | One agent per article, filing it under a topic | `topics`, `article` |
| `synthesize` / `synthesize-extend` | The writer, from the notes / extending a settled article | `query`, `notes` |

Code renders them with `prompt(name, input)` — a `{ systemPrompt, content }` pair that spreads straight into an agent — or `render(file, input)` for one file:

```ts label="src/harness/wiki.ts"
const settled = yield* useAgent({
  ...prompt(trunk ? "synthesize-extend" : "synthesize", { query, notes }),
  parent: spine,
  // …
});
```

## The frame {#the-frame}

Every system file opens by handing itself to one frame:

```text label="src/harness/prompts/synthesize.system.eta"
<% layout("./framed", { writesTheAnswer: true }) %>
You are an article synthesist. …
```

`framed.eta` puts what the app is **for** first and — for a stage that writes the words a reader gets — what its answers must do last:

```text label="src/harness/prompts/framed.eta"
<%~ [it.purpose, it.body, it.writesTheAnswer ? it.answers : ""].map((part) => (part ?? "").trim()).filter(Boolean).join("\n\n") %>
```

The two sentences come from `src/harness/instructions.ts`, empty as shipped:

```ts label="src/harness/instructions.ts"
export const INSTRUCTIONS = {
  purpose: "You help maintenance engineers investigate equipment failures.",
  answers: "Lead with the likely cause. Always name the part number.",
};
```

`purpose` reaches every agent that thinks about the question; `answers` only the one writing the reader's words. Unlike the prompt files, `instructions.ts` is read when a run starts.

## What you can write {#what-you-can-write}

Templates are [Eta](https://eta.js.org), which means JavaScript: `<%= it.x %>` writes a value, `<% … %>` runs a statement, `<%~ … %>` inserts text as it is. Escaping is off — this is prose for a model, not HTML.

```text label="Example"
<% /* a numbered list from an array */ %>
<% it.topics.forEach((t, i) => { %><%= i + 1 %>. <%= t %>
<% }) %>

<% /* computed text: counts, plurals */ %>
<%= it.articles.length %> article<%= it.articles.length === 1 ? "" : "s" %>

<% /* a conditional part */ %>
<% if (it.notes.trim()) { %>Notes so far:
<%= it.notes %><% } %>
```

## A missing input {#missing-input}

A top-level key a template reads that its input does not give renders as **empty**, and one line in the engine's log says so. It never puts the word `undefined` in front of the model, and it never costs a reader the run.

`npm test` renders every file against its input contract, so a key a file reads that its stage does not pass fails the tests before any model loads.

## Two rules {#two-rules}

- **Say nothing about the format.** No role markers, no `<think>`, no tool JSON. The framework adds the model's own, so a file that spells them is wrong for the next model.
- **Say nothing the harness does not know.** A worked example is fine; a fact the run did not surface is not.

## Related {#related}

- [Build your first harness](/build-your-first-harness#write-its-prompts) — edit a prompt and ask again.
- [Typed Decisions from LLMs](/typed-decisions) — when the answer should be a value, not prose.
