---
title: "Human approval"
description: "Mark a consequential tool protected, and the framework refuses it unless the session holds a grant. The model can ask; it cannot authorise. How grants are held, given and revoked, and when a new one applies."
lede: "Let an agent propose a consequential action while only the person using the app can allow it."
---

<!--
Checked against source, 2026-09-30:
  lloyal-sdk  packages/agents/src/Tool.ts          Tool.protected
  lloyal-sdk  packages/agents/src/hooks.ts         makeFrame: auth_reject gate first, never overridable; AUTH_REJECT_MESSAGE
  lloyal-sdk  packages/agents/src/agent-pool.ts    grants read ONCE per pool at start; no store = fail-closed
  lloyal-sdk  packages/agents/src/context.ts       GrantStoreCtx
  lloyal-sdk  packages/agents/src/grant-store.ts   GrantStore { has, grant, revoke, granted }
  lloyal-sdk  packages/rig/src/grant-store.ts      createGrantStore(initial?)
  lloyal-sdk  packages/rig/src/initialize-harness.ts  creates the registry with no grant store
-->

Some tools read; some act — send a message, file a ticket, move money. Mark an acting tool **protected** and the framework refuses every call to it unless the session holds a **grant** for it. The model can request the action; only your application, on the person's behalf, can allow it. The credential behind the consent never enters the model's context.

## When to use it {#when-to-use}

| The tool | Make it |
|---|---|
| Reads or gathers — search, fetch, read a file | Open (the default). Agents discover what a source covers by trying it. |
| Changes something outside the run, or leaks data somewhere | `protected` |
| Is safe in some sessions and not others | `protected`, and grant it in the sessions where it is safe |

## Mark a tool protected {#mark-protected}

```ts label="TypeScript"
export class FileTicketTool extends Tool<{ title: string; body: string }> {
  readonly name = "file_ticket";
  readonly description = "Open a ticket in the team's tracker.";
  readonly protected = true;
  // …
}
```

Called without a grant, the call is refused before it runs, and the agent reads in its place:

```text label="What the model reads"
This action is protected and requires authorization that has not been granted for this session.
```

The refusal is traced as `tool:authReject`, with the agent's full lineage. It is the first check every call meets, and no hook or `harness.yml` override can switch it off.

## Hold the session's grants {#grant-store}

Grants live in a `GrantStore` set on `GrantStoreCtx`. The scaffolded harness sets none, so **every protected tool is refused** until you provide one — failing closed is the default. In `app.ts`, set it after `initializeHarness` and **before `useExecution()`**, so every run inherits it:

```ts label="src/app.ts"
import { GrantStoreCtx } from "@lloyal-labs/lloyal-agents";
import { createGrantStore } from "@lloyal-labs/rig";

const grants = createGrantStore();          // or createGrantStore(["file_ticket"]) to pre-grant
yield* GrantStoreCtx.set(grants);
const run = yield* useExecution();
```

`createGrantStore` keeps grants in memory for the life of the session. A harness that needs durable or audited grants implements the four-method interface itself — `has`, `grant`, `revoke`, `granted` — against its own store.

## Ask, then grant {#ask-then-grant}

Consent is your app's to ask for: a command from the surface, and a handler that records it. Hand `grants` to `article.ts` the way `app.ts` already hands it `session`.

```ts label="src/protocol.ts"
export type Command =
  // …
  | { type: "grant"; tool: string }
  | { type: "revoke"; tool: string };
```

```ts label="src/harness/article.ts"
handlers: {
  // …
  *grant({ tool }) { yield* grants.grant(tool); },
  *revoke({ tool }) { yield* grants.revoke(tool); },
},
```

::: owns
A pool reads the session's grants **once, when it starts**. A grant given while a pool is running applies to the next pool, not to the agents already working — so ask before the run that needs the action, or let the refused agent report, and run again.
:::

## Permission is not acceptance {#permission-is-not-acceptance}

A grant means the session **may** call the tool. It does not mean every proposed call should run, or that the evidence for it is sufficient. Keep the other decisions where they belong:

- **Refuse a particular call** — a guard on the tool: [Tool hooks and guards](/tool-hooks#guards).
- **Refuse to finish without evidence** — an `onReturn` hook.
- **Decide what becomes lasting state** — the one place your harness commits, as in `article.ts`.

## Related {#related}

- [Tools](/tools) — the `protected` flag beside `fanout` and `hooks`.
- [Abilities: the trust boundary](/ability-security) — why protection is structural when tools run in-process.
