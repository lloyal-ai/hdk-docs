---
title: "Continuous Context"
description: "The KV physics of agent forking — what a fork costs, what prune frees, how the spine propagates attention state through pools, delegation, and sessions."
---

**A sub-agent's first token attends over every token its parent ever decoded — for a turn separator's worth of prefill.**

When an agent that has searched, fetched, and reasoned calls `web_research`, its sub-agents fork from its branch. Everything the parent decoded is physically present in their KV cache at its original positions:

```
Session trunk (prior conversation, if warm)
  ↓ fork
Spine (system prompt + tool schemas — decoded once)
  ↓ fork
Agent A (task: "survey voice agent architectures")
  position 0-100:   spine prefix
  position 100-300: Agent A's suffix (system+user prompt)
  position 300-500: web_search result (prefilled via SETTLE)
  position 500-700: fetch_page result (survey article)
  position 700-750: Agent A's reasoning about what it read

  Agent A calls web_research(["Moshi architecture", "Sesame prosody"])
  ↓ fork (warm path — only a turn separator prefilled)

  Inner spine (forkHead=750, position=752)
    ↓ fork × 2

    Sub-agent B (task: "Moshi architecture")
      Attends over positions 0-752 (the entire spine)
      Searches "Moshi" with vocabulary from the survey already in attention

    Sub-agent C (task: "Sesame prosody")
      Attends over positions 0-752 (same spine)
```

Sub-agents B and C never re-search "voice agent architectures." The survey is at positions 500–700 in their KV — every `produceSync()` attends over it. No re-encoding, no summary handoff — the parent's attention state **is** their starting context. This page is the physics: what fork costs, what prune frees, how the prefix is shared, and the three spine lifetimes that compose.

This page documents `spine.ts` and the fork/prefill paths of `agent-pool.ts` in `@lloyal-labs/lloyal-agents`, over `Branch`/`BranchStore` from `@lloyal-labs/sdk`.

## Physical mechanics

### Fork is metadata-only

`Branch.forkSync()` calls `llama_kv_self_seq_cp()` under the hood — it does not copy KV tensors. It tags the existing KV cells (which hold the parent's key/value vectors) with a new sequence ID. Multiple branches read the same physical memory up to the fork point; only tokens decoded after it write cells exclusive to the child.

```
KV cache layout after 3 forks:

Position:  0 ─────────── N ──────── N+M₀
           │ spine │ agent 0  │
           │ (seq 0,1,2,3)│ (seq 1)  │
           └──────────────┘          │
                          │ agent 1  │ N+M₁
                          │ (seq 2)  │
                          └──────────┘
                          │ agent 2  │ N+M₂
                          │ (seq 3)  │
                          └──────────┘
```

Cells at positions 0..N-1 are tagged with all four seq_ids and occupy one set of physical memory. Cost of forking: ~0. The child's unique cost is whatever it prefills after the fork.

### Position-aware decode

Why suffix prefill doesn't re-decode shared tokens — position inheritance, in three steps:

```cpp
// branch.hpp — fork implementation
dst->position = src->position;  // Child starts where parent left off
```

```cpp
// branch.hpp — prefill()
decode::many(state->ctx, tokens, n_tokens,
             state->position,    // ← 866, not 0
             state->n_batch, state->seq_id);
state->position += n_tokens;    // ← advances past the suffix
```

```cpp
// decode.hpp — building the llama_batch
const int32_t pos = n_past + i;  // n_past = 866, i = 0,1,2,...
```

After a spine prefills 866 tokens, `root->position = 866`; a forked agent starts at 866 and its suffix tokens land at 866, 867, … The GPU attends to the prior KV entries at 0–865 (already in cache) and computes new entries only for the suffix. The spine's tokens are never re-processed.

### Prune frees only unique cells

When a branch prunes, it releases cells from `forkHead` to `position` — its unique tokens above the fork point. The parent and siblings are untouched:

```
Before prune:
  Agent A: 400 unique cells          After pruning Sub B and Sub C:
  Sub-agent B: 300 unique cells        Agent A: 400 unique cells (unchanged)
  Sub-agent C: 300 unique cells        Freed: 600 cells for Agent A to continue
```

With `pruneOnReturn: true`, an agent's branch is pruned the moment it reports — its cells free mid-pool, and the siblings still working gain headroom. In recursive delegation the inner pool shrinks as sub-agents finish; when it completes, `withSpine`'s finally block prunes the inner spine and any remaining descendants. The calling agent's branch is fully restored — its cells were never touched.

`cells_used` accounting follows the same shape: incremented on every decode (`decode_each`, `decode_scatter`), decremented by each branch's unique cells on prune. The spine's own cells free only when its `withSpine` scope exits — they're still needed by surviving forks until then. [Pressure & policy](/under-the-hood/kv-pressure) reads these numbers every tick.

### The warm path costs a turn separator

When a spine is created with a `parent` branch (the `DelegateTool` path: `agentPool({ parent: context.branch })`), it forks instead of cold-starting at position 0, and prefills only `getTurnSeparator()` — **1–2 tokens, template-dependent** (ChatML: `<|im_end|>\n` = 2 tokens; Llama-3: 1) — so the next suffix lands on a clean turn boundary.

```
Cold path:  spine at position 0, prefills full system + tool schemas  (~700-900 tokens)
Warm path:  spine forks from parent, prefills a turn separator        (1-2 tokens)
```

The system prompt, tool schemas, and every prior tool result are already in the parent's KV — inherited through the fork, not re-paid. The savings compound per recursive level.

### SETTLE extends the branch

Tool results are prefilled into the calling agent's branch via `store.prefill([[branch, tokens]])` — decoded into KV at the branch's current position, not re-serialized as text. The next `produceSync()` attends over them. When `web_research` returns, the JSON-serialized sub-agent findings prefill into the calling agent's branch the same way: the agent resumes with its sub-agents' findings physically in attention.

## How a pool shares the prefix

```
withSpine({ systemPrompt, tools })
  │
  ├── Branch.create(ctx, 0, params)    ← spine branch at position 0
  ├── prefill(headerTokens)            ← GPU decode: positions 0..N-1, ONCE
  │
  └── useAgentPool({ ... })
        ├── setupAgent → forkSync()    ← O(1) metadata: child at position N
        │              → prefill(suffix)  ← GPU decode: N..N+M only
        ├── setupAgent                 ← same: fork at N, decode from N
        └── setupAgent                 ← same
```

In shared mode (`systemPrompt` + `tools` on `withSpine` / `agentPool`), the chat header — system prompt plus every tool's JSON schema — is decoded once into the spine. Tool schemas are the largest contributor: a 5-tool toolkit formats to ~800–900 tokens. Each AgentApp's tools cost roughly schema-size × 1, not × N agents; per-spawn suffixes shrink to the task itself.

**Why `setupAgent` still formats the full message array.** Each agent calls `formatChatSync` with its own `[system, user]` messages even though the spine carries the header. This is intentional, not duplication: format detection requires the complete message context (the returned `fmt.format` / `grammar` / `grammarTriggers` / `parser` drive output parsing and tool-call constraint, and differ per system prompt and tool set), and agents in one pool can carry different roles. The CPU cost of tokenizing ~866 tokens per agent is milliseconds; the GPU cost is zero, because prefill starts at the fork position. In shared mode, `setupAgent` detects the spine's pre-computed `SpineFmt` and skips re-emitting the header bytes entirely — the agent inherits the spine's parser/grammar configuration and contributes only its user turn.

**Measuring it.** The spine's contribution is visible in traces — `prompt:format` records the tokenized length, `branch:prefill` the actual decode:

```json
{"type": "prompt:format",  "role": "spine",       "tokenCount": 866}
{"type": "branch:prefill", "role": "spineHeader", "tokenCount": 866}
{"type": "branch:prefill", "role": "agentSuffix", "tokenCount": 896}
```

The suffix prefill reports the full formatted length, but `position` starts at 866 from the fork — the GPU decodes only the ~30-token delta:

```
Without sharing: 3 agents × 896 tokens = 2,688 GPU decode ops
With sharing:    866 shared + 3 × 30 unique = 956 GPU decode ops
Savings:         64% fewer decode ops
```

Nested pools compose: an inner spine forked from an outer agent shares the same `BranchStore` and physical KV cache, and `ContextPressure` sees `cells_used` across all of it.

## Three spine lifetimes

Three spine mechanisms compose at different timescales. Same physics, different owners.

### 1. Delegation spine — within a task

When an agent delegates, `DelegateTool` creates an inner pool with `parent: context.branch`. Sub-agents fork from the calling agent's branch and inherit its full KV state — the opener diagram is this case. Delegation results are JSON-serialized and prefilled back into the calling agent's branch during SETTLE, extending its spine for subsequent tool calls. Lifetime: one tool call.

### 2. Query spine — between task stages (`extendSpine`)

A chain (or DAG) harness creates a query-scoped spine once; all task pools fork from it, and between tasks each task's findings are prefilled directly onto it as user+assistant turns:

```
querySpine (position 0)
  └─ Task 1 pool forks from querySpine (position 0)
       → findings A → extendSpine([user: "Task 1", assistant: A])
         querySpine advances to position 500

  └─ Task 2 pool forks from querySpine (position 500)
       → inherits Task 1's findings via KV share, zero re-encoding
       → findings B → extendSpine → position 1100

  └─ Task 3 pool forks from querySpine (position 1100)
       → inherits Tasks 1+2 findings
```

Findings are decoded once into `querySpine`; every subsequent fork shares them at zero marginal cost. A post-pool synth agent forks the fully-extended spine and attends over the complete research chain. Lifetime: one query — the spine is pruned when its `withSpine` scope exits.

**`extendSpine` is queue-and-drain serialized.** It does NOT issue a native `store.prefill` from the orchestrator's fiber: it queues onto `pendingExtends` and suspends on an Effection `action()` until the tick loop's Phase 0 (SPAWN+EXTEND) drains it — batching all pending extends and fork suffixes into one `store.prefill` call, then resolving each suspended action with its delta token count. This matters when sibling tasks complete near-simultaneously (flat DAGs): without queue-and-drain, two `extendSpine` calls from separate fibers would race into native decode and violate the single-fiber discipline — only the tick loop's fiber issues native model calls.

### 3. Session trunk — across queries

The `Session` trunk persists across queries: pools fork from it, investigate, prune; `session.commitTurn(query, answer)` appends one Q&A turn; the next query's pools fork from the extended trunk and read the prior conversation through attention. Lifetime: the conversation. Only the trunk survives a query — all intermediate research KV is gone; the compounding is deliberate and minimal (one turn per query).

Short-term (delegation) compounds evidence within a task; medium-term (query spine) compounds findings across tasks; long-term (trunk) compounds conversation across queries.

## Where to put the spine: harness `withSpine` vs `agentPool({ systemPrompt })`

Spine extensions write to the pool's spine root — and **which branch that is depends on shared mode**. This is the most consequential footgun on this page:

- **`agentPool` WITHOUT `systemPrompt`** (non-shared): the spine root is the `parent` you passed in. The harness's outer `withSpine` owns that branch for its full scope, so `extendSpine` extensions **persist past pool exit** — a post-pool `useAgent({ parent: querySpine })` forks the spine and attends over all chain extensions.
- **`agentPool` WITH `systemPrompt`** (shared mode): `agentPool` creates a *nested* spine carrying the catalog header, and extensions write to that inner spine — which is **pruned at `agentPool` exit**. A post-pool agent forking the outer branch finds none of the chain's extensions.

Two working patterns; pick by where the synth runs:

```typescript
// Pattern A: synth as a node INSIDE the pool (compare's DAG pattern)
yield* withSpine({ parent: session.trunk }, function* (querySpine) {
  return yield* agentPool({
    orchestrate: dag(nodes),     // research → compare → synth as nodes
    systemPrompt: catalog,       // shared mode is fine: synth's branch
    parent: querySpine,          //   forks the same inner spine
    tools, terminal: reportTool,
  });
});

// Pattern B: synth as a separate useAgent AFTER the pool
yield* withSpine(
  {
    parent: session.trunk,
    systemPrompt: catalog,       // ← catalog on the HARNESS's spine
    tools,                       // ← so extensions land on a branch that survives
  },
  function* (querySpine) {
    yield* agentPool({
      orchestrate: chain(steps),
      // NO systemPrompt — non-shared; extensions write to querySpine
      parent: querySpine,
      tools, terminal: reportTool,
    });
    // synth forks querySpine and sees all chain extensions via attention
    return yield* useAgent({ parent: querySpine /* ... */ });
  },
);
```

See [Mixed-role pools](/under-the-hood/mixed-role-pools) for the shared-mode prompt convention and [Concurrency](/under-the-hood/concurrency) for the `SpineFmt` context that drives it.

## What this replaces — APIs and orchestration frameworks

Cloud APIs rebuild per request: the full `tools` array and conversation history ride every call as input tokens, re-processed each time. Prompt caching (e.g. `cache_control: ephemeral`) is a billing optimization — cached tokens still occupy context and the client controls none of it. MCP adds tool *discovery*, not residency — discovered schemas still ship in every request. Orchestration frameworks (AgentExecutor, LangGraph) construct the full prompt per step; there is no cross-step KV sharing because each API call is independent.

| Aspect | API-based (cloud APIs, MCP clients) | Prefix sharing |
|--------|--------------------------------------|----------------|
| Tool schema cost per agent | Full input-token cost per request | Decoded once, forked O(1) |
| Multi-agent (3 agents, 5 tools) | 3× full schema processing | 1× decode + 3× ~30-token delta |
| Multi-turn (6 turns per agent) | 6× full schema as input tokens | 1× decode; tool results as branch deltas |
| Grammar enforcement | None — client validates JSON post-hoc | Lazy GBNF masks invalid tokens at the sampler |
| Prompt caching | Server-side, billing only | Physical KV sharing, zero re-decode |
| Cross-agent KV sharing | Impossible — requests are independent | Fork inherits parent KV at O(1) |

The tradeoff is deployment flexibility vs compute: APIs are stateless and tool lists can change per request; prefix sharing requires a branch lifecycle and a local model. For one-shot calls the difference is negligible. For multi-agent pipelines it is the difference between feasible and not:

<Tip>
Measured on a traced corpus research run (6 agents, 26 turns, 5 tools) — actual GPU decode under prefix sharing vs the token count a prompt-rebuilding approach would process (re-sending system + tools + full history per turn):

```
Agent 3:  6 turns   Our decode:  3,899 tok   Rebuild: 17,721 tok   (4.5×)
Agent 4:  6 turns   Our decode:  1,453 tok   Rebuild: 10,386 tok   (7.1×)
Agent 5:  7 turns   Our decode:  5,637 tok   Rebuild: 26,936 tok   (4.8×)
Agent 6:  1 turn    Our decode:     30 tok   Rebuild:    896 tok
Synth:    5 turns   Our decode:  4,603 tok   Rebuild: 16,410 tok   (3.6×)
Reporter: 1 turn    Our decode:     30 tok   Rebuild:    896 tok
─────────────────────────────────────────────────────────────────────
Total               Our decode: 16,518 tok   Rebuild: 73,245 tok
                    Savings: 78%             Ratio: 4.4× fewer tokens
```

Two compounding effects: the 866-token shared prefix is decoded once instead of on all 26 turns (22,516 redundant tokens avoided), and history stays in KV as deltas instead of being re-sent (turn 6 of Agent 5 would re-send ~5,600 tokens already in its cache). The deeper the trajectory, the larger the ratio. Conservative: excludes the fixed per-request overhead cloud APIs add and the growth of generation tokens per turn.
</Tip>

## Anti-patterns

- **Cold inner spines.** If a delegation's inner pool re-prefills the system prompt when it could fork warm, ~700–900 tokens are wasted per recursive level. `DelegateTool` passes `parent: context.branch`; custom recursive tools must too.
- **Spine bloat from large tool results.** Every settled result permanently extends the branch's KV — a 2,000-token `fetch_page` result costs 2,000 cells, and deeper delegation levels inherit it. Tools should compress before returning into the spine (the web AgentApp's `fetch_page` reranks chunks and returns top-K verbatim instead of the full page).

---

**What fills the spine** is governed by the AgentApp protocol: `renderSpine({ apps })` produces the framework intro, one sanitized `CATALOG_ENTRY` per enabled AgentApp, the tool-selection rule, and the tool schemas — see [What is an AgentApp](/build-an-app/what-is-an-app#the-agentapp-protocol--what-the-model-actually-sees). The mechanics on this page are the substrate; the protocol decides the bytes.

**Same physics, different consumer:** the cross-encoder reranker composes the same `Branch` + `BranchStore` primitives over a permanent warm trunk — see [Rerank architecture](/under-the-hood/rerank-architecture).
