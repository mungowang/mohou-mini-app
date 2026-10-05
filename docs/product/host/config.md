---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# Config

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Host for the file. Shell calls bootstrap before constructing Host. Panel edits the public fields over HTTP.
- Input: `host.json` at the runtime root. Fields: `runtimeRoot`, `hostPort`, `theme`, `palette`, `locale`, `chatLanguage`, `llm`, `runtimeProvider`, and optional `updateRegistry`. `runtimeProvider` is `{ id, config?: { provider?, model?, options? } }`.
- Output: a running Host bound to `hostPort`, or a process that exits on a bad file. First boot, when the file is absent, writes a complete seed after probing a free loopback port from the seed preferred port. The seed includes `runtimeProvider: { id: "echo" }`. Port, locale, theme, and palette in that seed are host policy and are not locked. When an existing file's `hostPort` is busy at start, Host does not rewrite the file by itself. Shell shows a blocking confirm (busy port → suggested free port). Accept writes the new port and continues; quit leaves the file unchanged and aborts start. After accept, the user must refresh authoring MCP the same way as after a settings port change.
- Failure: a present file that is not JSON, that lacks a required field, or that has an illegal value fails Host boot with `host config <field> is invalid` or `host config missing <field>`. Load does not invent the missing field. A settings save of an illegal port (not an integer from 1024 to 65535) is rejected and the file is unchanged. A busy saved port without accept fails start with `port-in-use`.
- `updateRegistry` is the registry this product's own update check and update install use, for an owner whose network needs a mirror. An empty string means the packaged default. Precedence: `MINI_APP_NPM_REGISTRY` in the environment, then `updateRegistry`, then the install prefix's build-time registry. Only our own npm children see it — a `--registry` argument on that one process — so `~/.npmrc` and an app's own dependency installs stay the owner's. A saved value applies at once; no restart is required.
- A saved port and a saved runtime provider apply on the next Host start. The response says restart is required.
- Non-goals: a partial config that "mostly works"; silent skip of a corrupt file; storing the authoring token or MCP secrets in this file.

## Implementation


Role: `resolveHostConfig` and `writeHostPolicy`. A missing file writes a complete seed. A present bad file emits `config-missing` or `config-invalid` and is not rewritten. `probeBrain` does not write and does not switch the live brain. `GET` and `POST /api/host-config` are mounted. Port, locale, theme, and palette values in the seed are not locked. Plan: [implementation.md](../implementation.md).
