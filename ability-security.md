---
title: "Security model"
description: "Abilities run in-process with the model, so the trust boundary is the prompt itself: the three attacks that follow — catalogue escape, cross-ability injection, unauthorised writes — and the defences built into the contract."
lede: "Abilities run inside your process and speak into your model's context. Here is what that makes possible, and what stops it."
---

## The trust boundary is the prompt {#security}

Abilities run **in-process** with the model. That is the performance story — no IPC, no serialisation on the hot tool path, one shared spine across many agents — and it is also the security story: with no process boundary, the trust boundary becomes the prompt itself.

### Three attacks {#three-attacks}

1.  **Catalogue escape.** An Ability-supplied string interpolated into the shared spine could carry a newline, a fake role marker, or a code fence — convincing the model the catalogue has ended and the prompt is now elsewhere.
2.  **Cross-ability injection.** Abilities share one prompt surface. A web page fetched by one Ability could contain text instructing the model to call another Ability's tool.
3.  **Unauthorised writes.** A model may decide to call a write tool because of a planning mistake or an injected page. It must not be able to perform the write without the session — not the model — having consented.

### The defences {#the-defences}

**An Ability writes into the model’s attention, so what it may say is fixed before it runs.** Metadata is grammar-constrained at definition time. Names match a strict pattern; `useWhen` is length-bounded and rejects role markers, code fences and newlines; the skill may not re-emit the boundary marker; tool names must match the manifest exactly. These checks throw synchronously, so a malformed Ability never enters the registry, and the worst case is a rejected Ability rather than a compromised spine.

**Every per-spawn message is prefixed with a boundary marker** naming the protocol in force, so instructions arriving through fetched content are read as content inside a discipline rather than as a new instruction frame.

**Sensitive tools are marked `protected`** and require session-level consent. The model can request; it cannot authorise.

## Related {#related}

- [Human approval](/human-approval) — protected tools and grants.
- [Publish and install](/publish-and-install) — the signed channel.
