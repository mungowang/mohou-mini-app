# External calls

Do not invent a tool-list chat command. The app contract has no open tool namespace.

The confirm message picks among these after `mini_app_mcp_list`. Lead with a connected server. This page is the consequence of each path. [choices.md](choices.md).

Order when no server is connected:

1. `ctx.http`, then `ctx.bash` / `ctx.pwsh`, then `ctx.llm` / `ctx.agent`
2. `ctx.mcp(serverId, toolName, args?)` only when that server is in the host `mcp.json`. `ctx.mcpServers(includeAll?)` lists them at runtime, alive by default. `ctx.mcpTools(serverId)` gives one server's descriptions and schemas for a picker or for building `args`; it lists, it does not call. A missing server fails that call; the app still opens.
3. `mini_app_install` when the backend must import a library the platform does not ship.

`args` is the tool's own object. Never wrap it as `{ input: "..." }` unless that field is the tool's schema.

## Discover host MCP servers (authoring only)

These are authoring tools on the mini-app MCP server. They are not on `ctx`.

1. `mini_app_mcp_list()` → `{ servers: [{ id, tools: string[] }] }` — names only.
2. `mini_app_mcp_tools({ serverId, toolName? })` → descriptions and `inputSchema` for that server (or one tool).
3. Then `ctx.mcp(serverId, toolName, args)` from the app backend.

An app discovers the same set for itself at runtime with `ctx.mcpServers` and `ctx.mcpTools`. Do not hardcode the list you found here into the app.

Do not pull every schema through list. List first; open detail only for the server you will call.

Do not curl the host. Smoke tests use `mini_app_call`.
