---
title: "Changelog"
description: "Public-API renames and removals. Append-only — when a name changes in @lloyal-labs/* it lands here so docs and downstream code don't accumulate stale references silently."
---

This page tracks renames, removals, and notable shape changes in the public API surface of `@lloyal-labs/lloyal-agents`, `@lloyal-labs/sdk`, and `@lloyal-labs/rig`. New entries are appended at the top.

## v3.0 — `loadBundle` resolves by name (pre-launch breaking change)

`loadBundle`'s signature changed from `(url, manifest, { trustRoots })` to `(name, { semver })`. Trust roots and catalog URL moved from harness-supplied runtime arguments into compile-time constants in `@lloyal-labs/rig/src/protocol.ts`: `CHANNEL_CATALOG_URL` (`https://apps.lloyal.ai/v1/catalog.json`) and `CHANNEL_TRUST_ROOTS` (Lloyal platform Ed25519 keys — single active key with additive rotation slots for compromise recovery).

What changed:

- `loadBundle(name, { semver })` resolves the requested name against the canonical catalog at `apps.lloyal.ai`, verifies catalog and bundle signatures against `CHANNEL_TRUST_ROOTS`, and returns an `AppFactory`.
- §8.2 first-party build-time inclusion is unchanged: harness vendors bundling Apps they own from a private source still hand factories directly to `createAppRegistry({ apps: [...] })`.
- Catalog format at `https://apps.lloyal.ai/v1/catalog.json`: `{ signedAt, entries: [{ name, versions: [{ version, manifestUrl, bundleUrl, appProtocolVersion, sizeBytes }] }], publisherKeyId, signature }`. Catalog signature (canonical JSON over `{ signedAt, entries, publisherKeyId }`) verified before name resolution; per-bundle signatures verified before dynamic import. Both signatures are produced by the Lloyal platform key — publishers do not sign; Lloyal signs after review.
- `LoadBundleOptions` interface removed from the public surface. Tests inject test values via internal `setTestTrustRoot()` / `setTestCatalogUrl()` helpers in `bundle.ts`, active only when `NODE_ENV === 'test'`.

Migration:

- Any harness calling `loadBundle(url, manifest, { trustRoots })` now calls `loadBundle(name, { semver })`.
- [`harness.dev install <publisher>/<short>[@<semver>]`](/cli/installing) (in `harness.dev@0.4.0`) fetches, signature-verifies, and `npm install`s a signed app from the channel.
- [`harness.dev publish`](/cli/publishing) (in `harness.dev@0.4.0`) packages an app via `npm pack` and submits it to the channel for review + signing. See [`harness.dev publishers register`](/cli/publishers) for the one-time handle claim.

See [Distribution](/build-an-app/distribution) for the mechanics.

## v3.0 — App protocol (HDK 3.0)

The largest architectural change since v0.1. The framework now ships a first-class **App protocol** — a packaged capability unit (Source + Tools + skill + manifest) that a harness loads via a registry — and the App protocol is codified as a bytes-locked surface in `protocol.ts`. Anchored to `APP_PROTOCOL_VERSION = '3.0'` (hence the version label; `@lloyal-labs/*` package versions continue on their own line). Reasoning.run is the canonical reference harness; `@lloyal-labs/web-app` and `@lloyal-labs/corpus-app` are the two reference Apps.

The era added: the App protocol itself, dispatch-time authorization (`Tool.protected` + `authGuard` + `GrantStore`), the recon pre-flight stage, a reranker calibration regression-and-fix (softmax → logit-diff), per-App `skill.eta` prompts (retiring the harness's `web-worker.eta` / `corpus-worker.eta`), Effection-native lifecycle for the registry + reranker, and the runtime primitives for a future signed-bundle distribution channel.

### Renames within 3.0 (pre-launch vocabulary unification)

Before public launch, the framework's internal vocabulary was unified from "App contract" → "App protocol" across the entire stack. This is a single forward-only break — there is no installed base to migrate. Downstream consumers picking up 3.0 see only the new names; the old names never appeared in a released version. Specifically:

- **File**: `packages/rig/src/contract.ts` → `packages/rig/src/protocol.ts`.
- **Exported constants**: `MODEL_CONTRACT_VERSION` → `APP_PROTOCOL_VERSION`; `SUPPORTED_MODEL_CONTRACT_VERSIONS` → `SUPPORTED_APP_PROTOCOL_VERSIONS`.
- **TypeScript interface**: `AppContract` → `AppProtocol`.
- **Manifest field**: `AppManifest.contract` → `AppManifest.protocol` (TypeScript) and `"contract": {...}` → `"protocol": {...}` (`app.json`).
- **Manifest version field**: `modelContractVersion` → `appProtocolVersion` (TypeScript + `app.json`).
- **Model-facing bytes** (rendered into every spawn's prompt): `Apply the **<name>** contract.` → `Apply the **<name>** protocol.`; `grouped by contract` → `grouped by protocol`; `which contract to apply` → `which protocol to apply`; `# Contracts` header → `# Protocols`.

Why: "contract" overloaded with legal-contract reading (royalty / obligation) in public-facing licensing copy and clashed with MCP-style "protocol" vocabulary now standard in the AI-agent-infrastructure category. "Protocol" matches what the bytes actually are — the wire format the runtime speaks with Apps and the model. See the [licensing FAQ](/licensing/faq) for the related FSL relicense.

### The App protocol

- **NEW: `defineApp(spec): App`** (`@lloyal-labs/rig`). Sync wiring + validation: manifest schema, App protocol version, tool-map coverage, boundary-marker double-emission, `useWhen` sanitization. Throws synchronously on a bad spec.
- **NEW: `AppManifest`** declared in `app.json` (per-App). Fields: `name`, `appProtocolVersion`, `protocol: { name, useWhen, tools[] }`, optional `configSchema`. (The App's *published* version comes from `package.json.version` — `app.json` is the protocol-author surface, `package.json` is the npm surface.)
- **NEW: `AppFactory = () => Operation<App>`**. The App's own constructor; runs in a detached scope the registry provides. Setup is the factory body; teardown is `ensure(...)`. **No install/uninstall hooks** — see "Lifecycle as scope" below.
- **NEW: `createAppRegistry({ configStore, grantStore?, apps? })`** (`@lloyal-labs/rig`). Harness-wide registry. Declarative boot set + dynamic `enable` / `disable`. Per-app detached scope; reverse-register-order teardown on registry scope exit; best-effort (a throwing teardown never strands a sibling). Sets `AppRegistryCtx` + `AppConfigStoreCtx` (+ `GrantStoreCtx` if provided) on the caller's scope.
- **NEW: `AppRegistry` interface** — `byName`, `installed()` (readonly App[] in register-order), `stateOf` (`'enabled' | 'disabled'`), `enable(factory)`, `disable(name)`.
- **NEW: `AppState = 'enabled' | 'disabled'`** — two states, no half-life. A throwing factory tears down its partial scope and propagates; the App never enters the registry. A throwing teardown is swallowed + logged.
- **NEW: `APP_PROTOCOL_VERSION = '3.0'`** + **`SUPPORTED_APP_PROTOCOL_VERSIONS = ['3.0']`** + **`VALIDATED_MODELS_3_0`** (`@lloyal-labs/rig/protocol`). Registry refuses an App whose declared `appProtocolVersion` isn't supported.

### The bytes-locked App protocol

- **NEW: `protocol.ts` — five exports** that constitute the *entire* shape of the model-facing surface (every framework-rendered byte the model sees traces here):
  - `BOUNDARY_MARKER(name)` → `Apply the **<name>** protocol.\n\n` — prefixes every per-spawn user message.
  - `FRAMEWORK_INTRO` — the spine's opening paragraph.
  - `CATALOG_ENTRY(name, tools[], useWhen)` — per-App block under `# Protocols`.
  - `TOOL_SELECTION_RULE` — model's routing rule across enabled Apps.
  - `VALIDATED_MODELS_3_0` / `APP_PROTOCOL_VERSION` / `SUPPORTED_APP_PROTOCOL_VERSIONS` — model fleet + version gating.
- **NEW: `renderSpine({ apps })`** + **`renderAgentPreamble(app, ctx)`** (`@lloyal-labs/rig`). Pure render functions — spine assembles intro + catalog + selection rule; preamble prepends the boundary marker + renders the App's `skill.eta` (+ optional `examples.eta`).
- **NEW: `Source.promptData()`** (and corpus `CorpusPromptData`). The per-App content advert read by `skill.eta` (corpus surfaces TOC; web returns `{}`).

### Authorization: `Tool.protected` + `authGuard` + grants

- **NEW: `Tool.protected?: boolean`** (`@lloyal-labs/lloyal-agents`). Open by default (read tools); `true` marks consequential ops (writes, sends, exfiltration-capable reads).
- **NEW: `authGuard`** wired at the agent pool's DISPATCH phase. Denies a protected tool call unless the session holds a grant for it. Emits `tool:authReject` carrying agent lineage (`walkAncestors`).
- **NEW: `GrantStore` interface** + **`GrantStoreCtx`**. `has(toolName)` / `grant(toolName)` / `revoke(toolName)` / `granted()`. Binary per tool; fail-closed (no `GrantStoreCtx` set ⇒ every protected tool denied). The credential never enters the model's context.
- **NEW: `createGrantStore()`** (`@lloyal-labs/rig`). Default in-memory implementation.
- **REMOVED: `scope_reject`.** The previous per-agent app-scope restriction is retired. Read tools are open across all enabled Apps (the planner's `app` field is a soft routing hint, not a tool lock); only `protected` tools are gated, and via grants rather than scope.

### Retrieval calibration: softmax → logit-diff (regression + fix)

A pathology investigation in reasoning.run (the "TLS handshake → HDK chunk scores 0.999" failure mode) traced miscalibration to the score formula itself:

- **Rerank.\_rerankScore: `P(yes | yes_or_no)` (softmax) → `logit(yes) − logit(no)` (logit-diff).** Range becomes unbounded; sign carries meaning (positive ⇒ relevant); magnitude carries confidence. Saturation eliminated (top-5 stddev rose ~0.05–0.5 → 2.5–6.5 on the calibration fixture).
- **`Source._entailmentFloor`: default `0.25` → `0`.** Now expressed in logit-diff space ("model leans yes"). Subclasses can tighten (`2` for "confident yes") or loosen (negative for sparse data).
- **NEW: `SearchTool` envelope** (`@lloyal-labs/corpus-app/tools/search.ts`). Returns `{ hits, thresholdScore, totalScored, topRejected }` instead of a raw top-K array. Sub-floor hits drop to `topRejected` only when nothing passes — gives the agent an honest "best I could find but the model said no" signal instead of feeding garbage as evidence.
- **Calibration probe shipped** at `reasoning.run/scripts/inspect-rerank.mjs` — median(relevant) − median(irrelevant) on the fixture moved `0.0453 → 3.66` (×80).
- **Unchanged:** the `EntailmentScorer` interface (4 methods) and the three-queries model (tool query / agent task / original query).

### Recon stage + coverage memo

- **NEW: `runPreflight(query, session)`** (reasoning.run). Pre-planner reconnaissance: one agent per enabled App probes its source for the query's entities; joined prose coverage feeds the planner's per-task `app` routing.
- **NEW: `ReconPolicy`** (subclass of `DefaultAgentPolicy` with `shouldExit` turn-cap). Preempts the soft-nudge loop; force-kill triggers `recoverInline` with a `PREFLIGHT_RECOVER` prompt.
- **NEW: `useCoverage(query, session)`** + **`CoverageCache` resource** + **`CoverageCacheCtx`** (reasoning.run/harness.ts). Memoizes preflight per `(query, installedApps)` so a clarify-answer or `change_mode` re-invocation of `runQuery` reuses the probe instead of running it a second time. Cache lives at the boot scope; a `/model` or `/reranker` restart unwinds and rebuilds it.
- **Per-App TOC surfaced into recon** (TICK-005). `runPreflight` threads `app.source.promptData()?.toc` into the per-app probe's `skill.eta` `Contents` block so the agent recognizes "the corpus *is* the HDK docs" before probing.

### Worker prompts moved into Apps

- **REMOVED from harnesses:** `web-worker.eta`, `corpus-worker.eta`.
- **NEW per-App:** `skill.eta` — the per-spawn agent preamble. Lives in the App package; `defineApp` reads it; `renderAgentPreamble` renders it after the boundary marker. Each App owns the prompted skill for using its own tools.
- **NEW: `defineApp` skill validation.** A string-typed `skill` MUST NOT contain the literal `Apply the **` substring (the framework prepends the marker via `BOUNDARY_MARKER`; carrying that line would emit it twice).

### Effection-native lifecycle

- **`createReranker` migrated to `resource()` shape.** Tied to scope; teardown deterministic via `provide` + `ensure`.
- **Per-app detached scopes** in the registry. `createScope()` + `scope.run()` per factory + a `suspend()` between construction and `destroy()`. App teardown errors never propagate to the caller's scope.
- **No lifecycle hooks on `App`.** Setup is the factory body. Teardown is `ensure(...)`. The registry handles the rest via scope-halt on its own scope exit.

### Distribution primitives (channel-canonical)

- **NEW: `loadBundle(name, { semver }): AppFactory`** + **`verifyBundle(bytes, sig64, publicKey)`** + **`BundleVerificationError`** (`@lloyal-labs/rig/bundle.ts`). Resolves names against the canonical catalog at `apps.lloyal.ai`; verifies catalog + bundle signatures against framework-vendored `CHANNEL_TRUST_ROOTS`; dynamic ESM import; returns the bundle's factory ready for `registry.enable`. URLs and trust roots are compile-time constants in `protocol.ts` — the harness cannot override.
- **NEW: `CHANNEL_CATALOG_URL` + `CHANNEL_TRUST_ROOTS` constants** in `@lloyal-labs/rig/src/protocol.ts`. The structural-binding mechanism: to use a different channel, fork rig and patch the constants.
- **NEW: `harness.dev` CLI package + dispatcher.** Released as `harness.dev@0.4.0`. Commands: default-scaffolder (`harness.dev <name>`), `app` (app scaffolder), `publishers register` + `me` (publisher account claim + inspection), `publish` (submit app for review + signing via `npm pack` → quarantine queue), `publish status <id>` (poll submission state), `install <publisher>/<short>[@<semver>]` (fetch + signature-verify + `npm install`). Full reference: [CLI](/cli).

### Config + ConfigFlow

- **NEW: `AppConfigStore` interface** + **`createInMemoryConfigStore()`** (`@lloyal-labs/rig`). Per-app config, keyed by App `manifest.name`. Set on `AppConfigStoreCtx` by the registry.
- **NEW: `ConfigFlow`** on `DefineAppSpec`. Optional interactive credential/setup flow an App can declare; the harness drives it (OAuth-style handoff, prompt for secrets) and captures the result via the GrantStore + ConfigStore.
- **`x-secret: true`** marker on `configSchema` properties — flags credentials so the harness can route them to a secret store rather than printable config.

### Web App: keyless provider

- **NEW: `createKeylessSearchProvider()`** (`@lloyal-labs/rig`). DuckDuckGo-backed `SearchProvider` (Effection-friendly, with pacing + circuit-breaker) used by `createWebApp` when no `tavilyKey` is configured. `TavilyProvider` remains the keyed path.

### Scope-guard retired, replaced by authGuard

- **REMOVED: scope-guard / `scope_reject`** dispatch-time guard. Was per-agent app-scope restriction; replaced by authGuard which gates on `Tool.protected` + GrantStore rather than per-agent scope.
- **Tests migrated:** `packages/agents/test/scope-guard.test.ts` → `authGuard.test.ts`.
- **Reasoning.run:** `assignedApp` is now a soft routing hint surfaced in the recon agent's per-spawn preamble + the plan-review UI; not a tool lock.

### Why

The era split the framework's previously-monolithic "harness" concept into two roles: **harnesses** (the razor — what a developer ships to users) and **Apps** (the blades — packaged capabilities a harness loads at runtime). The split is what makes a third-party Apps ecosystem possible without third parties having to fork the harness. With that split, in-process App loading needs a structural trust boundary (the prompt itself becomes the boundary, since there's no process boundary) — hence `defineApp`'s metadata sanitization, `Tool.protected` + `authGuard` for consequential actions, and the bytes-locked `protocol.ts` constants the model is the only thing free to interpret.

The reranker calibration fix is independent but landed in the same era. The pathology was visible from production traces (logit gaps compressed to extreme probabilities saturated top-K ordering and surfaced irrelevant chunks as `0.999` matches); the logit-diff change preserves the underlying model's signal without imposing softmax's saturation. The empirical floor — calibrated to `0` — corresponds to "model leans yes," which is the right gate for retrieval honesty.

The recon stage exists because multi-App routing without ground truth is hallucination-prone: a planner asked to decide which App covers what without per-App probing will guess wrong, often. The CoverageCache memo (TICK-004) closes the obvious "running recon twice on clarify" wart with an idiomatic Effection `resource()` + context — not a flag.

## v0.4 (2026-05-16)

Agent termination vocabulary renamed from "report" to "return" — framework-internal only. **The model-facing protocol is unchanged**: the model still emits standard `<tool_call>{"name": "report", "arguments": {"result": "..."}}</tool_call>` syntax via the same chat-parser pipeline. The rename touches the framework's *internal* names for what was happening: an agent emitting a terminal value is a *return*, not a *report*. The new vocabulary is domain-neutral (works for code-generation, planning, classification agents — not just research) and matches the function-call execution model the runtime already follows.

Ships in the same npm release as v0.3 (no version bump between the two; both renames consolidate into `@lloyal-labs/lloyal-agents@2.1.0`, `@lloyal-labs/sdk@2.1.0`, `@lloyal-labs/rig@2.1.0`).

### Renames

- **`agent:report` event → `agent:return` event.** Fires only for voluntary completion (the model called the terminal tool). See behavior split below.
- **NEW event `agent:recovered`** (no predecessor — split out from the prior conflated `agent:report`). Fires when recovery extraction salvaged findings from a killed agent.
- **`{ type: 'report' }` policy action → `{ type: 'return' }`.**
- **`{ type: 'free_text_report' }` policy action → `{ type: 'free_text_return' }`.**
- **`handleReport(...)` → `handleReturn(...)`** + **`handleFreeTextReport(...)` → `handleFreeTextReturn(...)`** (framework-internal handlers).
- **`pruneOnReport: boolean` option → `pruneOnReturn: boolean`** (on `AgentPoolOptions`, `CreateAgentPoolOpts`, `useAgent`).
- **`'report_tool'` ResultSource literal → `'voluntary_return'`.**
- **`agent.reportResult(value, source)` setter → `agent.setResult(value, source)`.** "Return" describes the act; "result" stays as the noun for the data.
- **`pool:recoveryReport` trace event → `pool:recoveryReturn`.**
- **`terminalTool: string` option field → `terminalToolName: string`.** It's a name pointer into the toolkit (matched against `parsedToolCall.name`), not a Tool instance. The rename makes the field's semantic explicit.
- **`PolicyConfig.terminalTool` and `DefaultAgentPolicyOpts.terminalTool` → `terminalToolName`.**
- **`DefaultAgentPolicyOpts.minToolCallsBeforeReport` → `minToolCallsBeforeReturn`.**
- **`IdleReason: 'reported'` → `'returned'`.**

### Behavior change: voluntary vs recovery split

Previously `agent:report` fired for BOTH voluntary completion (via `handleReport`) AND recovery extraction (via `recoverInline`). Consumers couldn't tell apart "agent voluntarily produced this value" from "framework salvaged a value from a killed agent."

After the rename:

- **`agent:return`** — fires only when the model voluntarily called the terminal tool and `handleReturn` ran. `ResultSource` = `'voluntary_return'`.
- **`agent:recovered`** — fires only when `recoverInline` extracted findings via grammar-constrained generation after the agent was killed. `ResultSource` = `'scratchpad'`.
- Both still populate `agent.result` and fire `agent:done` for lifecycle.

**Consumer migration:** code that previously listened for `agent:report` to capture any agent's value should subscribe to BOTH `agent:return` and `agent:recovered` (or to `agent:done` and read `agent.result` directly). The lloyal-sdk examples and reasoning.run use case-fall-through (`case 'agent:return': case 'agent:recovered': { ... }`) to preserve the prior union semantics.

### What stayed the same

- **`reportTool` exported from `@lloyal-labs/rig`** — research-domain helper. The harness imports it and assigns `terminalToolName: 'report'`. The string `'report'` as a tool name is the harness's choice; other domains can choose `'submit_code'`, `'plan'`, etc.
- **The model-facing protocol.** The model still sees a tool named whatever the harness chooses (typically `'report'`), still emits standard `<tool_call>...</tool_call>` syntax via llama.cpp's native chat parser. Nothing about generation behavior changes.
- **`agent.result`, `agent.resultSource`** field names — the noun stays; only the act renames.
- **`agent:tool_call` event** — still fires for terminal-tool calls (the model emitted a parsed tool call from its POV; the interception happens at the policy layer, not the event layer).
- **`agent:done`** — lifecycle event, always fires.
- **`'free_text'`, `'scratchpad'`, `'tool_error'`, `'nudge'`** ResultSource literals — unchanged.

### Why

The internal vocabulary echoed the model's tool-call mental model when it should have described what was happening. "Report" carries a domain assumption (research findings); "return" describes the *semantic* (function exit with value) and works for any agent regardless of what it produces. The split between voluntary and recovery makes the framework honest about *how* a value was obtained — both paths produce `agent.result` but only one is the model's own work.

### Spine toolkit unification

- **`SpineOptions.toolsJson: string` → `SpineOptions.tools: Tool[]`.** `withSpine` now accepts the same `Tool[]` shape as `agentPool({ tools })`. Schema decoding (`createToolkit`) happens inside `withSpine`; callers pass tools as tools, not as pre-serialized JSON.

Before:

```typescript
const toolkit = createToolkit(tools);
yield* withSpine(
  { systemPrompt, toolsJson: toolkit.toolsJson },
  function*(spine) {
    return yield* agentPool({ orchestrate, tools, parent: spine, ... });
  },
);
```

After:

```typescript
yield* withSpine(
  { systemPrompt, tools },
  function*(spine) {
    return yield* agentPool({ orchestrate, tools, parent: spine, ... });
  },
);
```

`createToolkit` is still exported for callers who need a pre-built `{ toolMap, toolsJson }` directly (custom dispatchers, sub-toolkits inside delegate tools). The `agentPool({ tools })` field is unchanged — it remains explicit so the reader sees tools at both the prefix-share layer (`withSpine`) and the dispatch layer (`agentPool`).

Why: the prior asymmetry (`toolsJson` on `withSpine`, `tools` on `agentPool`) leaked an implementation detail (the model-facing JSON schema string) into a layer whose job is "give me your tools." Two arguments named `tools` and `toolsJson` invited the question "why pass tools to both?" — the new shape answers it: tools at the spine for schema decoding into shared KV, tools at the pool for runtime dispatch. Same input shape, two consumers.

## v0.3 (2026-05-16)

Pool-anchor API renamed to "spine" terminology. The agents-package internals already used `spine` consistently (`spine:extend` trace event, `extractSpineCheckpoint`, "spine extension" in orchestrator docs); this aligns the public surface with that vocabulary.

- **`withSharedRoot` → `withSpine`.** The function name was misleading on the cold path (no parent, no `systemPrompt` → nothing "shared"). `withSpine` describes what it creates.
- **`SharedRootOptions` → `SpineOptions`.** Body callback signature changes from `(root, sharedPrefixLength)` to `(spine, prefixLength)`.
- **`PoolContext.root` → `PoolContext.spine`** and **`PoolContext.extendRoot` → `PoolContext.extendSpine`.**
- **`AgentPoolOptions.root` → `AgentPoolOptions.spine`.**
- **`RootFmt` (Effection context) → `SpineFmt`.** Context id string `'lloyal.rootFmt'` → `'lloyal.spineFmt'`.
- **Replay primitives:** `extractRootCheckpoint` → `extractSpineSeed`; `BranchCheckpoint.rootPrompt` → `BranchCheckpoint.seedPrompt`. `extractSpineCheckpoint` and `reconstructBranch` keep their names.
- **Trace event role strings:** `role: 'sharedRoot'` → `role: 'spine'`; `role: 'sharedPrefix'` → `role: 'spineHeader'`. The `spine:extend` event type was already correctly named.
- **File rename in the agents package:** `packages/agents/src/shared-root.ts` → `packages/agents/src/spine.ts`.

Why: the SDK's `Branch.create(ctx, 0)` returns a "root branch" in the KV-topology sense (parent === null, position === 0), but the agents-package "root" was something else — the pool's spine anchor, which on the warm path is a fork of the caller's parent and therefore not topologically a root at all. Reserving "root" for the SDK meaning and using "spine" for the pool meaning gives a clean three-noun taxonomy: `Session.trunk` (across-turn line) → pool `spine` (within-pool extensible line) → agent `branch` (per-agent fork).

Old `.jsonl` traces written with `role: 'sharedRoot'` / `'sharedPrefix'` will not round-trip through the renamed replay primitives. Acceptable per the no-backward-compat rule.

## v0.2

- **`spawnAgents()` removed.** Pool orchestration moved to a callback interface. Use `agentPool({ orchestrate: ... })` or `useAgentPool({ orchestrate: ... })` instead. The `orchestrate` argument accepts an `Orchestrator = (ctx: PoolContext) => Operation<void>` — typically one of the built-in combinators (`parallel`, `chain`, `fanout`, `dag`, `dagWithEvents`).
- **`PoolContext` introduced** as the orchestrator-facing API: `spine`, `spawn()`, `waitFor()`, `extendSpine()`, `canFit()`. Custom orchestrators are now ~10–30 line implementations of the `Orchestrator` shape.

## v0.1

- **`Source` decoupled from orchestration.** Sources now expose data-access tools and chunks (`tools`, `bind`, `getChunks`); the harness drives orchestration via `agentPool()`. A source no longer owns prompts, recursion shape, or policy.
- **`Agent` stabilized as first-class API.** Internal `AgentState` shape is no longer exported; introspect via the `Agent` class (`status`, `result`, `branch`, `traceBuffer`, `currentTool`).
- **`useAgent` / `useAgentPool` introduced** as the dual resource layers; `agent()` is a convenience alias for `useAgent()` with N=1.

## How to use this page

When you see a name in older code or docs that doesn't appear in `@lloyal-labs/*/src/index.ts`, check here first. If it's not listed, the name is either current or was renamed before this changelog began — open an issue.

For the canonical export list, see the package README or generated typedoc. This page is curated, not exhaustive: it focuses on names that downstream code likely references.
