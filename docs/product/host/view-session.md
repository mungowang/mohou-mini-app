---
status: shape-locked
progress: settled
updated: 2026-10-22
---

# View session

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Host. Panel reports view enter and leave. Author tools may open an ephemeral backend without a view.
- A **view session** is the unit of “this app is on screen.” It is not the same as a history commit or a market install.
- **Enter view:** opening an app tab, focusing an existing tab does not add a second enter, and showing a workbench in the home **slot** counts as one view for that workbench app. Multiple tabs for the same app id share one session via a reference count.
- **Leave view:** closing a tab drops one reference. Leaving the workbench slot when that app is not also open as a tab drops the slot reference. When the count reaches zero, Host **ends the view session**.
- **End of view session:** Host kills every spawn registered for that app, runs website `dispose` when the app is a website, unloads the live backend module, and closes that app’s storage connection. The next open starts a new session.
- **`onHostEvents`:** Host calls it only on apps that currently have a view session. An app with no open tab or slot does not receive notices until it is opened again.
- **Reload while the view is still open:** the view session continues (refcount unchanged). Spawn handling differs by kind — [ctx.spawn](../app-contract/ctx-spawn.md) and [Website](../app-contract/website.md).
- **`mini_app_call` with no view:** Host opens an **ephemeral** backend for that call or batch only. When the call (or batch) finishes, Host ends the ephemeral session the same way as a view session with respect to spawn and unload. There is no grace period. The call result includes `session: "view" | "ephemeral"`.
- Failure: releasing a view for an unknown id is a no-op. Ending a session is idempotent.
- Non-goals: keeping a live backend after the last tab closes; spawn that outlives the session; a lifetime parameter on `ctx.spawn` in this cut.

## Implementation

Role: provider. Panel posts enter/leave (or equivalent open/close view routes). Host keeps `refcount` per app id, including the workbench slot as one reference. Teardown is one path shared by last tab close, slot leave, ephemeral call end, and Host dispose. Plan: [implementation.md](../implementation.md).
