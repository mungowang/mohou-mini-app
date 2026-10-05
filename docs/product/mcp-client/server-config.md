---
status: shape-locked
progress: settled
updated: 2026-10-03
---

# Server config

Layer: [MCP client](README.md). Index: [features.md](../features.md).

- Owner: MCP client. Shell points Host at the runtime root. Host reads the file.
- Input: `mcp.json` in the runtime root, or the path in `MINI_APP_MCP_CONFIG` when that variable is set. Shape: a map of server id to `{ command, args?, env? }` or `{ url, transport?, headers? }`. An `mcpServers` wrapper is accepted. An entry named `settings` is skipped. An entry with neither `command` nor `url` is invalid.
- A string in a spec may hold a reference instead of a value: `${env:NAME}` reads the host environment, `${credential:NAME}` reads the credential store ([Credentials](../host/credentials.md)). References work in `command`, `args`, `url`, `env` values, and `headers` values. One named step in the MCP client resolves them from two lookups the host binds, so the store behind `credential` is [Shell's choice](../shell/construction.md). The file keeps the reference: only the copy handed to a client carries a value.
- A reference that names nothing is `mcp-reference-unknown`, and its message names the server, the field, and the name. A reference with no closing brace or no name is `mcp-reference-invalid`. A value that is present but empty counts as absent. A `${…}` that names neither kind stays literal.
- The scope of that failure is the server, not the host: that one server is left out and the rest start. The file still lists it, the panel's MCP section says it is not running and why, `mini_app_mcp_list` reports it with the same code, and the panel's check reports it live. Failing the whole boot would be circular, because the section that adds a missing credential is served by the host that would have refused to start.
- Every path that hands a spec to a live client resolves it first: boot, the panel's check, the panel's save, and the authoring tools that add or remove a server. A write answers the resolved servers together with the ones a reference left out, so a file changed at runtime reads the way the next boot would read it.
- A reader that is not the file's owner sees masked values, and that masked view is never a write input: writing it back would replace each other server's secret with its own mask.
- Output: zero or more server specs. A missing file means zero servers.
- Failure: a present file that is not valid JSON, or that is not the map shape, fails Host boot: that file is unusable, and no server can be read from it. An unresolved reference is a different class and does not: the file is valid and one value is missing.
- The panel editor is [MCP servers](../panel/mcp.md). This page owns the file. That page owns the form.
- Non-goals: discovering servers from another product's home directory.

## Implementation


Role: `loadMcpServers` reads the default file, or `MINI_APP_MCP_CONFIG` when that variable is set, and `writeMcpEditor` replaces it. Both resolve references one server at a time through `resolveServerValues` (`packages/mcp/client/src/references.ts`) in one shared step, `resolveMcpServers`, and both answer the servers that resolved plus a `failures` list for the ones that did not. `mcpReferenceSources(env, credentials)` is the one place Host binds the two lookups. A missing default file is zero servers. A present bad file, or a missing explicit path, is `config-invalid` and is not treated as zero servers. No other directory is searched. Plan: [implementation.md](../implementation.md).
