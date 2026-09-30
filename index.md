---
title: "Lloyal docs"
description: "Lloyal is a TypeScript platform for AI apps with the model inside them — no API key, no Docker, no vector database. Create one with a single command, run it on a laptop, an office appliance or a GPU box, and ship it as an app people download."
lede: "Build AI apps with the model inside them — no API key, no Docker, no vector database. Your code and the model run in one process, on a laptop, an office appliance or a GPU box."
---

## Get started {#get-started}

```sh label="Terminal"
npx lloyal-ai new
```

One command creates a working app: a desktop window, a browser app and a terminal, all running the same program over a model that is downloaded and verified on its first run. The program — which agents exist, what they read, when they are done — is ordinary TypeScript in `src/harness/`, and it is yours to change.

- **[Quickstart](/quickstart)** — three commands to a running app.
- **[System requirements](/system-requirements)** — what your machine needs. New to the terminal? It has a three-step Node.js install.
- **[Build your first harness](/build-your-first-harness)** — find the program inside the project and change how it thinks.

## What you can build {#what-you-can-build}

| | |
|---|---|
| **An app people download** — the model built in, working offline, no account. | [Ship a desktop app](/ship) |
| **AI inside your product for many users** — one model on your own machine or GPU box, a session per user, no per-token bill. | [Serve to many users](/serve) |
| **Research you can hand someone** — agents that read in parallel from one shared context and settle on a cited answer. | The `research` template · [Agents and orchestration](/agents) |
| **Classification and extraction** — a label, a number, a choice from a list, from the model you already have, with nothing to parse. | [Structured output](/structured-output) |
| **Reasoning with specialists beside it** — a judge that ranks what agents read, vision, embeddings, named in one line each. | [Services](/services) · [Retrieval](/retrieval) |
| **Tools that work inside live inference** — tools that know what the calling agent has read, and can start agents that inherit it. | [Tools](/tools) |
| **Answers from your documents** — PDFs and images attached by a reader, searched and shown to the model only where it needs them. | [Attachments and documents](/attachments) |

## Find your way {#find-your-way}

| You want to | Start here |
|---|---|
| Run several agents over shared context | [Agents and orchestration](/agents) |
| Give agents an action, or your own data | [Tools](/tools) |
| Refuse a call, retry a failure, require evidence before an answer | [Tool hooks and guards](/tool-hooks) |
| Limit turns, time and context — and wrap up early | [Agent policy](/agent-policy) |
| Let an agent act only with a person's approval | [Human approval](/human-approval) |
| Change what the model is told | [Prompts](/prompts) |
| Change or bring your own model | [Models](/models) |
| Add a setting a user can change live | [Settings](/settings) |
| Build the screen around it | [The interface](/interface) |
| Test it without a model | [Testing](/testing) |
| See what the agents did | [Debug with traces](/traces) |
| Fix an error | [Troubleshooting](/troubleshooting) |
| Package a capability for any harness | [Abilities](/abilities) |
| Look up a command or a setting | [CLI](/cli) · [harness.yml](/harness-yml) |

## How it works {#how-it-works}

Lloyal programs are generators with structured ownership: whatever a piece of work starts is finished or cleaned up when that work ends. If you write async/await, **[From async/await to Lloyal](/async-to-lloyal)** is the whole translation, on one page.

Every agent is a branch of the model's live state — it forks from what the model has already read, rather than re-sending it — and the pool advances all of them together over one model. Why that changes what an application can do is **[Continuous Context](/continuous-context)**; how it is programmed is **[Thinking in Lloyal](/thinking-in-lloyal)**.

## For your coding agent {#for-coding-agents}

Every page here is also Markdown — add `.md` to its URL — and [/llms.txt](/llms.txt) lists them all. Every scaffolded project carries an `AGENTS.md`: the rules and the map a coding agent needs before it edits the code.

Lloyal is the platform for [Vertical Inference](https://verticalinference.lloyal.ai/).
