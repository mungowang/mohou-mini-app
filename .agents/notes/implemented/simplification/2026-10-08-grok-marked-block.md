# Agent Note: Grok install owns only its marked block

Status: implemented

## Problem

The Grok MCP write scanned `config.toml` to delete every `[mcp_servers.mini-app]` table, child table, and inline key, and to decide whether a server outside the markers was installed. That scanner lived in `packages/host/src/host/author-mcp.ts`. The DSH row in the same file only replaces the text between `# >>> mohou:mini-app` and `# <<< mohou:mini-app`.

## Decision

The Grok write uses that same splice. `writeMarkedBlock` and `hasMarkedBlock` serve both rows. The Grok block is still the `url`, `enabled = true`, and `Authorization` tables, with those two values written as TOML basic strings. A `[mcp_servers.mini-app]` table outside the markers stays in the file. Installed means the start marker is present. Current means the marked block equals the block this write would emit. The product page is [Supported agents](../../../../docs/product/mcp-client/supported-agents.md). This supersedes the merge half of [Grok CLI is an install target](2026-10-08-grok-install.md).

## Alternatives considered

- Keep the scanner so a server from `grok mcp add` is folded into one table. Lost because it is a TOML subset parser for a file this product does not own, and the DSH row already leaves foreign entries in place.
- Parse with `smol-toml` or `@decimalturn/toml-patch` and write the document back. Lost because a parse-and-stringify rewrites comments, and a comment-preserving patch library is a new dependency for the two lines this product already emits.

## Consequences

- A config that already contains `[mcp_servers.mini-app]` without the markers keeps that table. The write appends a second one, and TOML then rejects the file until one of them is deleted.
- A hand-written `\u` escape is not treated as the same token. Current is a byte compare of the marked block.
- The skill row is unchanged.
file_path‬/Users/wangpeng/Workspace/Source/monkey-mini-app-next/.agents/notes/implemented/simplification/2026-10-08-grok-marked-block.md
</file_path>
</file_path>
</file_path>