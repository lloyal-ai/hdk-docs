---
title: "Publish and install"
description: "Publish an Ability through the signed channel at apps.lloyal.ai, and install one: what the install verifies before it writes anything, why it takes a name and never a URL, and the attention surface a reviewer reads."
lede: "Ship an Ability to every harness through one signed channel — and install one knowing exactly what it will say to your model."
---

## Distribution {#distribution}

An Ability is a signed npm tarball. Two routes put it in a harness's `node_modules`, and both converge on the same runtime path — a plain static `import` of the factory, handed to `registry.enable`. There is no runtime "load an Ability by name" verb.

### The signed channel {#the-signed-channel}

**Deep access is the reason for the gate, and the gate is what makes deep access safe.** Anything reaching a harness that does not own it flows through `apps.lloyal.ai`: reviewed for contract conformance, tool safety, manifest validity and signature provenance before listing. A first-party harness may also depend on an Ability it owns from a private source, as an ordinary npm dependency — not a parallel public path.

The framework points at that catalogue by default. The install command takes a *name*, never a URL; the catalogue URL and the Ed25519 trust roots are compile-time constants. Every harness therefore resolves Abilities through the same verified channel, and the protocol does not fragment into incompatible sub-catalogues.

### Installing {#installing}

```sh label="TERMINAL"
npx lloyal-ai install acme/jira@^1.2.0
```

**One command, and a verified chain from publisher to process.** The install verifies before anything is written: it fetches the signed catalogue and checks its Ed25519 signature against the vendored trust roots; resolves your semver range to a version the catalogue pins; fetches the manifest and cross-checks name, version and size; fetches the tarball and verifies the signature over its raw bytes; then cross-checks a sha512 integrity digest. Only then is the package vendored and installed. A failure at any step rolls back — nothing unverified is left behind.

## A signed record of everything it says to your model {#the-attention-surface}

**You can read what an Ability puts in your context window without running its code.** At publish time the CLI constructs your Ability and reads back what it actually registers — every tool name, description and parameter schema, plus the skill template. That is written into the tarball as `attention-surface.json`, so the signature covers it.

This exists so a reviewer, and anyone installing, can read **exactly what an Ability injects into a model's context without executing its code**. It is derived from the code rather than declared, so it reports what the Ability really does, not what its author says it does.

```sh label="TERMINAL"
What acme/jira adds to your model's context:
  protocol:  jira_research
  use when:  investigating tickets, their history and linked work
  tools:     jira_search, jira_fetch
```

## Related {#related}

- [Security model](/ability-security) — why the channel is signed.
- [CLI reference](/cli) — `ability:new`, `publish`, `install`.
