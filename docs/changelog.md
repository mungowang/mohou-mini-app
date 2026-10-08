---
status: locked
updated: 2026-10-08
---

# Changelog

This page owns released version notes. The product version is the `version` field of `@mohou/shell`. `@mohou/host` carries the same string because the about block prints it. The window crate uses the same string. [development.md](development.md) owns the build command.

## 1.0.45

`DiffViewer` names how many change sites there are. Up and down step to the previous and next site.

## 1.0.44

`DiffViewer` keeps a ruler on the right. Each mark is one run of changed lines. A click scrolls that run into view. `ctx.http` adds `application/json` only when the caller did not already set `content-type`, in any letter case. A local tarball install does not revalidate the registry.

## 1.0.43

DSH's desktop profile is an install target now. The harness keeps one profile per mode under `$DSH_HOME/profiles`, and this product only offered the CLI's `web` one: the table gained **DSH · Desktop**, writing the same patch block into `profiles/desktop`. That directory belongs to the Electron app — it appears the first time that app runs, DSH takes a lock on it, and the app has to be quit while the block is written — which is also why the row is offered only when the profile exists. `$DSH_HOME` is respected for both rows; the old code assumed `~/.dsh`.

## 1.0.42

The trash glyph sat in the middle of the library header. That row spreads its children with `justify-between`, so a third child lands between the other two: the glyph and the search field are one group now, at the row's right edge.

## 1.0.41

The workbench template shows the trash. It is the template that demonstrates `ctx.workbench`, and it now demonstrates the two operations the panel's library uses for deleted apps: a block that appears only when the trash holds something, one restore per row, and the same name rule the panel applies — a homepage that draws its own cards decides that itself, because names are not identity to the host.

## 1.0.40

A workbench app can now do what the panel's library does with deleted apps: `ctx.workbench.listTrash()` returns them in the same shape `listApps()` uses, and `restoreApp(id)` puts one back, rejecting an id that is live or no longer in the trash. Both are the operations the panel's own trash route calls, so the built-in library and an authored workbench share one path rather than one of them holding a power the other cannot reach.

The library's first screen is apps again. The trash had been a row of deleted apps under the grid — leftovers competing with the thing the page is for, and a name that restored on a press nobody could read as an action. It is a bare glyph beside the search field now (muted until the pointer is on it, no count on the icon), and it opens a panel listing what was deleted with one restore action per row. A refused restore stays on that row: the host refuses an id that is live (`app-duplicate`), and the panel refuses a name that is taken, naming the app that holds it. `restoreApp` returns that message instead of reporting a failed restore as a failed deletion, which is what it used to do.

## 1.0.39

The workbench's chips — the shell choice, the MCP server, tool, and preset rows, the rail's filters and its recall button — painted the browser's default button face. On a white card that is invisible; on the translucent wells this app uses it showed as a white band behind the row, which the new shell chips made obvious. A raw `<button>` has no background unless it states one, so every chip states it in each branch: `bg-primary` when selected, `bg-transparent` when not. The branches are mutually exclusive on purpose — the order of classes in the attribute does not decide which wins, the order in the stylesheet does.

The tab that is **clicked** turned white for the same family of reasons: the kit paints the active tab `bg-background`, which is a white pill on the workbench's glass tab list. The active tab states its own look as an inline style, because an inline style beats the utility and two `data-active:bg-*` classes would be decided by stylesheet order again.

## 1.0.38

Chips and cards no longer turn white under the pointer. The workbench's chips are raw buttons, so the browser painted its default face behind them — and preflight's `appearance: button` lets the system draw a face on interaction that no `background-color` removes. Each chip states its background in every branch and resets the native appearance; the active tab states its own look inline, because the kit paints the active tab `bg-background` and two `data-active:bg-*` classes are decided by stylesheet order.

The library card was the deeper case. `:hover` reaches an ancestor whenever anything *inside* it is hovered, so a card that swapped its background for `--card` on hover painted a white surface behind a running app in a workbench slot and behind any content inside a preview. The card lifts and takes a shadow on hover now, and leaves its background alone.

## 1.0.37

The shipped templates that run a command choose by platform instead of by failure. `chores` carries one command per shell — `df -k /` beside `Get-PSDrive`, `ps -axo …` beside `Get-Process` — and reads `ctx.system.metrics().platform` once to pick the shell and the string together. A command written for the wrong shell fails in a way that reads like the app is broken, which is worse than not offering the button.

The workbench gained a **Shell** station: choose `auto`, `bash`, or `pwsh`, run a command, and read stdout, stderr, and the exit code as separate facts. Every run is recorded like the others, and every record in the rail has a button that fills the station's form with what that run used — the prompt, the goal, the MCP server, tool and arguments, or the command — so a run can be repeated after an edit instead of retyped. The rail also reports a count per station instead of a hardcoded three.

`ctx.log` has a page now: the file, the record shape, the segment and cap policy, and the fact that nothing reads it back for the app. The author guide says what `ctx.state` actually is — a fresh empty object per call — because the documented "in-memory object from `defineApp`" is not what the host passes.

## 1.0.37

The two shipped templates that run a command on this machine — `chores` and `watch` — used `ctx.bash` alone, which answers `bash-unavailable` on a Windows machine without bash, and most Windows machines do not have it. Both try `ctx.bash` and fall back to `ctx.pwsh`, the shell this contract already documents for that platform, and they say in the code that the two are different shells rather than translations of each other. The message a missing shell raises names `ctx.pwsh` now, and the `ctx.bash` page points at it instead of stating the Windows requirement and stopping there.

## 1.0.36

Opening a link into the browser flashed a black window on Windows. The launcher handed the URL to `cmd /C start`, and a GUI process spawning a console child makes that console appear: the same mechanism as the last launch's windows, in a place that change did not cover. It calls `ShellExecuteW` now, which is the API for handing a URL to the system, is not a console program, and does not read the URL as command-line text — `start` mangles a link containing `&` or `%`, so a Jira query URL arrived broken as well as noisy.

## 1.0.35

The workbench's MCP tab names the three servers the MCP section presets — `jira` (`@mohou/jira-mcp`), `gitlab`, and `jenkins` (`@kud/mcp-jenkins`) — with the read-only tools worth starting from: job and build status, recent builds, console output, pipeline stages, project and merge-request reads. The catalog it shipped with named a filesystem server rooted at one machine's directory and a checkout-specific Jira entry, which was machine-specific and, in a template that ships to everyone, more than it should have said. Settings → Agent → Install samples installs the corrected app into a library that does not have it.

## 1.0.34

Settings can install the sample apps on demand. The startup samples are seeded once per runtime root, so a library that already had apps — or was seeded before the workbench existed — never received it. Settings → Agent now has one button that asks Host for the samples this library is missing, and reports how many it installed and how many were already there. Nothing present is replaced, and the app the owner edited stays theirs.

A stdio MCP server that closed before it answered reported `MCP error -32000: Connection closed`, and nothing else — the same message for a package npm could not fetch, a rejected token, and a crash at startup. The server's stderr was piped and never read. A failed start now carries its last words, capped and with secrets masked, into the message the check shows, so the next failure names its cause instead of its symptom.

## 1.0.33

Quick add gained a third server: `@kud/mcp-jenkins` as **Jenkins**, with the URL, the user, and the API token as credential references — and the tools that change an instance (create, update, delete, rename, copy, replay, enable, disable, take a node offline, quiet down, restart) blocked in the preset. Asking whether a build is green should not hand over a controller. The preset test is table-driven now, so a row that forgets its credentials or its package fails the suite.

## 1.0.32

The MCP section offers the two servers this product publishes. **Quick add** fills the form for `@mohou/jira-mcp` or `@mohou/gitlab-mcp` — the command, the arguments, and an `env` of `${credential:NAME}` references — and creates those credentials as empty entries, so the next step is the Credentials section rather than a reference that names nothing. Nothing reaches `mcp.json` until the form is saved.

A new install also opens with the model workbench. It joins the two startup samples the skill already seeds (`today`, `board`), so a library shows what the product can do before anything is authored: one app drives Pi's `llm`, `agent`, and MCP calls and keeps a run log in SQLite. Its MCP tab names the same two servers Quick add creates, which is the loop closing.

## 1.0.31

Settings listed Pi's built-in providers only, so a model from an extension — a Kiro proxy, a hosted gateway — never appeared, and selecting a name from that list could only have ended in `unknown-model`. The list was built from a bare `ModelRuntime`, which never loads the user's extensions, and loading them is what applies the providers and virtual models they register. Pi is opened through its own cwd-bound services now, on both the listing and the running path, so what Settings offers is what a run can select.

## 1.0.30

Pi's own installer does not put its packages where npm's global directory is: it writes a tree under its agent directory, beside the shim it installs (`~/.pi/agent/bin/pi.ps1`). Mohou only looked in npm's locations, so a Pi installed the documented way was reported as a peer that cannot be found. The repair now walks Pi's agent directory — `PI_CODING_AGENT_DIR` when set, else `~/.pi/agent` — for a `node_modules` that holds the peers, at any of the shapes an installer may use, and it keeps npm's global directory as the fallback for a Pi installed that way. Both install styles work.

## 1.0.29

Pi on Windows reported `pi is not available: spawn EINVAL`. That is Node's refusal to start a `.cmd` without a shell, and one repair step asks npm where its global packages are — as `npm.cmd`, which is the only npm Windows has. The step now asks the command interpreter there, and a failure to *ask npm* is no longer reported as the reason Pi is unavailable: the real reason, a peer package that is not where the repair looked, survives to the message. The probe added in 1.0.28 is what named this failure in the first place.

## 1.0.28

Pi 1.0 reads MCP servers from `mcp.json` in its agent directory, with the `mcpServers` shape other clients use, and validates that file. Mohou pointed at the `mcp-adapter.json` of the extension that Pi 1.0 made unnecessary, so the import wrote where a current Pi does not read, and the entry it wrote carried the adapter's `transport` and a marker key. There are two Pi rows now: `Pi`, which writes `~/.pi/agent/mcp.json` with the keys Pi documents, and `Pi · mcp-adapter`, which keeps serving a Pi that still runs the extension. Pi's row is offered as soon as Pi's own directory exists rather than only after its agent directory appears.

A provider can also say why it is unhealthy. The settings probe showed `runtime provider is not healthy: pi` for every Pi failure, while the reason — a missing peer, a link that could not be written — was known and thrown away. `RuntimeProvider.reason` carries it, the probe reports it as the message, and the row shows it.

## 1.0.27

The splash never appeared on Windows: the window opened white and stayed white until the panel arrived. The pre-origin navigation guard admitted the window's own assets by scheme, and Tauri serves them as `tauri://localhost` on macOS but as the wry workaround `http://tauri.localhost` on Windows — so the splash was admitted on one platform and denied on the other. The guard names that origin on either scheme now, and still refuses everything else until Shell prints the loopback origin. The splash also no longer enters from `opacity: 0` with `fill-mode: both`, so an animation that does not run cannot hide it.

## 1.0.26

A Windows launch showed three console windows: two that flashed and one that stayed, titled with a Node path, empty, and fatal to close — closing it killed the sidecar and took the app with it. The launcher is a windows-subsystem binary, so Windows handed the console child it started a console of its own, window included. Every process it starts now asks for `CREATE_NO_WINDOW`: the sidecar, the update install, `taskkill`, and the watcher that notices the launcher's death. The processes Node itself starts inherit that hidden console rather than allocating their own, and the sidecar's output stays piped into `launcher.log`.

## 1.0.25

The first Windows launch to reach the new log named its own cause: the prefix was canonicalized, Windows returns a verbatim path for that, and the entry the launcher handed Node read `\\?\C:\...`. Node's module loader splits that, calls `lstat("C:")`, and dies before the sidecar's first line — the window opened, and then it was gone. The prefix is still canonical, which is what makes a symlinked install one prefix, but the verbatim form now stops at the process boundary: the entry, the panel directory, the runtime root, and the working directory are plain.

## 1.0.24

A Windows launch that could not start said nothing at all, and this release is mostly about that. The launcher's only user-facing channel was a macOS dialog, its messages went to stderr, and a packaged app has no console — so a window that opened white and vanished left no trace anywhere. Every launch now writes `launcher.log` in the runtime root: the platform, the runtime root, the resolved Node, the entry, the PATH, everything the sidecar prints on stdout and stderr, and each message shown. A fatal launch shows that message natively on both macOS and Windows and names the log, and a sidecar that stops before it prints an origin names its exit code and its last lines.

The bug behind the silence sat in the same place. A Windows launch asked the login shell for PATH — a macOS rule — and, finding no shell, replaced the inherited PATH with a unix one. Node was then looked for only under nvm-windows roots and `%ProgramFiles%\nodejs`, so an install anywhere else was invisible and the launch failed before it spawned anything. Windows now inherits the machine and user PATH, and the sidecar no longer starts with a PATH that hides every other tool on the machine.

## 1.0.23

A settings save was rejected whenever the update registry field was present, and because a save carries every editable field, that meant every save: theme, palette, port, language. The field was written through the config allowlist but never added to it, and the tests that covered the write used stubbed ports and a fake client, so none of them reached the check. It is an optional field now, a non-string is refused, an empty value clears it, and the allowlist and the HTTP path each have a test of their own.

## 1.0.22

The update registry can be an owner's mirror now, because the public registry is slow in some networks. Settings → Network offers the packaged default, Alibaba npmmirror, and Tencent Cloud, with a custom url behind it; it must be https and carry no credentials, and a bad value never reaches the file. Only this product's own update check and install use it — one `--registry` argument on our own npm child — so the owner's `~/.npmrc` and an app's own dependency installs are untouched. The about chip names the registry in force, so a mirror is visible before an install starts.

Two fixes ride along: a check that answers with an older version is no longer offered as an update (a mirror syncs late, and a downgrade is not an update), and the check budget is eight seconds instead of three, which a mirror's first response often exceeded.

## 1.0.21

The about block says where an update would come from. A chip carries the registry host, or the local package folder with the home directory collapsed to `~`; a source tree with no install prefix says that instead. The fact is read from the install prefix, so it is on screen when a registry is slow or unreachable, and the offer card shows the same chip before an install starts. A check that cannot reach its registry still names it.

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
