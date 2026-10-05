# Agent Note: A write resolves, and a masked row is never a write input

Status: implemented

## Problem

Two defects sat on the same path: changing MCP configuration while Host runs, through the authoring tools (`mini_app_mcp_add`, `mini_app_mcp_remove`) or the panel's save (`POST /api/mcp-servers`). Both disappeared after a restart, which is why they survived review.

**The write handed the live client unresolved specs.** `writeMcpEditor` promised to "return the specs they resolved to" and returned `editorToConfig(servers)` instead, which validates and shapes but never resolves. Boot resolved through `resolveServerMap`, and the panel's check resolved through it too, so the check reported success and a full tool list while the process the live client spawned received the literal `${credential:NAME}`. A Jira server showed this as 109 tools at check time and 55 tools live: the child validated a base URL of `${credential:JIRA_BASE_URL}`, failed its own option check, and registered the tools that needed no base.

**The authoring tools wrote the masked view back.** `addMcpServer` and `removeMcpServer` read the file with `readMcpEditor(root, env, true)` — the sanitized view that exists so an agent is not handed secrets — and used those rows as the write input. Adding or removing any one server replaced every other server's credential-shaped value with its own mask: `ghp_realsecret1234` became `ghp_re*****34`. The mask keeps the first and last two characters, so the file kept something that looks like a token and fails authentication; the real value was gone from the file with no backup.

## Decision

One resolve rule, and the mask stays on the reading side.

- `resolveMcpServers(admitted, sources)` is the shared step: one server at a time, the servers that resolved plus a `failures` list. Boot (`loadMcpServers`) and a write (`writeMcpEditor`) both answer it, so a file written at runtime reads back the way the next boot reads it.
- `writeMcpEditor` takes `sources`, writes the file with each reference intact, and returns `{ servers, failures }`. Its callers put `servers` live: the panel's save route, `mini_app_mcp_add`, and `mini_app_mcp_remove`.
- A server whose reference names nothing is left out of the live set and reported, the rule boot already used. A write cannot silently start a server holding a placeholder.
- The add and remove tools read the file unmasked for the write input, and answer with `maskEditorServers(...)`. The mask moved to the answer, where it belongs, and one exported helper owns it.
- The live failures are session state, not a boot snapshot: boot sets them and every write replaces them, so `/api/mcp-servers`, `mini_app_mcp_list`, and `mini_app_mcp_tools` report the current truth. A save answers the same list, so the panel marks a server as not running as soon as the save lands rather than at the next load.

## Alternatives considered

- Resolve in each caller and leave `writeMcpEditor` alone. Three call sites would each repeat the step, and the next one added would repeat the omission; the function's own contract already said resolved.
- Resolve before writing the file, so a bad reference changes nothing. That would block saving a server whose credential is not created yet, which is a normal order to work in, and it contradicts the per-server rule: the file is the user's, and one missing value leaves one server out.
- Keep reading masked rows and unmask them before the write. A mask is not reversible by design, so there is nothing to unmask.

## Consequences

A credential reference now works the moment it is saved, in both the panel and the authoring tools, with no restart.

Every other server's `env` and `headers` survive an add or a remove byte for byte. A regression test asserts exactly that, plus the resolved value reaching the child, the panel route resolving too, and a missing name leaving its server out while the write reports it.

The panel's `unresolved` marker is now live state rather than an answer about the boot that has since been superseded.
