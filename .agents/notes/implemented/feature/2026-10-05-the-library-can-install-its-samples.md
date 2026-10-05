# Agent Note: The library can install its samples

Status: implemented

## Problem

The startup samples are seeded once per runtime root, and only into an empty library. That is the right rule for a first boot — it keeps a deletion deleted — and it means a library that already has apps never receives a sample added later. The workbench was added to a product whose installations all have apps, so the one app most worth trying could only reach a machine that had never been used.

## Decision

**`installStartupSamples(runtimeRoot, skillSource)` copies what is missing.** Same table, same templates, same manifest rewrite as the seed; the difference is that it takes no interest in the marker and never replaces an app that exists. It returns `{ installed, skipped }`, so the caller can say what happened rather than claim success.

**`POST /api/sample-apps`, guarded by the authoring token.** It writes into the library, which is the same class of action as the authoring tools and the skill install, and those are guarded. The panel sends the token it already holds.

**One button in Settings → Agent**, beside the skill and authoring-MCP installs, because it is the same kind of thing: product-shipped content installed into this machine. The button reports counts — installed, already here — and a failed call says so instead of leaving the row unchanged.

## Alternatives considered

- **Re-seed at boot when a sample is missing.** It cannot tell "the owner deleted this" from "this predates the sample", so it would resurrect a deletion on every start.
- **Seed into every library once, with a per-sample marker.** Two markers to reason about, and the same ambiguity for a deleted sample.
- **Put the button in the library view** (the gallery). It is where apps appear, and Settings is where "install the things this product ships" already lives — the skill, the assistant MCP servers, the credentials.
- **Install without asking** when the panel first sees a library missing a sample. A product that writes apps into a library on its own has stopped being a library.
- **Return the whole status per sample** (why each was skipped). The two counts answer the question the button asks; the per-app state is already visible in the library.

## Consequences

The workbench reaches existing installations through one click, and the same button will carry any sample added later.

`installStartupSamples` and the boot seed share the copy and the manifest rewrite but not the marker, and a test pins the difference: the installer reports an app it skipped, leaves an edited manifest alone, and installs nothing when it is asked twice.
