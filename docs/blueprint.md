---
status: locked
updated: 2026-10-10
---

# Blueprint

This page owns which node a capability belongs to. A feature page does not name a release. A node that is not listed here does not exist. A capability that is not listed here is not assigned.

What 1.0 already shipped, and what waits after, stay in [the 1.0 plan](../.agents/notes/implemented/process/2026-09-20-one-oh-plan.md).

## 1.0

- [Embedded navigation](product/shell/navigation.md). External links open outside the app. There is no contained browser.
- Restart keeps one live session. Window exit, `SIGINT`, and `SIGTERM` dispose that session.
- UI-kit tests are self-contained. The coverage gate does not include the kit.
- A smoke test spawns the process entry and the panel-window binary. A real-entry test checks a result outside that process and checks that exit leaves no child.
- Expected-output oracles for results that are awkward to assert inline.
- Coverage of the weak files named in the plan.
- Snapshots and file listings skip `logs/`, `dist/`, `.cache/`, and `.autogen/`. `coverage/` stays.
- Windows code paths ship beside the macOS paths. The machine pass is not this node.
- A local artifact for this checkout. It is not a signed installer.
- A durable `ctx.log`: `apps/<appId>/logs/`, about 5 MB, appended without reading the file, not in git. [Identity](product/app-contract/identity.md) owns the behavior.
- Author skill before cut: thin L0 `SKILL.md`, MCP-only tool names in the skill (no byte tools), `bin/diagnose` for failed authoring connectivity, `check:skill` enforces the ban. [Skill contract](product/author-skill/skill-contract.md). Confirm gate: [.agents/notes/implemented/feature/2026-09-27-author-skill-confirm.md](../.agents/notes/implemented/feature/2026-09-27-author-skill-confirm.md). L0 shape: [.agents/notes/implemented/feature/2026-09-27-skill-l0-is-the-gate.md](../.agents/notes/implemented/feature/2026-09-27-skill-l0-is-the-gate.md). Portable packaging and Host sidecar update policy are not this bullet.

## After 1.0

- The coverage gate includes the UI kit.
- Start the Tauri window on a Windows machine and use the panel there. A failure is a hotfix.
- A Windows Job Object, only if that pass shows `taskkill /T /F` leaves the process tree running.
- The library and its cards adapt when the panel container is narrow. [Responsive layout](product/panel/responsive.md).

## Backlog

These have no feature page and no RFC. Do not raise one unless the user names it.

- Adapters that embed this platform in another agent product.
- An internal app market. [Market](product/market/README.md). Why: [.agents/notes/implemented/feature/2026-10-10-app-catalog.md](../.agents/notes/implemented/feature/2026-10-10-app-catalog.md).
- A Linux panel window.
- Shell launcher vs `@mohou/shell` npm sidecar split (Tauri out of the shell package; Settings can update shell via the package manager without a new launcher build). Proposal: [.agents/notes/proposed/architecture/2026-09-23-shell-sidecar-and-launcher.md](../.agents/notes/proposed/architecture/2026-09-23-shell-sidecar-and-launcher.md). Update loops (skill-in-shell, K≡S, local tarball install): [.agents/notes/proposed/architecture/2026-09-23-update-loops.md](../.agents/notes/proposed/architecture/2026-09-23-update-loops.md).
