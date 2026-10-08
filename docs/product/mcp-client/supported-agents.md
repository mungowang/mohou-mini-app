---
status: locked
progress: settled
updated: 2026-10-08
---

# Supported agents

Layer: [MCP client](README.md). Index: [features.md](../features.md).

Settings → Agent installs the writing skill and the authoring MCP server into the assistants below. Shell names the rows. Host writes the files. Panel draws the rows the host returns. The operations are [readAuthorSkill / writeAuthorSkill](../owner-surface.md#readauthorskill--writeauthorskill--revealauthorskill) and [readAuthorMcp / writeAuthorMcp](../owner-surface.md#readauthormcp--writeauthormcp--revealauthormcp). The form is [Settings](../panel/settings.md).

This page names those dests. The servers this product calls are [Server config](server-config.md).

Paths are under the user home: `~` on macOS, `%USERPROFILE%` on Windows. An environment value that is only whitespace is unset. The skill copy lands at `<skill directory>/mohou-mini-app/`. The MCP server name is `mini-app`. A row whose home directory is missing is a missing home.

| Assistant | Skill directory | MCP file |
| --- | --- | --- |
| Claude | `$CLAUDE_CONFIG_DIR/skills`, or `~/.claude/skills` | `$CLAUDE_CONFIG_DIR/.claude.json`, or `~/.claude.json` |
| Pi | `~/.pi/agent/skills` | `~/.pi/agent/mcp.json` |
| Pi · mcp-adapter | — | `~/.pi/agent/mcp-adapter.json` |
| Cursor | — | `~/.cursor/mcp.json` |
| OpenCode | `$XDG_CONFIG_HOME/opencode/skills` | `$XDG_CONFIG_HOME/opencode/opencode.jsonc` |
| Kiro | `~/.kiro/skills` | `~/.kiro/settings/mcp.json` |
| WorkBuddy | `~/.codebuddy/skills` | `~/.codebuddy/mcp.json` |
| DSH | `~/.dsh/skills` | the active profile's `cordis.patch.yml` |
| DSH · Desktop | — | `$DSH_HOME/profiles/desktop/cordis.patch.yml` |
| Grok | `$GROK_HOME/skills` | `$GROK_HOME/config.toml` |

- `$XDG_CONFIG_HOME` defaults to `~/.config`. `$GROK_HOME` defaults to `~/.grok`. `$DSH_HOME` defaults to `~/.dsh`.
- The DSH skill directory stays `~/.dsh/skills` when `$DSH_HOME` is set. The two DSH MCP rows follow `$DSH_HOME`. The active profile is `$DSH_PROFILE_DIR` when that variable is set, otherwise `$DSH_HOME/profiles/<name>`, and `<name>` is `$DSH_PROFILE` or `web`. The desktop profile appears after that app has opened once. DSH locks it, so the app has to be quit while the file is written.
- WorkBuddy uses CodeBuddy's home.
- Pi writes `{ url, headers }` under `mcpServers`. Cursor, Kiro, WorkBuddy, and Pi · mcp-adapter also write `transport`, `description`, and the `_monkeyagent` marker. Claude writes `{ type: http, url, headers }` under `mcpServers`. OpenCode writes `{ type: remote, url, enabled: true, headers }` under `mcp`. A JSON write leaves the other servers in that file.
- DSH and Grok are text between `# >>> mohou:mini-app` and `# <<< mohou:mini-app`. A later write replaces that block and copies every other byte through, including a server written outside the markers. Grok's block is `[mcp_servers.mini-app]` with `url`, `enabled = true`, and an `Authorization` header. Two `[mcp_servers.mini-app]` tables make the file invalid TOML. For these two rows, installed means the start marker is present, and `updateAvailable` means the marked block differs from the block this write would emit.
- The write creates a missing file or skill directory. It does not launch the assistant.

## Non-goals

- A brain for one of these assistants. `ctx.llm` and `ctx.agent` gain no provider from this page.
- Running that assistant's CLI to install the server.
- Importing a DSH or Grok file from the MCP editor. That import reads JSON.

## Implementation

Role: Shell. `builtinSkillAgents` and `builtinMcpAgents` are the rows. Host `writeAuthorSkill` copies into `skillsDir`. `writeAuthorMcp` rewrites a JSON server map, and for `dsh` and `grok` replaces the marked block through `writeMarkedBlock`. Panel renders the rows the host returns. Plan: [implementation.md](../implementation.md).
