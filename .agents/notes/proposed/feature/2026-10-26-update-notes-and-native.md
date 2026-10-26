# Agent Note: Update notes and native package signal

Status: proposed

## Problem

1. The update offer and done cards name versions and the install outcome, but not what changed. Owners decide from a number alone.
2. Package hot update (`@mohou/*` into the install prefix) and the native window binary are different carriers. A launcher/webview change only lands after a new app build. The update card today does not say when the running window is behind what the package needs.
3. A full in-app native updater is tempting, but a GitHub Release dmg/zip is large and slow on many networks, and replacing the whole app for a window-only fix is wasteful.

## Proposal

### A. Release notes on the update card (package channel)

- Source of truth stays `docs/changelog.md` section `## x.y.z`.
- `pnpm bump:product` copies that section into `@mohou/shell` `package.json` as `mohou.releaseNotes` (bump already refuses without the section).
- `GET /api/updates` may carry `notes?: string` for the offered `latest` (and, after a successful install, for the version now running when the check can read it).
- Registry: read from `GET /@mohou/shell/latest` (or the version document). Tarball: read `package/package.json` from the newest shell tarball. Missing notes are omitted — not an error.
- Offer card: after the version row and source chip, before the restart note — scrollable plain text, caption en `What's new` / zh `更新内容`. Done card: same block when notes are available after restart.
- Notes stay verbatim English. No markdown renderer. Cap ~4000 characters with truncation.
- First cut: notes for the **target** version only, not every skipped intermediate section.

### B. Native needs update — prompt, not silent

Today's product has two install surfaces:

| Carrier | What moves | How it updates now |
| --- | --- | --- |
| Package | `@mohou/shell` and peers in the prefix | Registry or local tarball hot update, window restart |
| Native | Tauri/window binary (and app bundle chrome) | New app install: local `dist:app:local`, or GitHub Release dmg/zip |

Proposal for the same update card family:

- Host reports a **window / native capability version** the running binary carries (already printed in launcher log; surface it on about / update check).
- The package (or a small field next to `mohou.releaseNotes`) may declare `mohou.windowMin` (or equivalent): the minimum native build this package expects.
- When `runningWindow < windowMin` (or package changelog / bump marks a native-required release):
  - Package hot update may still be offered for JS-only work, **or** refused when the package cannot run on the old window — product choice, default: offer package only when safe; otherwise the card says a **new app install** is required.
  - The card shows a distinct line: native is behind, package update alone will not fix it, and where to get the app (local packs path, or Release URL when published).
- No automatic download in this step. The prompt is the product change.

### C. Built-in native update — options (not chosen)

| Option | Shape | Pros | Cons |
| --- | --- | --- | --- |
| **C0. Prompt only** (recommended first) | Card + about name that native is behind; link or path to install | Small; matches two-carrier reality; no download infra | User still installs the app by hand |
| **C1. Full app from GitHub Release** | In-app fetch of dmg/zip, replace bundle, relaunch | One button | Large; GitHub often slow; code-sign/quarantine; Windows and macOS differ |
| **C2. Window binary only** | Publish a small `mini-app-window` artifact (mirror-friendly); swap the binary beside the prefix; relaunch | Much smaller than full app; fits “launcher changed, packages did not” | Self-replace while running; macOS app bundle layout and Gatekeeper; must version the window independently |
| **C3. Full app from a fast mirror** | Same as C1 but host/CDN, not GitHub | Faster download | Still large; need hosting and channel policy |
| **C4. Delta / bsdiff app** | Patch previous bundle | Smaller wire | Build complexity; sign every patch; high failure surface |

**Recommendation:** ship **A + B + C0** first. Do not build C1–C4 until B is real and we know how often native-required releases happen. If native-required releases stay rare, C0 is enough. If the window moves often, prefer **C2** over full-app download: the expensive part of a Release is usually the prefix and panel, not the window binary — and package hot update already moves those.

### D. What “native required” means in a release

A bump that touches `packages/launcher` / webview injection / window binary is a **native-required** release for anyone still on an older app. Package-only bumps are not. The bump or changelog section should mark that (explicit field or a standing convention), so the card can prompt without guessing from the git tree at runtime.

## Alternatives considered

- Notes only on the done card. Lost: the owner decides before install.
- Fetch GitHub Release body for notes. Lost: offline/mirror; Release body may be empty; package field stays with the install channel.
- In-app full GitHub download as the first native path. Lost: size and speed; still need the prompt model for failures.
- One version number for package and window. Lost: they already ship on different cadences; conflating them forces full app installs for JS-only fixes.

## Acceptance criteria (when built)

- [ ] Offer (and done, when notes exist) show the target version's changelog text from the install channel.
- [ ] Absent notes leave the card as it is today.
- [ ] When the running window is below what the package needs, the card states that a new app install is required and does not pretend a package-only install will replace the window.
- [ ] No automatic native download in the first cut unless a later decision picks C2/C1.
- [ ] macOS and Windows both report the running window version the same way.

## Risks

- Custom `package.json` fields must survive the registry document and local tarball path; abbreviated packuments must not be the only read.
- Declaring `windowMin` wrong forces unnecessary app reinstalls or fails to warn — bump/docs must own the mark.
- C2 self-replace is easy to get wrong on macOS (bundle structure, quarantine) and Windows (file locks on the running exe).
- A live shell with `MINI_APP_SUPERVISED=1` (packaged app) must not be confused with package update UX; the card still runs inside that window.

## Non-goals (first cut)

- Translating release notes.
- Intermediate-version note stacking across a multi-version jump.
- Silent background native download.
- Changing the package hot-update install path itself.
