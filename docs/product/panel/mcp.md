---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# MCP servers

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel for the editor. Host for the file. The file shape is [Server config](../mcp-client/server-config.md).
- The editor is its own settings section. It is not a row inside runtime, network, or [writePolicy](../owner-surface.md#writepolicy).
- The person adds, edits, and removes servers. Each server uses the shape that file already accepts. An `env` or `headers` value may hold `${env:NAME}` or `${credential:NAME}` ([server config](../mcp-client/server-config.md)); the form says so and the check reports a reference that names nothing. A disabled server is stored as `disabled: true` and is not started at boot.
- A server the live client left out because a reference named nothing stays in the list with `Not started` and the reason, and the section names the next step: add it in [Credentials](credentials.md), then restart the host. A save answers the row set it just put live together with what it left out, so the marker appears as soon as the save lands; the check reflects the current truth without a restart.
- Paste, a chosen JSON file, and the Pi import Shell points at (Pi 1.0's own `mcp.json` in its agent directory) are admitted by one parser. A fragment without braces is wrapped. A map, an `mcpServers` object, and one server object are accepted. Other editors' field names are mapped onto command, args, url, and env. Import does not write the file. It opens the add/edit form so the person can adjust and check, then save.
- Quick add fills the form for a server this product presets (`@mohou/jira-mcp`, `@mohou/gitlab-mcp`, `@kud/mcp-jenkins`, the last with its write tools blocked): the command, the arguments, and an `env` whose values are `${credential:NAME}` references. It writes no server, and it creates the credentials those references name as empty entries, so the next step is the Credentials section rather than a reference that names nothing. Nothing reaches `mcp.json` until the person saves the form.
- A server can be checked without saving: whether it connects, and which tools it exposes. Running uses the theme colour. The rest of the tool list opens in one dialog: names on the left, the selected tool's detail on the right. The detail is the description plus the schemas that check returned: each top-level input field with its type, whether it is required, and its description, the schema itself as JSON, and an output section only when the server declares one. A field whose type is not a plain name is labeled `object`, `array`, or `any`. A failed check stays on that server. It does not fail Host boot, and it does not mark the other settings sections dirty.
- Saving writes `mcp.json`. A check does not write the file. Delete asks first.
- Failure: a save that would make the file invalid is shown, and the file stays as it was. A check that cannot start the server shows that error, and for a server that exits instead of answering it also shows the server's own last output: `Connection closed` alone names no cause, and the process said one on the way out. An empty `{}` file is an empty list, not an import error.
- Non-goals: discovering servers from another product's home directory; editing a credential's value here (that is [Credentials](credentials.md)); editing theme CSS. Installing the authoring MCP into other assistants is [Settings](settings.md), not this editor.

## Implementation

Role: consumer. `McpSettings` calls `listMcp`, `writeMcp`, `checkMcp`, `admitMcp`, and `importMcp` on the injected client. Routes are in [host/http.md](../host/http.md). Admission lives in Host `mcp-import.ts`. Plan: [implementation.md](../implementation.md).
