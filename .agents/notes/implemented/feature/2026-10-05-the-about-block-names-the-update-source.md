# Agent Note: The about block names the update source

Status: implemented

## Problem

Nothing in the panel said where an update would come from. A release build installs from the npm registry and a local build installs from `~/.mini-app/packages`, and the two behave differently — one needs the network and mirrors it, the other needs a folder to have been filled — but the settings screen looked identical either way. The only trace was a channel word on the offer card (`Local package` / `Registry`), and it appeared only after a check that reached its registry.

That is the wrong time. The question "what am I running?" matters most when a check is slow or fails, which is exactly when that card has nothing to show.

## Decision

The install prefix is the source of truth, and the panel reads it directly.

- `readUpdateSource(env, cwd)` answers one closed union: `{ channel: 'registry', registry }`, `{ channel: 'tarball', tarballDir }`, or `{ channel: 'none' }` for a source tree with no prefix. It reads the prefix package.json and asks no registry.
- `GET /api/about` carries it as `source`. The about block is where the version numbers already live, so the fact sits with them, and it is a plain file read rather than part of the update check.
- `GET /api/updates` now names its `registry` or `tarballDir` too, including on the paths where the registry answered with an error: a source does not stop existing because a check failed.
- One chip renders it, in two places: the about block, and the offer card before an install starts. A registry shows its host (`registry.npmjs.org`, full URL in the title); a tarball channel shows the folder with `/Users/<name>/` and `/home/<name>/` collapsed to `~/`. Three stroke icons carry the channel — a globe, a drive, a terminal — rather than a brand logo.

## Alternatives considered

- Read the source only from the check (`GET /api/updates`). No new field, but the source would vanish exactly when it is most useful: a mirror that is slow, or a machine that is offline.
- Put a brand mark on the chip (an npm logo). It has to be shipped as an asset, and it says less than the host name does — `registry.npmmirror.com` versus `registry.npmjs.org` is the fact a person needs, and a logo cannot show it.
- Say only `Registry` / `Local`, as the offer card did. True but useless for the mirror case, which is the case that motivates the question.
- Serve the source from a new route. `/api/about` already exists for this block and already answers without the network.

## Consequences

The about block answers "what am I running" without the network, and the same chip appears on the offer card, so the thing that is about to be installed from is on screen before the install starts.

The host now reports a channel it cannot itself change: `readUpdateSource` reads the prefix, so a mirror setting (not built yet) would have to become the source of the value rather than a second place that computes it.

A source tree (`pnpm dev:host`) shows `No install prefix (source tree)` rather than no chip at all, which is why the union has a third member instead of an optional field.
