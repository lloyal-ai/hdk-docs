---
title: "Ship your app"
description: "How a scaffolded harness becomes a distributable macOS application — what the packager is told, what your users meet on first launch, and what signing and notarizing actually require."
lede: "A scaffolded harness becomes a macOS application someone else installs, with no packaging machinery left in the project."
---

Running three ways is not the same as being distributable. The gap is a signed, notarized disk image and a first launch that provisions itself on a machine you have never seen.

::: pull
Nothing is signed  
unless you ask.
:::

## What `ship` produces {#what-ship-produces}

A macOS disk image in `release/`, carrying the compiled engine, its production dependencies, its prompt files and the manifest. A reader mounts it and drags the application to Applications.

```sh label="Shell"
npx lloyal-ai ship              # unsigned: opens on this Mac, nowhere else
npx lloyal-ai ship --notarize   # the distributable artifact
```

The first run asks for an application identifier and records it in `harness.yml`; every run after it, and CI, reads it from there.

```yaml label="harness.yml"
ship:
  id: ai.lloyal.fieldnote
  icon: build/icon.icns
```

Nothing else about packaging enters your project. The entitlements, the archive rules, the native-module unpacking and the disk-image layout are synthesised for the build and thrown away with the temporary directory they were written to. A project that later needs its own arrangement can take a copy and spread it over the generated one.

> **Model weights are not inside it.** The wiki template packages to about 142 MB and deep-research to about 154 MB, whatever the models they name.

## The first launch your users meet {#the-first-launch}

They meet the same provisioning screen you did on your first `dev:desktop` run. There is no separate end-user path, because there is no separate code.

-   one row per model named in `harness.yml` — the reasoning model, and whichever of reranker, vision and embedding that harness declares;
-   each fetched and **digest-verified** against the SHA the catalogue pins, from the upstream source or the Lloyal mirror, whichever answers;
-   the bytes, the rate and the time remaining, per row;
-   a weight the reader already has, offered as an alternative to downloading it;
-   everything written to the application's own support directory, never beside your project.

Every launch after that opens at once. A download that is truncated or tampered with is deleted rather than loaded, and the next source is tried.

### What an update does not do {#what-an-update-does-not-do}

The manifest ships inside the application as its default and becomes the installation's own the first time it launches. That copy happens once.

So changing a model in `harness.yml` reaches a **fresh** installation. An existing one keeps the manifest it seeded, along with every edit its reader has made to it since — which is the point, because that file now holds their choices, not yours. An update brings new code, never a rewrite of a file the reader owns.

## Two roots, and why they differ {#two-roots}

A packaged harness has two locations rather than one, and they are two because of what the operating system allows rather than by design.

| What | Where, once packaged | Why |
| --- | --- | --- |
| Engine entry, compiled code, dependencies | inside the `asar` archive | Electron reads it there; the OS cannot make it a working directory. |
| The engine's working directory | `Contents/Resources` | A real directory — the archive's physical parent. |
| Prompt files | beside the archive, under `Resources` | The loader resolves them through `cwd` and reads them with plain `fs` at every render. |
| Everything a run produces | the application's support directory | The bundle is read-only. The manifest, the overlay, the models, the media store and the reports live here. |

In development all three are the working directory, so an edit to a prompt is still live at the next render. Neither template's prompt loader changes between the two.

## The icon {#the-icon}

Each template ships a mark at `build/icon.icns` and names it in the manifest, so an application is never born wearing Electron's logo with nothing to say it was yours to set. Replace that file, or point `ship.icon` at another.

A `.icns` or a square `.png` of at least 512 px, 1024 preferred. **Not an SVG**: the rasteriser draws paths and not type, so a mark made of lettering ships as a blank tile and nothing in the build says so. Render it first.

## Signing and notarizing {#signing-and-notarizing}

An unsigned image opens on the Mac that built it and is refused on every other. Gatekeeper judges what was downloaded, so the disk image itself has to be notarized, not only the application inside it.

> **Nothing is signed unless `--notarize` asks for it**, however well the machine is set up. A leftover variable from another project is not a decision to release, and a request that cannot be met is refused before the build rather than quietly downgraded.

### Get a Developer ID {#get-a-developer-id}

Membership of the Apple Developer Program, then a **Developer ID Application** certificate. An individual account is enough; the signature carries your own name until you enrol as an organisation. Install it in your keychain, and note the name it appears under.

This is the non-App-Store distribution path. It is not the Mac App Store, which needs a different certificate and a different target.

### Choose a notary route {#choose-a-notary-route}

Apple accepts three, and the choice is about where the secret lives.

| Route | What it puts on disk | Use it when |
| --- | --- | --- |
| **Stored profile** — `xcrun notarytool store-credentials <name>` | Nothing. The secret stays in your keychain. | On your own machine. Prefer this. |
| **App Store Connect key** — a `.p8` file | A file path, not a secret. | On CI, where there is no keychain. |
| **Apple ID** — an app-specific password | The password itself. | Last resort; see the warning below. |

> An app-specific password becomes an argument to `notarytool`, and arguments are readable by anything running as you for as long as the submission takes. The other two routes avoid that entirely.

When more than one is present the earliest of Apple ID, then key, then profile wins — the same order the packager uses, so the application and the image around it are never notarized under different accounts.

### Let the command set it up {#let-the-command-set-it-up}

You do not have to arrange any of this first. Run `ship --notarize` on a machine with a certificate and no notary credential and it offers to make one: your browser opens at Apple's Sign-In and Security page, you generate an app-specific password, and `notarytool` takes the paste at its own secure prompt. The profile is stored, written into `.env.local`, and the build carries straight on — one command, no second run.

The password never enters the CLI. The terminal is handed to `notarytool` for that moment precisely so the secret goes from your keyboard to your keychain and nowhere else, and Apple validates it there and then rather than four minutes into a build.

The offer appears only when no notary route is configured at all. A half-configured one is a mistake to finish, not a reason to create a second credential beside it.

### Give them to the build {#give-them-to-the-build}

From the environment, or from `.env.local` in the project, which the scaffold's `.gitignore` already excludes. A real environment variable wins over the file, so CI needs no file and a stale one cannot override a runner.

```dotenv label=".env.local"
# The pair that leaves no secret in the file.
CSC_NAME="Your Name (TEAMID)"
APPLE_KEYCHAIN_PROFILE=lloyal
```

`CSC_NAME` is matched as a **substring** of the certificate's line, so the name alone is enough: `Acme Pty Ltd` selects `Developer ID Application: Acme Pty Ltd (TEAMID)`. Give it without the prefix Keychain Access shows — that is what the tooling suggests and what reads plainly — and give enough of it to be unambiguous, because a fragment matching two certificates leaves the choice to the packager.

```dotenv label=".env.local — on CI"
CSC_LINK=<base64 of a Developer ID Application .p12>
CSC_KEY_PASSWORD=<its password>
APPLE_API_KEY=/secure/AuthKey_XXXX.p8
APPLE_API_KEY_ID=XXXX
APPLE_API_ISSUER=<issuer uuid>
```

One assignment per line: a dotenv file reads the rest of a line as the value. Run `ship --notarize` with nothing configured and it prints this block rather than making you find it.

### What `--notarize` guarantees {#what-notarize-guarantees}

-   the **hardened runtime**, with the three exemptions a resident model needs: JIT and unsigned executable memory for the inference runtime, and library validation off so the addon's sibling libraries load at all;
-   **signing is mandatory** — a certificate that cannot be found fails the build instead of producing an unsigned application while you believe otherwise;
-   a **distribution** certificate, stated rather than left to the default, because the identity search otherwise falls back to a development certificate with only a warning;
-   the application notarized and stapled, and then **the disk image notarized and stapled in its own right**, because that is the file a browser downloads.

There is no signed-but-not-notarized outcome to ask for. Apple only notarizes a submission already signed with a Developer ID, so it is both or neither.

### Check it before you send it {#check-it-before-you-send-it}

```sh label="Shell"
xcrun stapler validate release/YourApp-1.0.0-arm64.dmg
spctl -a -vvv -t install /Applications/YourApp.app
```

Neither is the real test. Gatekeeper judges the quarantine attribute, and only a download sets it — so put the image somewhere and fetch it through a browser onto a Mac that has never seen yours. To approximate that locally, set the attribute by hand before opening it:

```sh label="Shell"
xattr -w com.apple.quarantine "0081;00000000;Safari;" YourApp-1.0.0-arm64.dmg
```

## Current and planned {#current-and-planned}

<div class="status-columns"><section><div class="status-title"><span class="status current">Current</span> Available now</div><ul><li>macOS disk images, signed and notarized from a laptop or from CI;</li><li>a default icon per template, replaceable;</li><li>first-launch provisioning of every model the manifest names;</li><li>a reader's own weight accepted in place of a download.</li></ul></section><section><div class="status-title"><span class="status planned">Planned</span> Coming soon</div><ul><li>Windows: Authenticode rather than notarization, and since 2023 a signing key must live on hardware or in a cloud service, so the environment-variable shape does not carry over;</li><li>Linux packaging;</li><li>the Mac App Store, which is a different certificate and target;</li><li>auto-update — today, version two is another download.</li></ul></section></div>

> **Where a harness runs is a deployment decision. Whether anyone else can run it is a signing one.**
