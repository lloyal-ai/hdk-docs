---
title: "CLI reference"
description: "Every lloyal-ai command: scaffold a harness or an ability, manage models, surfaces and GPU backends, ship a macOS app, and install or publish signed abilities — with each command's options."
lede: "Every command, what it writes, and its options."
---

<!--
From the CLI's own usage text, lloyal-ai 1.13.0 (lloyal/src/cli.ts and src/commands/*.ts), 2026-09-30.
link-local / unlink-local are development-only and not listed; `review` is Lloyal-internal.
-->

Run any command with `npx lloyal-ai <command>`, or install it once — `npm i -g lloyal-ai` — and the command is `lloyal`. Every command takes `--help`; `lloyal --version` prints the version.

## Scaffold {#scaffold}

### `new` {#new}

```sh label="Terminal"
lloyal new                         # interactive: name → targets → model → template
lloyal new <name> [options]
```

| Option | Does |
|---|---|
| `--template <basic\|research>` | The starting point. `basic` (default): a Wikipedia research app. `research`: the grounded multi-agent research pipeline. |
| `--targets <list>` | Comma-separated surfaces to keep (default `cli,desktop,web`). `cli` is always included. |
| `--model <id\|path>` | The reasoning model: a catalog id, or a path to a `.gguf` you have |
| `--dir <path>` | The parent folder to create it in (default: here) |
| `--backend-pack <download\|skip>` | On an NVIDIA machine: fetch the CUDA backend pack where the GPU needs it, or stay on the CPU |
| `--skip-install` | Do not run `npm install` (it runs by default in a terminal) |
| `--skip-abilities` | Do not fetch the template's default Ability. The project will not typecheck or run until you install it. |
| `-y`, `--yes` | Skip the picker; take the defaults for anything not given |

Flags you pass pre-fill the picker, so it asks only for what is missing.

### `ability:new` {#ability-new}

```sh label="Terminal"
lloyal ability:new <name> [--dir <path>] [--publisher <handle>]
```

A working Ability — a manifest, a source, search and fetch tools against Wikipedia's public API, its tests — ready to `npm install && npm run build`. Replace the tool bodies with your backend. See [Build an ability](/build-an-ability).

## Models {#models}

In a project. `--role` is `llm` (default), `reranker`, `vision` or `embedding`.

| Command | Does |
|---|---|
| `models:list` | The catalog, what `harness.yml` pins, and what is on disk |
| `models:use <id> [--role]` | Pins a catalog model: writes `model.<role>.id`. Fetched and verified on the next run. |
| `models:add <path> [--role]` | Registers a `.gguf` you have: writes `model.<role>.path`. Trusted because you have it. |
| `models:download <url> [--role] [--sha256 <hex>]` | Streams a `.gguf` into `models/<role>/` and pins it as its path. With `--sha256`, a mismatch deletes it and fails. |

See [Models](/models).

## Surfaces {#targets}

In a project.

| Command | Does |
|---|---|
| `targets:list` | The surfaces present |
| `targets:add <desktop\|web>` | Copies a surface back from the template the project came from |
| `targets:remove <desktop\|web> [--yes]` | Deletes a surface and its scripts, dependencies and build entries. Asks first; `--yes` skips the question. |

## GPU {#backends}

```sh label="Terminal"
lloyal backends:install [--yes]
```

In a project, on Linux x64 with an NVIDIA GPU: probes the GPU, driver and CUDA runtime, says what it found, and on a yes downloads the signed CUDA backend pack into `~/.cache/lloyal/backends/`, once per lloyal.node version. Then writes `model.llm.gpu: cuda`. `--yes` answers for deploy scripts.

## Ship {#ship}

```sh label="Terminal"
lloyal ship [--notarize]
```

In a project, on macOS: builds the desktop surface and packages it as a disk image in `release/`. Without `--notarize` the image is unsigned and opens only on the Mac that built it; with it, it is signed with your Developer ID, notarized and stapled. The first run records an application id (and an icon) in `harness.yml`. Credentials come from the environment or `.env.local`:

| Variables | For |
|---|---|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | A Developer ID Application `.p12` (base64) and its password — on CI |
| `APPLE_KEYCHAIN_PROFILE` | A stored `notarytool` profile — keeps the secret in the keychain |
| `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | An App Store Connect key, to notarize |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | The same with an Apple ID — last resort |

See [Ship a desktop app](/ship).

## Abilities and the channel {#abilities}

### `install` {#install}

```sh label="Terminal"
lloyal install [--allow-scripts] <publisher>/<name>[@<semver>]
```

Installs a signed Ability from apps.lloyal.ai: verifies the catalog, the manifest and the tarball's Ed25519 signature and sha512, writes the verified tarball to `vendor/`, points `package.json` at it with a `file:` dependency, and runs `npm install --ignore-scripts`. Commit `vendor/` and `npm ci` reproduces it offline. `--allow-scripts` lets the package's install hooks run — the signature vouches for the bytes' provenance and review, not for arbitrary scripts.

### `publishers` {#publishers}

```sh label="Terminal"
lloyal publishers register --handle <handle> [--yes]
lloyal publishers me
```

Claims a publisher handle and accepts the [publisher terms](/licensing/publisher-tos) — once per identity. Handles are first come, first served; `lloyal` is reserved. Your abilities are then `<handle>/<name>`.

### `publish` {#publish}

```sh label="Terminal"
lloyal publish [--dir <path>]
lloyal publish status <submissionId>
```

Packs the Ability in `--dir` (default: here) and submits it for review. It waits in quarantine until Lloyal review approves it; only then is it signed and listed. Sign-in opens a browser the first time; CI uses `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. See [Publish and install](/publish-and-install).
