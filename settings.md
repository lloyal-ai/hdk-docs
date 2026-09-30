---
title: "Settings"
description: "Declare a setting once as data in src/config.ts and it exists everywhere: harness.yml can commit it, the dev pane lists and saves it with its provenance, and code reads it live under a running agent."
lede: "Add a setting with one line, and read it live — a save applies at the next read, with nothing restarted."
---

<!--
Checked against source and a 1.13.0 basic scaffold, 2026-09-30:
  lloyal-sdk  packages/rig/src/config.ts   ConfigEntry fields (yml, env, cli, path, integer, oneOf, check, default, applies, describe)
  scaffold    src/config.ts                defineConfig({ ...modelSettings, "sources.outputDir": … })
  scaffold    README.md                    "A setting of your own, live"
  Compiled: an "answer.words" key added to the scaffold; `runner.config().answer.words` typechecks as number.
-->

Everything a harness can be configured with is declared once, as data, in `src/config.ts`. Declare a key there and it is typed everywhere, `harness.yml` can commit a value for it, the dev pane (`LLOYAL_DEV=1`) lists and saves it, and every value arrives with where it came from.

## Quickstart {#quickstart}

Add a line to the table:

```ts label="src/config.ts"
export const config = defineConfig({
  ...modelSettings,
  "sources.outputDir": { yml: "sources.outputDir", cli: "outputDir", path: true, default: ".", describe: "Where the session trace is written." },
  "answer.words": { yml: "answer.words", integer: true, default: 400, describe: "How long a settled article may run." },
});
```

Commit a value if you want one other than the default:

```yaml label="harness.yml"
answer:
  words: 600
```

Read it **where you use it**, not once at boot:

```ts label="TypeScript"
const words = runner.config().answer.words;   // typed: number
```

## Read it live {#read-it-live}

Hand code a function that reads the config, the way the template's `app.ts` hands `article.ts` its output folder:

```ts label="src/app.ts"
const article = articles({
  session, run, wire,
  root: () => runner.config().sources.outputDir,
});
```

Because it is read at each use, a save in the dev pane applies at the next read — under a running agent, with nothing restarted. That is the same rule an Ability's settings follow: a key saved mid-run reaches the next call of every agent already running.

## What a key can say {#key-fields}

| Field | Says |
|---|---|
| `yml` | Where `harness.yml` reads it, dotted. Absent: it is never committed. |
| `env` | An environment variable that outranks both files |
| `cli` | A flag name a boot's overrides carry it under |
| `path` | A path: `~` expanded and made absolute, whichever layer supplied it |
| `integer` | A positive integer |
| `oneOf` | The values it may take |
| `check` | Any other rule |
| `default` | What stands when nothing supplies a value |
| `applies` | `session` (the default: at once), `reload` (saved now, loaded next launch) or `boot` (restart) |
| `describe` | One sentence, for whoever shows it |

## Where a value comes from {#layers}

Highest first: a flag, the environment, `harness.json` (what the settings pane writes, git-ignored), `harness.yml` (committed), then the key's default. The dev pane shows the layer beside each value. A committed value a key cannot take fails the boot, naming the path; a saved one falls through to the layer beneath.

`harness.yml` is yours to edit as text; `harness.json` is written only by the platform. Secrets belong in the environment or the settings pane, never in `harness.yml`.

## Related {#related}

- [harness.yml](/harness-yml) — every key the platform declares, and when a change applies.
