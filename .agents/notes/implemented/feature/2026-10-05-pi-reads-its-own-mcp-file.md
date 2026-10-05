# Agent Note: Pi 1.0 has its own MCP file, and a provider can say why it failed

Status: implemented

## Problem

Two reports, one version apart.

Pi 1.0 reads MCP servers from `mcp.json` in its agent directory — `~/.pi/agent/mcp.json` — with the `mcpServers` shape other clients use, and it validates that file. Mohou pointed at `~/.pi/agent/mcp-adapter.json`, the file of the `pi-mcp-adapter` extension that Pi 1.0 made unnecessary, and it detected Pi by whether the agent directory existed. So the import wrote where a current Pi does not read, the row said Pi was not detected on a machine where Pi was installed but had not run yet, and the entry carried the adapter's `transport: 'streamable-http'` plus a `_monkeyagent` marker — keys a validating reader may reject.

The second report was Pi showing as unhealthy on Windows with nothing else to go on. The settings probe answered `runtime provider is not healthy: pi` for every failure, while the provider itself had the reason: `piLoad` records why the last attempt failed, and Pi's own wrapper already composed that into `pi is not available: <reason>` for the errors it throws. The probe simply never asked.

## Decision

**Pi gets two rows, and the native one is the default reading of Pi.** `Pi` writes `~/.pi/agent/mcp.json` with the keys Pi documents, detected by `~/.pi` rather than by its agent directory. `Pi · mcp-adapter` keeps writing `~/.pi/agent/mcp-adapter.json` for a Pi that still runs the extension. The person picks; nothing is written twice, and no existing file is migrated.

**The entry shape is a property of the target.** `McpAgentTarget.entry` is `url` for a client that validates its file and `extended` (the default) for the ones that already accept `transport`, `description`, and the marker. Only Pi's native row uses `url`, so the other destinations keep the bytes they had.

**A provider can answer `reason`.** `RuntimeProvider.reason()` is optional and answers why `healthy()` is false. `probeBrain` uses it as the probe's message on both paths, and the panel already renders that message verbatim — it had a `probeText` branch for a host message all along. Pi's wrapper returns `unavailable(piLoad.failure())`, the same string its `llm` and `agent` already threw.

**The import paths come from one place.** `boot.ts` had its own copy of the Pi path next to `builtinMcpAgents`; it now derives the whole map from that table, so a second Pi row needed no second edit.

## Alternatives considered

- **Replace the adapter file with the native one.** Pi 1.0 is current, so this is tempting, and it strands a Pi that still runs the extension: the servers Mohou imports would land in a file that Pi does not read, with no way to tell.
- **Write both files on every import.** Two homes for one fact, and a Pi 1.0 user would carry a file the extension owns.
- **Give the native entry the extended shape.** Pi documents `{ url, headers }` for an HTTP server. `transport` and `_monkeyagent` are our additions, and a validating loader is entitled to refuse them.
- **Detect Pi by `~/.pi/agent`.** That directory appears when Pi first runs, so a fresh install looked like no Pi at all — the report this change answers.
- **Make `healthy()` return the reason.** It would change a boolean every caller reads, to carry text only the probe wants.
- **Widen the peer search in the same change.** The Windows reason may well be "the peers are somewhere we do not look", and that fix depends on which somewhere it is. This change makes the machine say so; the search follows the answer.

## Consequences

A Pi 1.0 user imports the authoring MCP into the file their Pi reads, and a Pi running the adapter keeps working. Nothing is deleted or migrated.

`unhealthy` now has a reason beside it in Settings, which is also how the Windows peer question is going to be answered: the message names the failure instead of the state.

The two Pi rows differ only by file and a chip, and both are offered whether or not either file exists yet — the row's `homePresent` marker is what says whether that client's home is there.
