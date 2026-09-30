---
title: "Build with Lloyal"
description: "Build a harness, understand the execution model, govern adaptive behaviour, and program inference directly."
---

**Lloyal moves application control from the edges of a model call into the inference trajectory itself.** These guides progress from a working application, through the execution model beneath it, to adaptive policy and direct inference patterns.

![Same model, different degree of control: without Lloyal application policy acts around model calls; with Lloyal it governs reasoning while it is underway.](/assets/guides/index-01.png)

### From npx to the logits

-   [**Build your first harness**](/build-your-first-harness) — Use `lloyal-ai` to create an application, begin a Session, inspect its procedure, change its topology, and continue from accepted state. *Start here · practical tutorial*
-   [**Thinking in Lloyal**](/thinking-in-lloyal) — Learn how owned lifetimes, live inference state, Agents, Tools, orchestration, finality, and continuity fit together — and the advanced patterns they compose into. *Mental model · programming guide*
-   [**Continuous Context**](/continuous-context) — Keep the execution rather than rebuilding it from a transcript, so specialists inherit the live case instead of a summary handed down. *Execution continuity · programming guide*
-   [**Abilities**](/abilities) — Install a capability that reads the calling agent’s live state, forks it, spawns agents that inherit it, and can require the harness to load another model. *Extension format · capabilities*
-   [**Services**](/services) — Composition of models: one reasoning model and, beside it, every model an agent’s work needs — named once in `harness.yml`, read with one call from an ability or a harness, refused by name. *Composition of models · capabilities*
-   [**Adaptive compute**](/agent-policy-and-context-pressure) — Allocate compute across a running AgentPool, and prune whole branches on judgement instead of compacting the context window. *Adaptive compute · engineering note*
-   [**Focus**](/focal-lens) — Decide what earns a place in a context already spoken for. A question you write, answered per candidate, admitted verbatim. *Context admission · engineering note*

### Recommended learning path

Build your first harness → Thinking in Lloyal → Continuous Context → Abilities → Services → Adaptive compute → Focus

### One harness, different placements

[**Where a harness runs**](/where-a-harness-runs) — Understand how one harness contract spans application surfaces, local and shared-residency execution, process boundaries, transports, hardware, and operators—using the familiar Rails architecture as the bridge.

*Surfaces · bindings · local edge · shared residency · placement choices*

### Continue into the platform

-   [lloyal-ai CLI](https://www.npmjs.com/package/lloyal-ai)
-   [Lookup](/lookup)
-   [harness.yml](/harness-yml)
-   [Abilities catalogue](https://apps.lloyal.ai/)
-   [HDK source](https://github.com/lloyal-ai/hdk)
-   [Agent runtime](https://www.npmjs.com/package/@lloyal-labs/lloyal-agents)
