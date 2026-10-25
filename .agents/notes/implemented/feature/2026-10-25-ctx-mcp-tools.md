# Agent Note: An app reads one MCP server's tool detail through ctx

Status: implemented

## Problem

`ctx.mcpServers(includeAll?)` listed ids, statuses, and tool names, so an app could build a server list but not a tool picker or an argument form: it had no descriptions and no JSON Schemas. The authoring side already read that detail through `mini_app_mcp_tools`; the runtime had no equivalent, and a schema copy baked into the app goes stale whenever the server changes.

## Decision

`ctx.mcpTools(serverId)` returns `{ tools: [{ name, description?, inputSchema, outputSchema? }] }` for one server. `inputSchema` is required because MCP requires it on every tool; `description` and `outputSchema` are omitted when the server does not declare them. The call opens the server the same way `ctx.mcp` does, so a server already listed by `ctx.mcpServers` reuses its session.

A failure fails the call with the client's code: `mcp-not-connected` for an id not in the config, `mcp-start-failed` when it did not start, `mcp-tool-failed` when the server refuses the listing. The result has no error field, because the entries are only useful when complete, and a throw reaches the same catch the app already writes around `ctx.mcp`. `ctx.mcpServers` keeps names only: its wrapper spans servers, while `mcpTools` addresses one.

## Alternatives considered

- Descriptions and schemas on `ctx.mcpServers`. Lost: that list opens every configured server, so every list would carry every schema. The names-only list stays cheap and the detail is one server at a time.
- A bare `AppMcpTool[]` return. Lost: sibling `ctx.mcpServers` returns `{ servers }`, and a wrapper leaves room for a status or a page cursor without changing the call.
- An `error` field like `mcpServers`'s failed entries. Lost: the caller already named one server; a per-server error object around a list it cannot use is a second failure path for the same fact.
- Reusing `toolsMcpForAuthor`. Lost: that shape carries `id` and a `tool-args` code for the authoring tool selector, and never returns `outputSchema`. Two audiences, two shapes; they share the client, not the projection.
- Passing `failures` so a boot-left-out id reports its reference code. Lost: `ctx.mcp` already reports `mcp-not-connected` for an id that is not registered, and `ctx.mcpServers(true)` owns the boot failure detail.

## Consequences

`ctx-mcp.md` gains the detail bullet and the listing failure; `app-surface.md` gains the row and narrows "no `listTools`" to the in-app agent's tool set. The skill's `ctx` table and tools guide carry the member, and `check:skill` now requires it. The MCP client needed no change: `listTools` already returned both schemas.
