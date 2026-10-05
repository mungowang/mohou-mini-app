# Agent Note: An MCP tool shows the schema its server declared

Status: implemented

## Problem

The tool browser in the MCP settings section showed a name and a paragraph. For a server like Jira — 109 tools, most of them taking structured arguments — that is the least useful half of what the server had already told Host.

Nothing was missing on the wire. The MCP client's `listTools` returns each tool's `inputSchema`, and `mini_app_mcp_tools` already answers the agent with `{ name, description?, inputSchema }`. The panel's own path was the copy that dropped it: `checkMcpEditor` mapped every tool to `{ name, description? }`, the shell client parsed only those two fields, and the dialog had nothing else to render.

## Decision

The check row carries both schemas, and the dialog renders them.

- `McpCheck.tools` and the panel's `McpCheckResult.tools` are one row shape: `{ name, description?, inputSchema?, outputSchema? }`. `inputSchema` is required by the protocol; `outputSchema` is present only when the server declares one, so its absence is not a failure.
- `McpClient.listTools` widens to pass `outputSchema` through. The SDK already returns it and the previous cast dropped it by type, not by value.
- The shell client admits each schema only when it is a JSON object. A row whose schema is a string or an array reads as no schema, which is the same rule the panel already applies to other wire shapes.
- The dialog shows the top-level `properties` of a schema: name, type, a `required` marker, and the property's own description. A type that is not a plain name is labeled `object`, `array`, or `any` rather than rendered as `undefined`. The schema itself follows as JSON, so a nested argument (Jira's `fields`) is still readable, and an output section appears only when the server sent one.

## Alternatives considered

- Render the raw JSON only. Fewer decisions, but a nested schema is exactly where a person stops reading; the field list is the part that answers "what do I pass".
- Render the fields only. A nested `properties` tree loses its shape in a one-line type label, and the raw schema is what an author copies into a call.
- Put the schemas on `GET /api/mcp-servers`. That route answers stored configuration; a schema is a live fact from a running server, and the check is the call that already starts it.
- Add `outputSchema` to `mini_app_mcp_tools` as well. It is a documented agent-facing shape; widening it is its own decision, and this change is about the panel.
- Fetch the schema when a tool is selected. That would start the server again for a fact the check already had in hand.

## Consequences

A check payload grows with the tool count: 109 tools now carry their schemas to the panel. The check runs on request and not at boot, and the dialog's detail pane already scrolls, so nothing else pays for it.

The panel and the agent still do not show identical rows: `mini_app_mcp_tools` answers `inputSchema` and no `outputSchema`. That difference is deliberate and now stated in [author-surface.md](../../../../docs/product/author-surface.md).

A server that declares no properties shows the no-fields line, and one that declares no output schema shows no output section — the dialog never invents a schema to look complete.
