---
name: mohou-release-lanes
description: >-
  Choose and run Mohou product bump/publish lanes: bump-local-npm (tarball package
  hot update only), bump-local-app (local packs + build native Mohou.app via
  dist:app:local), bump-remote-npm (registry publish), bump-remote-npm-release
  (publish + push + GitHub tag release). Triggers: bump local, local tarball,
  local app bundle, dist:app:local, native app, publish npm, remote release,
  GitHub Release, hot update packages, pnpm bump:product, publish:check,
  publish:packages.
---

# Mohou release lanes

Use when the user asks to bump the product version, pack local tarballs for Mohou hot update (`~/.mini-app/packages`), build a local native app bundle, publish `@mohou/*` to npm, or cut a GitHub Release via tag.

Do **not** invent extra lanes beyond the table. Do **not** bump, publish, or tag unless the user asked ([AGENTS.md](../../../AGENTS.md)). Authority for commands: [docs/development.md](../../../docs/development.md). Ordinary PR evidence stays in [pre-push-checks](../pre-push-checks/SKILL.md).

## Lanes (pick one)

| Lane | When | What it does |
|------|------|----------------|
| **bump-local-npm** | Local Mohou; **JS/package hot update only**; no native rebuild; no registry | Bump → pack tarballs → copy into `~/.mini-app/packages` |
| **bump-local-app** | Local Mohou; need a **new native app** (window/Tauri/launcher) or a full local install bundle | Bump → `pnpm dist:app:local` (packs + builds unsigned app + copies tarballs) |
| **bump-remote-npm** | Others get packages via npm hot update | Bump → publish packages to npm (mirror queue default on) |
| **bump-remote-npm-release** | Same as remote **plus** GitHub Release artifacts | bump-remote-npm → push branch → push tag `vX.Y.Z` → CI Release |

### Local: npm packs vs native app

Local release is **two different jobs**. Confirm which one if the user only says “本地发布 / local bump”:

| | **bump-local-npm** | **bump-local-app** |
|--|--------------------|--------------------|
| Goal | Hot-update `@mohou/*` on an **already installed** tarball-channel Mohou | Ship a **new local app binary** + packs |
| Native / Tauri / window build? | **No** | **Yes** (`dist:app:local`) |
| Output | `artifacts/npm/*.tgz` → `~/.mini-app/packages` | `artifacts/app/` (e.g. `Mohou.app`, zip/dmg) **and** tarballs in `~/.mini-app/packages` |
| Use when | host/shell/ui/panel/contract-only changes | launcher, Tauri, Info.plist, sidecar wiring, or user asked for a full local app package |
| Command spine | `publish:check` + `cp … ~/.mini-app/packages` | `pnpm dist:app:local` |

**Default if unclear and the diff is package-only:** `bump-local-npm`.
**Default if the change touches `packages/launcher` / native window:** `bump-local-app`.

Ambiguous ask → confirm the lane before running.

## Shared prerequisites (every lane)

1. **Version** `x.y.z` newer than current `packages/shell` `version`.
2. **Changelog first:** add `## x.y.z` under [docs/changelog.md](../../../docs/changelog.md). `bump:product` refuses without it.
3. **Full gate:** `pnpm run check` (lint + typecheck + coverage + skill). Stop on failure. A focused vitest run does not replace it.
4. **Bump:** `pnpm bump:product x.y.z` — never hand-edit version carriers.

```sh
pnpm run check
pnpm bump:product x.y.z
```

## bump-local-npm

Local **package** tarball channel only. **Does not upload. Does not build the native app.**

```sh
pnpm run check
pnpm bump:product x.y.z
pnpm publish:check
mkdir -p ~/.mini-app/packages
cp artifacts/npm/*.tgz ~/.mini-app/packages/
```

- `publish:check` = sync skill + build panel + pack → `artifacts/npm/*.tgz`.
- Copy into `~/.mini-app/packages` so a **tarball-channel** Mohou can hot-update on next update/restart.
- **Insufficient** when native window/Tauri/launcher changed — switch to **bump-local-app**.

## bump-local-app

Local **full app package** (native build + packs). **Does not upload to npm.**

```sh
pnpm run check
pnpm bump:product x.y.z
pnpm dist:app:local
```

- `dist:app:local` packs workspace tarballs, builds the unsigned local Mohou app under `artifacts/app/`, installs prefix from those tarballs, and **copies tarballs to `~/.mini-app/packages`** (tarball channel stamp).
- Use when the user wants a double-clickable / replaceable local app, or when native bits changed.
- Still not a GitHub Release and not registry publish.

## bump-remote-npm

Registry publish for remote package hot update. **Uploads. Does not build local native app.**

```sh
pnpm run check
pnpm bump:product x.y.z
# tree must be clean — commit changelog + bump carriers first
MINI_APP_PUBLISH=1 pnpm publish:packages
```

- Without `MINI_APP_PUBLISH=1`, nothing uploads.
- Script refuses a dirty tree; it runs check again then publishes.
- Default: queue npmmirror after publish. Skip with `MINI_APP_MIRROR_SYNC=0` / `false` or `--no-mirror-sync`.
- Remote **native** installers come from **bump-remote-npm-release** (CI `dist:app:release`), not from this lane alone.

## bump-remote-npm-release

Everything in **bump-remote-npm**, then remote git + GitHub Release (CI builds native apps).

```sh
# after successful MINI_APP_PUBLISH=1 pnpm publish:packages
git push origin HEAD
git tag vX.Y.Z          # must match @mohou/shell version (no other suffix)
git push origin vX.Y.Z
```

- **Order:** shell `x.y.z` must already be on the npm registry **before** the tag job expects it.
- **Push branch before/with tag** so remote has the commit; a local-only tag does not run CI.
- `.github/workflows/release.yml` on `v*`: `dist:app:release` on macOS/Windows and attaches zip/dmg to the **GitHub Release**.
- `workflow_dispatch` builds bundles but **does not** publish the Release — use the tag for a real Release.

## Command cheat sheet

| Intent | Command |
|--------|---------|
| Full gate | `pnpm run check` |
| Bump all carriers | `pnpm bump:product x.y.z` |
| Pack only (no upload, no native) | `pnpm publish:check` |
| Install local packs for package hot update | `cp artifacts/npm/*.tgz ~/.mini-app/packages/` |
| Full local app + packs (native build) | `pnpm dist:app:local` |
| Publish npm | `MINI_APP_PUBLISH=1 pnpm publish:packages` |
| GitHub Release trigger (CI native apps) | `git push origin vX.Y.Z` |

## Pitfalls

- No bump / publish / tag without an explicit user ask.
- Changelog `## x.y.z` missing → bump fails.
- **Local “publish” is not one command:** package hot update ≠ native app build. Do not run `dist:app:local` for every local bump; do not skip it when launcher/Tauri changed.
- `publish:check` ≠ publish; `publish:packages` without env ≠ publish.
- Dirty tree blocks remote publish.
- Tag `vX.Y.Z` must equal `@mohou/shell` version; tag before npm publish breaks release CI.
- Do not hand-edit `packages/shell/skill`; `sync:skill` / publish scripts own that copy.

## Verification

| Lane | Done when |
|------|-----------|
| Any | `pnpm run check` was green; shell version is `x.y.z` |
| bump-local-npm | Fresh `artifacts/npm/*.tgz` and same basenames under `~/.mini-app/packages`; **no** requirement that `artifacts/app/` was rebuilt |
| bump-local-app | `artifacts/app/` has the new Mohou bundle for this platform **and** tarballs under `~/.mini-app/packages` |
| bump-remote-npm | Publish log or `npm view @mohou/shell version` shows `x.y.z` |
| bump-remote-npm-release | `git ls-remote --tags origin` has `refs/tags/vX.Y.Z`; Release workflow queued/green — do not claim artifacts before CI finishes |
