---
status: index
updated: 2026-09-21
---

# App contract

Index: [features.md](../features.md).

The app contract is what an author writes and what a running mini-app may call. The catalog of `ctx` is the [app surface](../app-surface.md). It does not know which process constructed Host. Method names, arguments, return fields, and failure classes below are locked. Timeouts, caps, retry counts, and buffer sizes are host policy. This section does not lock those numbers.

- [Directory and entries](directory.md)
- [App assets](assets.md)
- [Import allowlists](imports.md)
- [defineApp and call](define-app.md)
- [Identity, storage, state, credentials, config, log, signal](identity.md)
- [ctx.http](ctx-http.md)
- [ctx.bash](ctx-bash.md)
- [ctx.pwsh](ctx-pwsh.md)
- [ctx.log](ctx-log.md)
- [ctx.system.metrics](ctx-metrics.md)
- [ctx.push and useApp events](ctx-push.md)
- [UI kit](ui-kit.md)
- [Style, in one pass](style.md)
- [Colour the app consumes](colour.md)
