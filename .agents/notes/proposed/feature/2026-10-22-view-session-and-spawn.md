# Agent Note: Unified view session and general spawn

Status: proposed

## Problem

Website invented tab-scoped process lifecycle while ordinary apps kept LiveApp forever after first load. Spawn was website-only. Authors and Host could not share one ownership model.

## Decision (documented 2026-10-22; implementation follows)

- **View session** is universal: refcount on tabs + workbench slot; last leave unloads LiveApp and kills all spawns for that app.
- **`ctx.spawn` is general** in any session. Host tags `app` (api) vs `website` (driver hooks) without a lifetime parameter.
- Session end kills both tags. Ordinary reload kills all spawns. Website refresh does not kill `website`-tagged spawns; author may `kill` in `refresh`. Reload still kills `app`-tagged spawns on a website.
- Ephemeral `mini_app_call` without a view: no grace period; result carries `session: "view" | "ephemeral"` (no appId field).
- `onHostEvents` only for apps with a view session.

Pages: [view-session.md](../../../docs/product/host/view-session.md), [ctx-spawn.md](../../../docs/product/app-contract/ctx-spawn.md), [website.md](../../../docs/product/app-contract/website.md).

## Alternatives considered

- Keep LiveApp after tab close. Rejected for unified session and spawn ownership.
- Lifetime parameter on spawn. Deferred; session-end kill is the only policy this cut.
- Auto-kill website-tagged spawns on refresh. Rejected; author controls replace via `kill` in `refresh`.
