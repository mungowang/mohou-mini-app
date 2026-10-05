# Agent Note: An MCP value may name where its secret lives

Status: implemented

## Problem

A server that needed a token held the token. `mcp.json` carried it in the clear, the panel read it back because it has to edit the file, and the child process environment was scrubbed of every credential-looking ambient variable, so "export it and let the child inherit it" was never a path. The authoring tool could only paste the value again.

That also made the leak reachable twice: the file on disk, and every listing that shows it, masked or not.

## Decision

Every string in a server spec may hold a reference. `${env:NAME}` reads the host environment; `${credential:NAME}` reads the credential provider. They work in `command`, `args[]`, `url`, `env` values, and `headers` values, because a token arrives through any of them.

One named resolve step owns it: `resolveServerValues` in `@mohou/mcp-client`, over two plain lookups (`env`, `credential`) that Host binds in `mcpReferenceSources`. The resolver knows no file, no keychain, and no provider package, so the storage swap is a binding change. A credential lookup may be async, because the provider reads its store per call.

The file keeps the reference. Only the copy handed to `McpClient` carries a value, so a save never writes a secret back over the placeholder.

A reference that names nothing is `mcp-reference-unknown`, naming the server, the field, and the name. A reference with no closing brace or no name is `mcp-reference-invalid`. A value that is present but empty counts as absent: `Bearer ` is worse than a boot error. A `${...}` that is not one of these two kinds stays literal, so an unrelated placeholder survives.

The failure is scoped to the server. `loadMcpServers` resolves one server at a time and returns the servers that resolved plus a `failures` list; the host boots without the ones in that list. Failing the whole boot would be circular: the credentials section that adds the missing name is served by the host that would have refused to start. The file being unusable — bad JSON, not the map shape — still fails boot, because nothing can be read from it.

Boot resolves, and the panel's check resolves through the same call, so a check that passes is a server that starts. A server left out is reported three ways: the panel's MCP section marks it `Not started` with the reason, `mini_app_mcp_list` carries the same code and message, and the check reports the current truth on demand.

## Alternatives considered

- Bare `${NAME}`, as one assistant client does. Lost: our config is edited and written back by a panel, so a bare placeholder is likelier to collide with a value that legitimately contains `${…}`, and an explicit scheme leaves room for another kind later.
- Resolve inside `McpClient`. Lost: the check path and the boot path would each have to remember, and the client would need the credential provider.
- Hand the child the whole ambient environment, as other clients do. Lost: our child env already withholds credential-named variables; naming the ones a server needs keeps that property.
- A default value form (`${env:NAME:-fallback}`). Lost: a missing key would quietly become a half-working server instead of a boot failure. The syntax leaves room to add it.

## Consequences

A missing name names itself instead of failing later inside a server, and it takes down only that server. A placeholder survives a save, so re-editing a server cannot destroy the reference, and neither the model-facing listing nor the file holds a value for a referenced account.

An older panel or a hand-written `mcp.json` keeps working: a literal value has no reference and passes through unchanged.
