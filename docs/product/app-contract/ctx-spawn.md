---
status: shape-locked
progress: settled
updated: 2026-10-22
---

# ctx.spawn

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host runs and owns the child.
- Input: `ctx.spawn(file, args?, options?)`. `file` is the executable. `args` is a string list. Optional `options` may set `cwd` and `env` (merged onto a scrubbed parent env). There is no lifetime parameter in this cut.
- Output: `AppSpawnHandle` with `pid`, `kill()`, `exited`, `ready({ url, timeoutMs? })`, and `output()`. `ready` polls until the URL answers over HTTP or the timeout fails the call. `output()` returns a bounded recent stdout/stderr ring for **failure analysis** (not a live stream, not the success signal).
- **Who may call:** any live backend — ordinary app, workbench, or website — during an `api` method or during website driver hooks. The field is on `ctx` whenever a session (view or ephemeral) is running.
- **Tag (Host, not author API):** spawn from `api` (and other non-driver calls) is tagged **`app`**. Spawn from `website.ensure` / `website.refresh` / `website.dispose` is tagged **`website`**. Authors do not pass the tag; Host sets it from the calling context.
- **Session end** (last view reference gone, or ephemeral call finished, or Host dispose): Host kills **every** spawn for that app, both tags, then unloads the backend.
- **Reload while the view remains:**
  - **Ordinary app and workbench:** Host kills **all** spawns for that app (`app` tag only exists here), then loads the new module. The view session stays. Later `api` code may spawn again.
  - **Website:** Host kills only **`app`**-tagged spawns (same as ordinary app for API workers). Host does **not** kill **`website`**-tagged spawns. [Website](website.md) owns refresh.
- Failure: missing executable or spawn error is `spawn-failed`. `ready` timeout is `spawn-ready-timeout`. A dead process on `kill` is not a failure.
- Non-goals: shelling out with `ctx.bash('… &')` as a long-lived server; a public lifetime flag on spawn; Host guessing which website child is “primary.”

```ts
interface AppSpawnHandle {
  readonly pid: number | undefined
  kill(): Promise<void>
  readonly exited: Promise<{ readonly exitCode: number | null }>
  ready(options: { readonly url: string; readonly timeoutMs?: number }): Promise<void>
  /** Recent combined stdout/stderr. Empty when nothing was written. */
  output(): string
}
```

On `spawn-ready-timeout` / `spawn-failed`, Host may attach the same text as `detail` on the thrown error and on the website failing snapshot so the UI expand-detail path can show it.

## Implementation

Role: definition on the contract; one Host registry registers every child with app id and tag. Ledger file under the runtime root records pids for crash reclaim on the next boot. Dispose and session teardown call the same kill path. Plan: [implementation.md](../implementation.md).
