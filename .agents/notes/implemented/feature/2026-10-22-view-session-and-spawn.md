# Agent Note: Unified view session and general spawn

Status: implemented

## Problem

Website invented tab-scoped process lifecycle while ordinary apps kept LiveApp forever after first load. Spawn was website-only. Authors and Host could not share one ownership model.

## Decision

- **View session** is universal: refcount on tabs + workbench slot; last leave unloads LiveApp and kills all spawns for that app.
- **`ctx.spawn` is general** in any session. Host tags `app` (api) vs `website` (driver hooks) without a lifetime parameter.
- Session end kills both tags. Ordinary reload kills all spawns. Website refresh does not kill `website`-tagged spawns; author may `kill` in `refresh`. Reload still kills `app`-tagged spawns on a website.
- Ephemeral `mini_app_call` without a view: no grace period; result carries `session: "view" | "ephemeral"` (no appId field).
- `onHostEvents` only for apps with a view session.

## Implementation (Host)

- `process/view-session.ts` — view + ephemeral refcounts; shared `onEnd` teardown.
- `process/spawn.ts` + `spawn-ledger.ts` — per-app registry, tags, durable `app-spawns.json` reclaim on boot.
- `LiveApp.spawns` held for the session; `capabilitiesFor(..., tag)` binds `ctx.spawn`.
- Panel `enterView` on new tab and home slot; `releaseView` on tab close / slot leave.
- Website driver session no longer owns a separate spawn pool; dispose runs the hook only, then Host kills.
- Spawn stdout/stderr is a bounded ring (`handle.output()`, `SpawnError.detail`, website `error.detail`) for **failure analysis**, not success detection or a live UI stream.

Pages: [view-session.md](../../../docs/product/host/view-session.md), [ctx-spawn.md](../../../docs/product/app-contract/ctx-spawn.md), [website.md](../../../docs/product/app-contract/website.md).

## Alternatives considered

- Keep LiveApp after tab close. Rejected for unified session and spawn ownership.
- Lifetime parameter on spawn. Deferred; session-end kill is the only policy this cut.
- Auto-kill website-tagged spawns on refresh. Rejected; author controls replace via `kill` in `refresh`.
