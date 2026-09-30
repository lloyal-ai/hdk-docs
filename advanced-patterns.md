---
title: "Advanced patterns"
description: "What the same primitives express when topology, observation, evidence flow, inference shaping, lifecycle policy, authority and continuity are composed deliberately — adaptive harnesses, direct inference programming, acceptance and continuation."
lede: "Programs the ownership model makes possible: adaptive topology, direct control of the next token, and continuing from exactly the state you accepted."
---

<!-- Moved from Thinking in Lloyal's "Advanced patterns" section (2026-09-30), unchanged. -->

This page assumes [Thinking in Lloyal](/thinking-in-lloyal). Every sample awaits a native write into the model with `waitUntilSettled` from `@lloyal-labs/lloyal-agents` — [why](/async-to-lloyal#wrapping-a-native-write-in-call).

The preceding sections teach how to see a Lloyal execution. These patterns show what the same primitives can express when topology, observation, evidence flow, inference shaping, lifecycle policy, authority, and continuity are composed deliberately.

They are not built-in modes. Each is an application procedure assembled from ordinary TypeScript and the public inference primitives. Most harnesses should stay at the Agent, Tool, orchestrator, and policy level. Direct Branch operations are appropriate when the invariant is genuinely about token selection, search, logits, or state continuity.

## Begin with the invariant {#begin-with-the-invariant}

Do not start by choosing an orchestration factory or a number of Agents.

Start with:

> **What must remain true while this intelligent application investigates, concludes, acts, and continues?**

For each pattern, identify:

```text label="Structure"
invariant
→ required live states
→ ownership and inheritance
→ observations
→ allowed interventions
→ acceptance and authority
→ continuity
→ observable test
```

The runtime owns safe execution, cancellation, branch cleanup, batching, and grant enforcement. The harness owns the semantic decisions: what evidence means, which contradiction is material, what burden of proof applies, which state is canonical, and when consequence is acceptable.

## Adaptive harness patterns {#adaptive-harness-patterns}

### Contradiction-triggered expansion {#contradiction-triggered-expansion}

**Invariant:** no final result while a material contradiction remains unresolved.

**State shape:** preserve the current interpretation and the conflicting observation as distinct live states. Create only the focused work needed to resolve their disagreement.

```text label="Structure"
current interpretation
        │
        └── conflicting observation
                    │
          preserve current lineage
                    +
          provenance challenge
                    +
          applicability challenge
                    +
          alternative explanation
                    │
                 reconcile
                    │
          extend only resolved finding
```

A custom orchestrator can inspect harness-owned contradiction state, conditionally `spawn` challenge Agents, `waitFor` them, and extend the spine only after the resolution passes the application's completion gate. `AgentPolicy` can keep the unresolved lineage alive or prevent terminal acceptance.

**Why it is different:** the graph is not declared once and then executed blindly. New topology appears because evidence changed the application’s understanding of the workload.

---

### Minority-lineage preservation {#minority-lineage-preservation}

**Invariant:** majority convergence must not erase unique, higher-authority, or high-consequence evidence.

```text label="Structure"
majority convergence
        │
        ├── minority evidence immaterial → prune
        │
        └── minority evidence material
                    → preserve
                    → seek corroboration
                    → reconcile
                    → accept or block completion
```

The harness records provenance and materiality outside the model. It may preserve a minority Agent, spawn a verification lineage, withhold completion, or prune the branch when the unique evidence proves immaterial.

**Why it is different:** the application owns the survival rule. “Consensus” is not whatever the model or the largest cohort happens to prefer.

---

### Dynamic retrieval phase switching {#dynamic-retrieval-phase-switching}

**Invariant:** retrieval should pursue the question the workload currently needs answered, not one static search objective.

```text label="Structure"
discovery
→ governing facts found
→ applicability search
→ candidate outcome
→ contradiction search
→ materiality check
→ explanation-quality retrieval
```

`AgentPolicy.shouldExplore()` supplies a live explore/exploit decision at Tool dispatch. A Tool receives that decision through `ToolContext.explore` and can combine it with application-owned phase state, root intent, local branch state, pressure, and peer history.

```ts label="TypeScript"
class PhasePolicy extends DefaultAgentPolicy {
  constructor(private readonly state: WorkloadState) {
    super({ terminalToolName: "report" });
  }

  override shouldExplore(agent: Agent, pressure: ContextPressure): boolean {
    const phase = this.state.forAgent(agent.id).phase;
    if (phase !== "discovery") return false;
    return pressure.percentAvailable > 40;
  }
}
```

The boolean boundary is intentionally small. Richer semantics—verification, falsification, applicability, or explanation—remain application and Tool concerns.

---

### Materiality-aware compute allocation {#materiality-aware-compute-allocation}

**Invariant:** spend further inference only on uncertainty capable of changing the useful outcome.

```text label="Structure"
uncertainty exists
→ could resolving it change the outcome?
    ├── no  → stop or prune
    └── yes → continue, fork, retrieve, or recover
```

Pressure reports what the runtime can afford. Materiality reports what the application considers worth affording.

```ts label="TypeScript"
class MaterialityPolicy extends DefaultAgentPolicy {
  constructor(private readonly state: WorkloadState) {
    super({ terminalToolName: "report" });
  }

  override shouldExit(agent: Agent, pressure: ContextPressure): boolean {
    const s = this.state.forAgent(agent.id);
    if (pressure.critical) return true;
    if (!s.uncertaintyCouldChangeOutcome) return true;
    return s.noMaterialProgressTurns >= 3;
  }
}
```

A custom orchestrator can also use `ctx.canFit(...)` before spawning focused work. Recovery policy decides whether an incomplete but material branch deserves a final extraction rather than silent pruning.

## Programming the inference trajectory {#programming-the-inference-trajectory}

These patterns move below Agent lifecycle and operate directly on live Branch state. They are the clearest proof that the harness can program inference rather than only arrange calls around it.

### Verifier-before-commit generation {#verifier-before-commit-generation}

**Invariant:** a candidate continuation must pass an application validator before it becomes branch state.

```text label="Structure"
sample candidate
      ↓
application validates
   ┌──┴──────────────┐
accept              reject
   ↓                  ↓
commit        alter distribution
              and resample
```

The critical distinction is:

> **A sampled candidate is not yet committed inference state.**

`Branch.produce()` samples without advancing the branch. `Branch.commit()` accepts and decodes the chosen token. Between them, application code can validate, steer, replace logits, or change grammar.

```ts label="TypeScript"
function* commitVerifiedToken(
  branch: Branch,
  accepts: (candidate: { token: number; text: string }) => boolean,
): Operation<boolean> {
  const rejected = new Set<number>();

  while (true) {
    const candidate = yield* call(() => branch.produce());
    if (candidate.isStop) return false;

    if (accepts(candidate)) {
      branch.clearSteer();
      yield* waitUntilSettled(branch.commit(candidate.token));
      return true;
    }

    rejected.add(candidate.token);
    branch.steer(
      [...rejected].map((token) => ({ token, bias: -Infinity })),
    );
  }
}
```

Use this for local syntax or semantic validators, impossible world-state transitions, phase-specific structure, or specialised token-level scoring. Grammar remains preferable when the whole valid language can be expressed structurally; verifier-before-commit is valuable when validity depends on live application state.

---

### Diverse tree search {#diverse-tree-search}

**Invariant:** preserve several genuinely different continuations, spend work on promising paths, and remove dominated subtrees without reconstructing the shared prefix.

```text label="Structure"
shared live state
      ↓
fork alternatives
      ↓
reseed · steer · produce · score
      ↓
expand promising paths
prune dominated subtrees
      ↓
retain or promote winner
```

Branches can fork from roots or intermediate branches. Sampler reseeding prevents identical stochastic continuations. Path-local steering can penalise sibling choices. `produce()` separates proposal from advancement, while cohort `commit()` advances the active frontier together.

```ts label="TypeScript"
const frontier: Branch[] = [];
// The search owns its candidates: whatever it forked is pruned when this scope ends — returned, thrown or halted.
yield* ensure(() => { for (const b of frontier) b.pruneSync(); });
for (const seed of seeds) {
  const branch = yield* waitUntilSettled(root.fork());
  branch.reseedSampler(seed);
  frontier.push(branch);
}

for (let depth = 0; depth < maxDepth; depth++) {
  const proposals = frontier.map((branch) => [
    branch,
    branch.produceSync(),
  ] as const);

  const live = proposals.filter(([, p]) => !p.isStop);
  if (live.length === 0) break;

  yield* waitUntilSettled(store.commit(
    live.map(([branch, p]) => [branch, p.token]),
  ));

  // Application-owned scoring decides which paths expand or prune.
  pruneDominated(frontier, scoreBranch);
}
```

The `ensure` is the search owning its cleanup: promote or retain the winner before the candidate scope closes, and everything else is released with it.

**Why it is different:** the application is not asking for several detached answers. It is maintaining and governing a search tree of continuing model states.

---

### Expert-state synthesis {#expert-state-synthesis}

**Invariant:** expert lineages should remain distinct while contributing directly to a common synthesis, rather than first being flattened into one textual summary.

```text label="Structure"
expert A state ─┐
expert B state ─┼─ align to one synthesis task
expert C state ─┘
                       ↓
             capture token distributions
                       ↓
               merge into destination
                       ↓
          decode under destination grammar
               and sampler policy
```

`Session.prefillAligned()` gives the trunk and experts the same next task while preserving each lineage's prior state. `BranchStore.mergeLogits()` adds expert distributions into the destination. The destination's grammar and sampler still determine the selected token.

```ts label="TypeScript"
function* synthesizeFromExperts(
  session: Session,
  store: BranchStore,
  experts: Branch[],
  task: string,
  alpha = 0.25,
): Operation<string> {
  yield* waitUntilSettled(session.prefillAligned(task, experts));

  const destination = session.trunk;
  if (!destination) throw new Error("Expert synthesis requires a trunk");

  let output = "";

  while (true) {
    store.mergeLogits(destination, experts, alpha);
    const next = destination.produceSync();
    if (next.isStop) break;

    output += next.text;

    // Advance every lineage with the selected synthesis token so their
    // distinct histories remain aligned for the next distribution merge.
    yield* waitUntilSettled(store.commit([
      [destination, next.token],
      ...experts.map((expert) => [expert, next.token] as [Branch, number]),
    ]));
  }

  return output;
}
```

The built-in merge applies one equal `alpha` to each expert. A custom weighting operator can read and write captured logits when experts need different weights.

**Why it is different:** the experts preserve their own evidence and attention histories while contributing to each next-token decision.

## Acceptance and continuity patterns {#acceptance-and-continuity-patterns}

### Burden-of-proof scaling {#burden-of-proof-scaling}

**Invariant:** the evidence and validation required must increase with the consequence of the proposed result or action.

```text label="Structure"
advisory output
→ modest evidence threshold

persistent recommendation
→ stronger evidence + provenance + validation

consequential action
→ corroboration + deterministic checks + grant + approval
```

The harness owns risk tier and evidence-completeness state. `AgentPolicy.onProduced()` can reject premature terminal output. Deterministic validators can check structure and domain rules. `ToolGuard`, protected Tools, Session grants, and human commands keep permission distinct from model preference.

This pattern preserves four separate facts:

```text label="Structure"
the model proposed it
≠ the result is accepted
≠ the Session is authorised
≠ the application should execute it now
```

---

### Verified-state continuation {#verified-state-continuation}

**Invariant:** later work must inherit the state the application actually accepted, not merely a summary of whichever candidate happened to finish last.

```text label="Structure"
candidate lineages
        ↓
validator or human selection
        ↓
accepted winner
        ↓
Session.promote(...)
        ↓
later work forks from accepted state
```

```ts label="TypeScript"
const winner = candidates.find((candidate) =>
  validator.accepts(candidate.result)
);

if (!winner) throw new Error("No candidate satisfied the invariant");

// Promote while the candidate branch is still live in its owning scope.
yield* waitUntilSettled(session.promote(winner.branch));
```

Promotion is both a topological operation and a product decision. The candidate scope must remain alive until selection and promotion complete.

**Why it is different:** the accepted inference state itself becomes the basis for follow-up work. Continuity is not reconstructed later from a lossy prose summary.

---

### Counterfactual policy replay {#counterfactual-policy-replay}

**Invariant:** a changed policy, prompt, validator, model, or stage should be evaluated from equivalent inherited state.

```text label="Structure"
historical inherited state
→ reconstruct
→ replace policy or stage
→ rerun
→ compare outcome and trace
```

```ts label="TypeScript"
const checkpoint = extractSpineCheckpoint(traceEvents, {
  poolTraceId,
});

const spine = yield* reconstructBranch(checkpoint);

const result = yield* agentPool({
  parent: spine,
  tools,
  policy: revisedPolicy,
  orchestrate: replacementStage,
});
```

Replay reconstructs the seed prompt and ordered spine extensions. It does not promise bit-identical future generation when sampler state or other nondeterministic inputs differ. The object under comparison is the application procedure and its trace, not only the final prose.

---

### Temporal applicability {#temporal-applicability}

**Invariant:** evidence may influence a lineage only when it applies to the relevant time, jurisdiction, version or world state.

**State shape:** keep event time, effective dates, jurisdiction, version and supersession in application state. Use them to evaluate evidence before admission and again before completion.

```text label="Structure"
relevant time or state discovered
→ select governing version
→ evaluate candidate evidence
    ├── applicable  → admit to authorised lineage
    └── superseded  → reject or retain as provenance
→ validate applicable basis before completion
```

A custom Tool or scorer can compare retrieved evidence with harness-owned applicability state. The orchestrator can route applicable evidence into selected lineages, while policy prevents completion when the governing basis remains unresolved.

```ts label="TypeScript"
// admission — evidence enters a lineage only when it governs
class GoverningFilings extends Tool<{ query: string }> {
  constructor(private readonly basis: ApplicabilityState) { super(); }

  *execute(args: { query: string }): Operation<unknown> {
    const hits = yield* search(args.query);
    return {
      applicable: hits.filter((hit) => this.basis.governs(hit)),
      superseded: hits.filter((hit) => !this.basis.governs(hit)),
    };
  }
}

// completion — no report while the governing basis is unresolved
class RequiresBasis extends DefaultAgentPolicy {
  constructor(private readonly basis: ApplicabilityState) {
    super({ terminalToolName: "report" });
  }

  override onProduced(...args: OnProduced): ProduceAction {
    const [, parsed, , config] = args;
    const reporting = parsed.toolCalls[0]?.name === config.terminalToolName;
    if (reporting && !this.basis.resolved) {
      return { type: "nudge", message: "State which version governs before reporting." };
    }
    return super.onProduced(...args);
  }
}
```

Both comparisons are deterministic. `governs()` tests effective date, jurisdiction and supersession against harness-owned state; a relevance score cannot stand in for it, because a superseded filing scores highest on the question it was superseded on. The policy holds the terminal tool rather than editing the answer, so the model still writes the report — it simply cannot finish one whose governing basis was never established.

The same shape carries across domains:

-   **Software engineering:** use the API version and dependency state present at the failure time.
-   **Legal or policy analysis:** apply the rule in force on the relevant date.
-   **Travel:** use current entry rules for the intended journey period.
-   **Game world:** reason from the world state at the event time rather than current state.

**Why it is different:** semantic relevance is not validity. The application determines which evidence governs which live state rather than asking the model to infer applicability from a mixed transcript.

## Additional compositions {#additional-compositions}

The same grammar supports further patterns that can be added when a product needs them:

-   **Cross-source invariant transfer:** establish governing constraints in one stage, extend only the accepted constraints into the spine, and make later source work inherit them.
-   **Source-diverse evidence portfolio:** treat independent source classes as an application invariant rather than trusting top-K relevance alone.
-   **Entitlement-aware evidence admission:** allow private evidence to influence an authorised lineage while filtering or withholding its representation from other lineages and public output.

These are not special framework modes. They are different combinations of topology, Tool semantics, policy, application state, and continuity.

## Design your own advanced pattern {#design-your-own-advanced-pattern}

Before introducing agents or branches, ask one question:

> **What must remain true while this application observes, reasons, delegates, acts and continues?**

Then make the contract explicit:

| | Ask |
|---|---|
| **State** | Which live interpretations, candidates or expert states must exist? |
| **Contact** | Which Abilities let the procedure observe or act on reality? |
| **Applicability** | Which evidence governs which lineage, time, place or subject? |
| **Ownership** | What work ends together, and which temporary branches must stay alive until selection or promotion? |
| **Inheritance** | What state should each lineage receive, and which findings may extend the spine? |
| **Observation** | Which model, pressure, evidence, domain, external-system and human signals matter? |
| **Intervention** | May the harness spawn, retrieve, steer, constrain, validate, retry, recover, prune, merge or promote? |
| **Authority** | What separates a model proposal, an accepted result, a permitted action and an executed consequence? |
| **Continuity** | What becomes shared state, the Session trunk, or a reconstructable checkpoint? |
| **Proof** | What trace and application state prove the invariant held, even when the final answer looks plausible? |

> **Start from the application invariant, not from the number of Agents.**

## Advanced-pattern failure modes {#advanced-pattern-failure-modes}

### Creating fan-out without a survival policy {#creating-fan-out-without-a-survival-policy}

More branches are not automatically better. Define what preserves, expands, recovers, prunes, and wins before creating a large frontier.

### Confusing permission with authority {#confusing-permission-with-authority}

A grant means the Session may invoke a protected Tool. It does not mean the application must accept every proposed invocation or that evidence and approval conditions are satisfied.

### Treating summaries as the only persistent state {#treating-summaries-as-the-only-persistent-state}

Summaries are useful data. They are not equivalent to promoting an accepted live state or deliberately extending a spine with selected findings.

### Assuming replay means bit-identical output {#assuming-replay-means-bit-identical-output}

Reconstructed inherited state can be equivalent while later sampling diverges. Compare policy decisions, invariants, outcomes, and traces rather than assuming identical tokens.
