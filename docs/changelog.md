---
status: locked
updated: 2026-10-05
---

# Changelog

This page owns released version notes. The product version is the `version` field of `@mohou/shell`. `@mohou/host` carries the same string because the about block prints it. The window crate uses the same string. [development.md](development.md) owns the build command.

## 1.0.20

A tool in the MCP server dialog is a reference now instead of one paragraph. The panel shows the schemas the server declared: every top-level input field with its type, whether it is required, and its description, the schema itself as JSON, and an output section when the server sends one. The input schema was already answered to the agent by `mini_app_mcp_tools`; the panel's check was the copy that dropped it.

## 1.0.18

An update says what it is doing and how it ended. The card that offers a version now also carries the install: it counts the wait up, says the window will restart and not to close it, and after the restart names the outcome — the version now running, or why the attempt did not finish and the version it fell back to, with the install log beside it. Before this, the offer was one line and every failure was one sentence, or on Windows nothing at all.

The launcher writes one record per attempt, and the panel reads it once and acknowledges it. A failed install reports a closed reason — the budget ran out, the installer exited with a code, the prefix was not ready, the window closed, or an earlier attempt was left behind — instead of leaving the reason in a log that the next attempt truncated.

## 1.0.17

A credential's description can be edited on its own. The stored secret never leaves the store, so the edit form leaves the secret field empty and saving it that way keeps the value that is already there; a new credential still needs one. Nothing reads a secret back to the panel to make this work: the host asks the store for the value it is about to keep.

## 1.0.16

Changing MCP configuration while the host runs keeps its promise now. A server whose value is `${env:NAME}` or `${credential:NAME}` works as soon as it is saved, in the panel and through the authoring tools, with no restart: the write hands the live client resolved values, where before it handed over the reference text and the running process authenticated with the literal `${credential:...}`. The check had always resolved, so a server could report a full tool list and still behave differently the moment it ran.

Adding or removing one server no longer damages the others. Those tools read the file through the masked view meant for an agent, and wrote it back, so every other credential-shaped value became its own mask — `ghp_realsecret1234` to `ghp_re*****34`, a string that still looks like a token and no longer works. The masked view is now only ever an answer.

A server whose reference names nothing is left out of the running set and reported, in the panel and to the agent, the same way the last release began handling it at boot.

## 1.0.15

Pi stays available after a hot update. The install drops Pi's peers from the prefix, and the next sidecar repaired them but could not use them: the load asked the runtime whether a peer resolved before it created the link, and the runtime remembers a failed resolution for the life of the process. The load now repairs first and asks the runtime once. It also retries an attempt that failed, instead of answering every later caller with the first failure, and says why when it cannot load. Previously the workaround was to reopen the app.

## 1.0.14

Credentials have an editor: a new settings section creates, edits, and removes accounts. A secret is written once and never listed back, so the panel shows a name, a description, and the reference a server writes to use it. The store is one provider with a read side and a write side, and its file is owner-only.

A server value may name where its secret lives instead of holding it: `${env:NAME}` reads the environment, `${credential:NAME}` reads that store. A value in a command, an argument, a URL, an environment entry, or a header. The file keeps the reference, so re-editing a server cannot destroy it.

A name that exists nowhere leaves that one server out: it does not start, the panel says so with the reason and the next step, and `mini_app_mcp_list` reports the same code. The host still starts, which is what lets the credentials section fix it. The value never becomes an empty string.

The authoring token now also guards the routes that change host configuration, start a process from that configuration, install an update, or copy into another assistant's home, together with the credential store. A caller naming the local port without that token is refused before any body is read.

## 1.0.12

A failed backend or UI build keeps the text esbuild produced. `mini_app_reload` reports the file, line, and symbol that failed — `No matching export in "shared/mcp.ts" for import "MCP_PRESETS"` — in place of the sentence `ui failed to bundle`. A resolve rule Host names for itself still wins.

A view query for an app the panel has not opened returns `not-open` at once. The panel reports that it holds no frame for the app, and that report clears the liveness marker a closed tab would otherwise leave behind. `stuck` therefore means a thread that really is blocked, and `runner-not-booted` means a frame that never started; the timeout hint names the step, open or reload the app in the panel.

A rendered outline no longer stops at an inline SVG: the class list of an SVG element is read the way the DOM stores it.

## 1.0.11

The authoring surface adds and removes MCP servers (`mini_app_mcp_add`, `mini_app_mcp_remove`), and a saved server list takes effect without a host restart: the MCP client can replace the set it holds while it runs.

A returned server row masks the credential values it recognizes, by name segment or by value shape, and keeps the label that says what the value is: `Bearer ab*****gh`, `ghp_12*****90`. An ordinary setting such as `NODE_ENV` comes back unchanged.

## 1.0.10

Agent settings install into DSH: the writing skill goes to `~/.dsh/skills`, and the authoring MCP connection is written into the active DSH profile's patch layer, which survives a profile rebuild.

`pnpm migrate:legacy` rewrites app source under a runtime root that predates the rename, clears a `.autogen` bundle that still names a retired scope, and moves `mini-app-*.tgz` aside. [development.md](development.md) owns the command.

The kit owns its component examples: `packages/app/ui/examples/` is compiled by `pnpm typecheck` and published into the skill. The look pages are hand-written skill pages rather than generator output.

## 1.0.9

The publish set moves to the `@mohou` npm scope, and the author skill is `mohou-mini-app`, so an agent installs it under that name. [Package architecture](architecture/packages.md) owns the set.

The palette list kept `origin`, but the panel client dropped it. Every row stayed marked system. The client now keeps `builtin` and `custom`.

## 1.0.8

Scrollbars in an app and in the panel are thin on macOS and Windows. A shipped palette is marked system. A file in the themes directory is marked custom. An app `theme.css` is marked app, and the row uses that file's name when the header has one.

## 1.0.7

The status row stays above the workbench and is not covered by it. The probe result sits in the space beside the probe button, not over the model fields. A package update that does not finish opens the installed version. It does not stay pending. The install still omits peer dependencies, so optional Pi peers are not fetched. `react-is` is a direct dependency, so that omit does not remove it. Pi registers itself after the sidecar starts. A failed load does not keep the splash up. A later open reuses the last shell PATH instead of waiting for the login shell. The splash names the step in progress.

## 1.0.6

The agent probe result sits beside the probe button. Settings, history, and storage cover the status row. The status row is one line again. A finished mini-app call does not clear the live runtime provider.

## 1.0.5

When a workbench fills the slot, the status row chip names a custom home, more in a tab, and an open-in-new-tab arrow. Clicking current home on a workbench tab writes the builtin library. Opening settings, history, or storage, and closing a tab, no longer flash a window scrollbar. An in-app update runs the same Node's npm that boots the sidecar. Dock launch reads PATH from an interactive login shell, the same way a terminal finds node and npm. An MCP reconnect that exhausts its budget leaves the server registered; `mcp-not-connected` is an unknown id only.

## 1.0.4

App-tab set-as-home is pin plus the home label; delete is a trash icon in the same block. Chrome hints use the panel tooltip with card, border, and foreground tokens. The home desk switcher shows a grid icon on the builtin library and an acronym tile on each workbench. The status-row workbench control stays on the right. An update confirm returns before the sidecar restarts, so a dropped connection is not a failed install.

## 1.0.1

Settings, history, and storage open with a short rise instead of a hard fade. Local app bundles copy their tarballs to `~/.mini-app/packages` so an installed tarball build can see a newer pack.

## 1.0.0

Product name is Mohou (墨猴). The window title follows the panel locale. [Window and event bridge](product/shell/window.md) owns the name.

`pnpm build:artifact` writes `artifacts/Mohou-1.0.0-<platform>/`. That directory holds the release window binary named Mohou, the panel bundle, a `VERSION` file, and a `run` script. The script starts Host from this checkout and points it at that directory. It is not a signed installer. Native addons stay in the workspace install.

The ten workspace packages publish at this version. `pnpm publish:packages` uploads them only when `MINI_APP_PUBLISH=1`. [Package architecture](architecture/packages.md) owns the set.

### Shell and Host

- One live Host session. Window exit, `SIGINT`, and `SIGTERM` dispose it.
- An external `http` or `https` link, and `mailto:`, open outside the app. Same-origin links stay. `javascript:` runs in the iframe. There is no contained browser.
- `ctx.log` appends JSON lines under `apps/<appId>/logs/`. History snapshots skip `logs/`, `dist/`, `.cache/`, and `.autogen/`.
- Compile writes the UI bundle and stylesheet under `.autogen/`.
- App opens are recorded in `activity.json` and returned on the owner list as `activity`.
- Authoring register takes manifest fields and returns `needed` paths. The agent writes source with its own file tools. A `files` field is rejected.
- A successful reload of a dirty tree commits. A failed reload does not.
- Runtime diagnostics stay off `ctx.push`. A view render error paints in the iframe. A module load failure paints into the app root.
- Open app tabs share one host event stream. The tab appears before the bundle finishes building.

### Panel

- Library gallery with card styles `glass`, `stamp`, `etch`, `hero`, `pulse`, and `list`.
- Workbench slot: a workbench app fills the home frame; the tab strip and host chrome stay on the panel. `ctx.workbench` is the app API.
- Settings, theme picker, MCP editor, history (read-only), storage browse with restore, reload and trash delete.
- Close-panel is hidden in the shipped window. There is no dock mode. Narrow layout is deferred.

### App contract and kit

- `ctx` members: storage, state, credentials, config, log, signal, http, bash, pwsh, metrics, push, llm, agent, mcp.
- `useApp().call`, `on` / `onAny`, and `resolveAssetUrl` for `assets/`.
- UI kit with layout presets, editors, charts, illustrations, and `LiveRefresh` for app-owned soft timers. Kit coverage is outside the 85% gate.
- Facades and looks ship in the author skill. Skill version is independent of the package version.
- Authoring MCP discovery is two tools: `mini_app_mcp_list` returns server and tool names only; `mini_app_mcp_tools({ serverId, toolName? })` returns descriptions and schemas for one server. Both are on the author MCP catalog and HTTP invoke, not on `ctx`.

### Platforms

- macOS and Windows code paths ship together. A Windows machine pass of the Tauri window is after 1.0.
- Linux has no panel window.
