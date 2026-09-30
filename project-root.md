---
title: "Choose where the work lives"
description: "Run a harness whose code lives in one place and whose work — the manifest, the settings overlay, the models, the content store, what it keeps — lives in another, with LLOYAL_PROJECT_ROOT. What moves, what stays, and how the desktop app uses the same rule."
lede: "Keep the code in one place and a run's work — its manifest, models and what it keeps — in another."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/rig/src/boot.ts          projectRootOf: the caller's option, else LLOYAL_PROJECT_ROOT, else cwd; blank is nothing said; absolute
                                                bootEdge and bootServed both read it
  lloyal-sdk  packages/desktop/src/placement.ts appPath / cwd / dataRoot; seedIfAbsent copies harness.yml once
  lloyal-sdk  git 723154d  "a harness can run with no project directory" (rig 5.7.0, desktop 0.2.0)
-->

In development, a harness's code and its work share one folder: the project. An installed application cannot work that way — its own files are read-only — and a server may want one build serving several data folders. So where a run's **work** lives is one setting, separate from where the code is.

## When to use it {#when-to-use}

- Run the same build against more than one data folder — a test set, a customer's corpus, a clean slate.
- Serve from a box where the code is read-only and the work must go to a writable volume.
- Understand where an installed desktop app keeps its models and settings — it uses this same rule.

## Set it {#set-it}

```sh label="Terminal"
LLOYAL_PROJECT_ROOT=/srv/field-notes npm start
```

Where the work lives is decided in this order, first one that says something:

1. A `projectRoot` passed to the boot in code
2. `LLOYAL_PROJECT_ROOT` in the environment
3. The working directory — the project, when you run from it

A blank value counts as not set (never the root of the filesystem), and the result is always made absolute. Both boots — the terminal and desktop one, and the served host — read it.

It belongs in the environment rather than in `harness.yml` for the same reason `PORT` and `MAX_SESSIONS` do: it describes the machine, not the harness.

## What moves {#what-moves}

| Lives in the data root | Stays with the code |
|---|---|
| `harness.yml` — the manifest that run reads | The compiled program and its dependencies |
| `harness.json` — settings saved from the pane | The prompt folder, `src/harness/prompts/` |
| `models/` — the downloaded weights | |
| `media/` — the content store for attachments | |
| `sources.outputDir` — what the harness keeps, and the trace, when it is a relative path | |

The data root must contain a `harness.yml`: it is the manifest the run reads. Copy the project's to start one.

## The desktop app uses the same rule {#desktop}

An installed desktop app has two places because the operating system allows no other way: its own files ship inside the application bundle, read-only, and everything a run produces goes to a writable folder the platform gives each installation. The shell points the engine's data root there, and copies the shipped `harness.yml` into it **once**, on first launch — after that the file is the installation's own, and an update never rewrites it. [Ship a desktop app](/ship#two-roots) has the details.

## Related {#related}

- [Serve to many users](/serve) — the served host reads the same setting.
- [harness.yml](/harness-yml) — the manifest, and the box's own settings.
