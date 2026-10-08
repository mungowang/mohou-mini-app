# Agent Note: Grok CLI is an install target

Status: implemented

The file-merge sentences in Decision are superseded by [Grok install owns only its marked block](2026-10-08-grok-marked-block.md). The dest rows still stand.

## Problem

Settings → Agent can copy the writing skill and merge the authoring MCP server into Claude, Pi, Cursor, OpenCode, Kiro, WorkBuddy, and DSH. Grok CLI reads neither of those files. Its user skills are directories under `$GROK_HOME/skills`, and its MCP servers are `[mcp_servers.*]` tables in `$GROK_HOME/config.toml`. Without a row, an author pasted both by hand.

## Decision

Both dest tables carry `grok`. The home is `$GROK_HOME` when that variable is a non-empty path, otherwise `~/.grok`. The skill directory is `$GROK_HOME/skills`. The MCP file is `$GROK_HOME/config.toml`, format `grok`. The server name is `mini-app`, and the entry is the `url`, `enabled = true`, and `Authorization` header that `grok mcp add --transport http` writes. The merge is text. The block sits between `# >>> mohou:mini-app` and `# <<< mohou:mini-app`. A later write replaces that block and also removes any other `[mcp_servers.mini-app]` table, `[mcp_servers.mini-app.*]` table, or `mini-app` key on `[mcp_servers]`, so the server is present once. A copy of that header inside a multiline string stays. The product page is [Supported agents](../../../../docs/product/mcp-client/supported-agents.md).

## Alternatives considered

- Run `grok mcp add`. Lost because the other rows write the assistant file directly, and a test can see that file without a Grok binary.
- Parse `config.toml` and serialise it again. Lost because the rest of the file is the user's, comments included.
- Write the repository `.grok/config.toml`. Lost because the other rows are the user home, and a committed file would hold this host's bearer token.
- Point the bearer at `bearer_token_file`. Lost because the other rows store the bearer in the assistant file.

## Consequences

- The install writes the file. A Grok that is already running keeps its current servers until it reloads MCP config. The next start reads the file.
- `$GROK_HOME` moves the skill row and the MCP row together. A whitespace-only value is the default `~/.grok`.
- A second install replaces the server instead of appending a second table, which TOML would reject.
