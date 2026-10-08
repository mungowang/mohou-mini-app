---
status: index
updated: 2026-10-08
---

# Product features

One page per feature. This file is the index. The cut by caller is [functions.md](../architecture/functions.md). Locked sentences live in [decisions.md](../architecture/decisions.md). How a call is built lives in [implementation.md](implementation.md).

Call shapes are locked. Timeouts, caps, retry counts, buffer sizes, ports, and locale defaults are host policy and are not locked.

Adapters that embed this platform in another agent product are out of scope.

| Layer | Feature |
| --- | --- |
| App | [App surface](app-surface.md) |
| App contract | [Directory and entries](app-contract/directory.md) |
| App contract | [App assets](app-contract/assets.md) |
| App contract | [Import allowlists](app-contract/imports.md) |
| App contract | [defineApp and call](app-contract/define-app.md) |
| App contract | [Identity, storage, state, credentials, config, log, signal](app-contract/identity.md) |
| App contract | [ctx.http](app-contract/ctx-http.md) |
| App contract | [ctx.bash](app-contract/ctx-bash.md) |
| App contract | [ctx.pwsh](app-contract/ctx-pwsh.md) |
| App contract | [ctx.system.metrics](app-contract/ctx-metrics.md) |
| App contract | [ctx.push and useApp events](app-contract/ctx-push.md) |
| App contract | [UI kit](app-contract/ui-kit.md) |
| App contract | [Style, in one pass](app-contract/style.md) |
| App contract | [Colour the app consumes](app-contract/colour.md) |
| Host | [App lifecycle](host/lifecycle.md) |
| Host | [Compile and reload](host/compile.md) |
| Host | [Version history](host/history.md) |
| Host | [Events](host/events.md) |
| Host | [HTTP surface](host/http.md) |
| Host | [Config](host/config.md) |
| Host | [Credentials](host/credentials.md) |
| Host | [Storage engine](host/storage.md) |
| Host | [Install dependencies](host/install.md) |
| Host | [Runtime diagnostics](host/diagnostics.md) |
| Host | [Themes and palettes](host/themes.md) |
| Host | [Platform files served to the iframe](host/platform-files.md) |
| Host | [File tools](host/file-tools.md) |
| Host | [Heat](host/heat.md) |
| Host | [Recommendation](host/recommendation.md) |
| Runtime | [Provider injection](runtime/provider.md) |
| Runtime | [ctx.llm](runtime/ctx-llm.md) |
| Runtime | [ctx.agent](runtime/ctx-agent.md) |
| Runtime | [Model switch keeps the tool set](runtime/model-switch.md) |
| Runtime | [Kiro](runtime/kiro.md) |
| MCP client | [ctx.mcp](mcp-client/ctx-mcp.md) |
| MCP client | [Server config](mcp-client/server-config.md) |
| MCP client | [Supported agents](mcp-client/supported-agents.md) |
| MCP server | [Authoring projection](mcp-server/projection.md) |
| MCP server | [Author surface](author-surface.md) |
| MCP server | [Authoring tools](mcp-server/tools.md) |
| Panel | [Owner surface](owner-surface.md) |
| Panel | [List and open](panel/list.md) |
| Panel | [Workbench](panel/workbench.md) |
| Panel | [Close panel](panel/dock.md) |
| Panel | [Responsive layout](panel/responsive.md) |
| Panel | [Page find](panel/find.md) |
| Panel | [Settings](panel/settings.md) |
| Panel | [MCP servers](panel/mcp.md) |
| Panel | [Credentials](panel/credentials.md) |
| Panel | [Theme](panel/theme.md) |
| Panel | [Git UI](panel/git.md) |
| Panel | [Storage browse](panel/storage.md) |
| Panel | [Reload and delete](panel/reload.md) |
| Panel | [Panel chrome language](panel/language.md) |
| Shell | [Construction](shell/construction.md) |
| Shell | [Window and event bridge](shell/window.md) |
| Shell | [Embedded navigation](shell/navigation.md) |
| Author skill | [Write loop](author-skill/write-loop.md) |
| Author skill | [Facades and looks](author-skill/facades.md) |
| Author skill | [What the skill must keep true](author-skill/skill-contract.md) |

[Trust](trust.md)
