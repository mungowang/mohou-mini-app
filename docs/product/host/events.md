---
status: shape-locked
progress: settled
updated: 2026-10-23
---

# Events

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Host.
- Two streams.
- Host stream `GET /api/events`: `app:open` (app id and optional title), `app:rename` (previous id and new id), `app:changed` (app id, `change` of `created` | `updated` | `deleted` | `restored` | `renamed`, and `from` when the change is `renamed`), `workbench:default` (the stored homepage id), `app:reload` (app id, after a successful reload), `app:eval` (a view query the shell must deliver), `market:install` and `market:uninstall` (`kind` of `app` or `theme`, and that id), and a storage-size notice. Ping keeps the stream open. This stream is for Panel and Shell. An author UI does not subscribe to it. A loaded app that defines `onHostEvents` receives each notice except `app:eval`. The hook may `ctx.push` a name that app owns. `useApp().on` receives that push, and it does not receive the notice. The builtin gallery and its trash refetch on `app:changed`.
- `app:changed` is published after the write returns. Register is `created`. A file write, edit, or delete is `updated`. The reload that publishes `app:reload` also publishes `updated`. A history reset that changed the tree publishes `updated`. A rename publishes `renamed` with `from`, beside `app:rename`. Trash publishes `deleted`. Restore publishes `restored`. A market app install publishes `created`, or `updated` when it replaces, beside `market:install`. A market uninstall publishes `market:uninstall`; an uninstalled app also publishes `deleted` on the trash path that panel delete already uses. Each sample the settings button copies publishes `created`. A failed write publishes nothing. Installing npm packages publishes nothing. The sample copy at host boot publishes nothing.
- App stream `GET /api/app/:appId/events`: author events from `ctx.push` only, scoped by app id on the server before write.
- Failure: a dropped client reconnects with the last event id. A gap is explicit. A storage notice is advisory. Writes already succeeded.
- Non-goals: an author reading the host stream; a host diagnostic framed as an author event.

## Implementation


Role: provider. Two typed maps: host stream and author stream. Producers and consumers share the map. An author UI cannot subscribe to the host stream. Publish a storage notice after the write commits. `GET /api/events` and `GET /api/app/:appId/events` are mounted. A subscriber receives a retry hint on open and a ping while attached. `bindFrame` posts `app:reload`, `app:eval`, and author events to the caller. On bind it replays the retained tail and posts `app:gap` when that tail no longer starts at sequence 1. It does not post host notices, ping, or the retry hint. A loaded instance's `onHostEvents` runs when a notice is published. An instance that is not loaded is skipped. `app:eval` does not call the hook. A thrown hook is logged. Diagnostics do not enter the author buffer. Plan: [implementation.md](../implementation.md).
