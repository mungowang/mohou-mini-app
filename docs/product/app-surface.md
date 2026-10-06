---
status: shape-locked
progress: settled
updated: 2026-09-23
---

# App surface

The running mini-app uses this surface. It is `ctx` on the backend, and `useApp().call`, `useApp().on`, `useApp().resolveAssetUrl`, and kit chrome such as `LiveRefresh` in the view. Field detail stays on the linked pages. This page is the catalog, so a member cannot appear on one page and be absent here.

The app does not see the [author surface](author-surface.md). It does not see the [owner surface](owner-surface.md). It does not reset history, delete itself, or write `host.json` or `mcp.json`.

There is no `ctx.tool` and no `listTools`. Timeouts, caps, and retry counts are host policy and are not locked. Codes are in [implementation.md](implementation.md).

## Catalog

| Member | Kind | Page |
| --- | --- | --- |
| `ctx.appId`, `ctx.appDir` | value | [identity](app-contract/identity.md) |
| `ctx.storage` | `kv` `query` `run` `transaction` | [identity](app-contract/identity.md) |
| `ctx.state` | a fresh `{}` per call; the declaration is a type | [identity](app-contract/identity.md) |
| `ctx.credentials.get` | one secret by name, or `undefined` | [identity](app-contract/identity.md) |
| `ctx.config` | public policy fields, no secrets | [identity](app-contract/identity.md) |
| `ctx.log` | app log; returns nothing | [ctx.log](app-contract/ctx-log.md) |
| `ctx.signal` | `AbortSignal` for this call, or absent | [identity](app-contract/identity.md) |
| `ctx.http` | `{ ok, status, headers, text, json }` | [ctx.http](app-contract/ctx-http.md) |
| `ctx.bash` | `{ stdout, stderr, exitCode }` | [ctx.bash](app-contract/ctx-bash.md) |
| `ctx.pwsh` | `{ stdout, stderr, exitCode }` | [ctx.pwsh](app-contract/ctx-pwsh.md) |
| `ctx.system.metrics` | one OS snapshot | [ctx.metrics](app-contract/ctx-metrics.md) |
| `ctx.push` | fire-and-forget to this app's views | [ctx.push](app-contract/ctx-push.md) |
| `ctx.llm` | `string` | [ctx.llm](runtime/ctx-llm.md) |
| `ctx.agent` | `string` | [ctx.agent](runtime/ctx-agent.md) |
| `ctx.mcp(serverId, toolName, args?)` | external tool result | [ctx.mcp](mcp-client/ctx-mcp.md) |
| `useApp().call(method, args?)` | keys of `defineApp` `api` | [defineApp](app-contract/define-app.md) |
| `useApp().on` / `onAny` | this app's push stream | [ctx.push](app-contract/ctx-push.md) |
| `useApp().resolveAssetUrl(path)` | URL for a file under `assets/` | [assets](app-contract/assets.md) |

`args` to `call` is untrusted. The method validates it. `ctx.mcp` args are the tool's own object, never `{ input: string }`.

## Conflicts closed

- Authoring tools are not methods on `ctx`.
- Owner delete, policy write, and history reset are not methods on `ctx`.
- `ctx.mcp` takes a server id and a tool name. A single opaque name is not the call.
- `ctx.llm` and `ctx.agent` return a string. The app does not receive the internal run handle.
- An open view refetches when authoring changes the tree. The app does not call `mini_app_reload`.
