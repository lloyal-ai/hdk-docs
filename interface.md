---
title: "The interface"
description: "How a view attaches to a harness: one fold of the harness's events into state, one provider over whichever bridge the surface has, and a handful of hooks — so the same React view runs on the desktop and in a browser, and the terminal folds the same events."
lede: "One fold, one provider, a few hooks — and the same view on the desktop and in the browser."
---

<!--
Checked against source and a 1.13.0 basic scaffold, 2026-09-30:
  lloyal-sdk  packages/ui/src/index.ts       HarnessProvider, useProjection, useSend, useAvailability, useRecover, useHarness, useConnection, useInstall …
  lloyal-sdk  packages/ui/src/provider.tsx   useProjection (memoized per fold), useSend, useAvailability (prefer to useConnection), useRecover
  lloyal-sdk  packages/binding/src/projection.ts  Availability = connecting | queued | warming | ready | ended | lost
  scaffold    targets/desktop/view.tsx, targets/web/main.tsx   the same HarnessProvider mount over window.harness
  scaffold    src/ui/state.ts   reduce(state, event) with foldAgents; src/ui/App.tsx  the hooks in use
  scaffold    src/protocol.ts   WorkflowEvent / Command
-->

A harness never draws anything. It emits **events** and accepts **commands**, both declared in `src/protocol.ts`. A view folds the events into state and sends commands back. Because the harness only ever sees that stream, the same program runs in a terminal, a desktop window and a browser, and the same React view serves the last two.

```text label="The seam"
harness ── events ──▶ bridge ──▶ HarnessProvider ── reduce ──▶ AppState ──▶ your view
        ◀─ commands ─        ◀────────────────────────── useSend ───────────
```

## The three parts {#the-three-parts}

| Part | File | What it is |
|---|---|---|
| The protocol | `src/protocol.ts` | `WorkflowEvent` — what the harness says; `Command` — what a view may ask. Yours, and node-free, so a view imports it without the harness. |
| The fold | `src/ui/state.ts` | `reduce(state, event) → AppState`: pure, immutable, node-free. Every surface imports this one function. |
| The view | `src/ui/App.tsx` (desktop, web), `src/ui/cli.tsx` (terminal) | Renders `AppState` and sends commands. Holds no truth, never calls the model, never reads the wire directly. |

## Mount it {#mount}

Each surface's entry is the same few lines over the bridge that surface has — IPC on the desktop, a WebSocket in the browser — already installed as `window.harness`:

```tsx label="targets/web/main.tsx"
import { createRoot } from "react-dom/client";
import { HarnessProvider } from "@lloyal-labs/ui";
import { HarnessApp } from "../../src/ui/App.js";
import { initialState, reduce } from "../../src/ui/state.js";

createRoot(document.getElementById("root")!).render(
  <HarnessProvider bridge={window.harness} initialState={initialState} reduce={reduce}>
    <HarnessApp surface="web" />
  </HarnessProvider>,
);
```

The provider owns the fold: it seeds from the bridge's snapshot, holds events until that lands, and re-seeds when the stream starts over — a reconnected socket, or a desktop engine replaced. It also puts the platform's own screens, such as the first-run installer, in front of your view.

## Read and send {#hooks}

```tsx label="src/ui/App.tsx"
import { useAvailability, useProjection, useRecover, useSend } from "@lloyal-labs/ui";

export function HarnessApp({ surface }: { surface: string }) {
  const state = useProjection<AppState, AppState>((s) => s);
  const availability = useAvailability();
  const send = useSend<Command>();
  const recover = useRecover();

  const submit = (query: string) => send({ type: "submit_query", query });
  // …render state.answer, state.roster, state.library …
}
```

| Hook | Gives you |
|---|---|
| `useProjection(select)` | A derivation of the folded state, memoized per fold |
| `useSend<Command>()` | A function that sends a command to the harness |
| `useAvailability()` | Whether the harness can take work now: `connecting`, `queued`, `warming`, `ready`, `ended` or `lost`. Prefer it to `useConnection()`, which is only the transport's half of the answer. |
| `useRecover()` | Ask the placement for a working harness again — a new connection in a browser, a new engine on the desktop — or `null` where the bridge cannot |
| `useHarness()` | The bridge itself, for what the hooks do not cover |

`queued` and `warming` are real states on a shared host: a reader may be waiting for a seat before their session starts. See [Serve to many users](/serve).

## Fold agent activity {#fold-agents}

What each agent is **doing** is the platform's to fold, so the model's own markup never reaches your state:

```ts label="src/ui/state.ts"
import { emptyRoster, foldAgents } from "@lloyal-labs/ui/fold";

export function reduce(s: AppState, ev: WorkflowEvent): AppState {
  if (isAgentEvent(ev)) {                       // the scaffold's own type guard over WorkflowEvent
    const roster = foldAgents(s.roster, ev, {
      spawn: (spawn) => spawnDecision(s, spawn),  // which agents get a timeline, and which task each is
      terminal: RIG_REPORT.tool,                  // the call that ends a turn is not a timeline row
      terminalField: RIG_REPORT.field,            // the report streams live from this argument
    });
    return { ...s, roster };
  }
  // …your own events: ready, query, answer, library …
}
```

For streaming markdown — an answer arriving token by token — `splitStreaming` from `@lloyal-labs/ui/prose` renders the finished blocks once and re-renders only the tail. It is a rendering fix for a rendering cost: never reach for a parser.

## Add an event or a command {#extend}

1. Add it to the union in `src/protocol.ts`.
2. For an event: `yield* wire.send(...)` it from the harness, and handle it in `reduce`.
3. For a command: add a handler in `src/harness/article.ts` (the loop dispatches by `type`), and `send` it from the view.

A command no handler takes is reported on the wire as *Nothing in this app handles "…"*, and the run is left alone.

::: owns
The view is a sink: it never holds truth the harness does not, never calls the model, and reaches the harness only through the provider. That is what lets one view serve two surfaces and survive a reconnect — the provider can always rebuild it from the harness's events.
:::

## Related {#related}

- [Where a harness runs](/where-a-harness-runs) — the surfaces and placements behind the bridge.
- [Serve to many users](/serve) — the host that browsers connect to.
