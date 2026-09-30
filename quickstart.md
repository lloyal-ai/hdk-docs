---
title: "Quickstart"
description: "Create a Lloyal app, run it on your own machine, and ask it something — three commands, no API key."
lede: "Three commands to an app with the model inside it. No API key, no Docker, no vector database."
---

<!--
Checked against source, 2026-09-30:
  lloyal       src/commands/new.ts   USAGE: templates, --targets, --model, -y; interactive picker order
  lloyal       README.md             "An example: three commands to a living brief", "One program, three surfaces"
  lloyal       templates/*/package.json scripts: dev:desktop, dev:web, start
  lloyal       templates/*/harness.yml  the weights each template names
-->

You need Node.js 24 or newer and about 10 GB of memory. If you are not sure, [System requirements](/system-requirements) has the checks and a three-step Node.js install.

## Create and run {#create-and-run}

```sh label="Terminal"
npx lloyal-ai new my-app --template research
cd my-app
npm run dev:desktop
```

The first command creates `my-app/`, installs its dependencies and prints how to run each surface. Leave out the name and the flags and it asks for them instead: name, surfaces, model, template.

The first launch downloads and verifies the models the template names; `research` needs three — a 4B reasoning model, a reranker and a vision projector. The app shows each download with its bytes, rate and time left. Every launch after that opens at once.

Then ask it something worth investigating.

## Pick a template {#pick-a-template}

| Template | Flag | What you get |
|---|---|---|
| Wiki | `--template basic` (the default) | A small Wikipedia research app: two agents and an article view. The smallest program to read and change. |
| Deep research | `--template research` | A grounded multi-agent investigation: plan, parallel inquiries, a cited brief, a library that later briefs build on. |

Each generated project carries its own README with recipes for that template.

## Pick a surface {#pick-a-surface}

The same program runs in all three. Run whichever you like from the project folder:

| Surface | Run | The model runs in |
|---|---|---|
| A desktop app | `npm run dev:desktop` | an engine process the window talks to |
| A browser | `npm run dev:web` | a host you serve; the browser connects to it |
| Your terminal | `npm start` | the process itself |

## Next {#next}

- [Build your first harness](/build-your-first-harness) — find the program inside the project and change how it thinks.
- [Ship a desktop app](/ship) — turn it into a `.dmg` someone else can install.
