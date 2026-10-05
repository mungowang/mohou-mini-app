---
status: locked
updated: 2026-10-03
---

# Implementation plan

The functional cut is [functions.md](../architecture/functions.md). This page is how a call on that cut is built. It does not add a product capability. A feature page owns who calls what.

No package is created by this page. A package appears when it has code. The role below is the role that code will have.

Libraries are not locked. A library is chosen when it deletes owned code and tests, at the package that owns the mechanism. The plan locks the boundary, the failure code, and the lifecycle.

## Roles

| Capability | Role | Notes |
| --- | --- | --- |
| App ctx, `defineApp`, app id parse, failure codes | definition | One module. Host and authors import it. It performs no I/O. |
| Storage, HTTP, bash, push, compile, history, install | provider, inside Host | One owner until a second provider exists. Do not split a package for a single implementation. |
| `llm` / `agent` | seam | Definition is the provider interface. Shell registers providers. Host consumes the interface and does not embed a vendor. `echo` shares the first provider package until a second provider exists. |
| `ctx.mcp` | seam | Definition is the call and the server spec. Stdio and streamable HTTP are transports in that client until they change for different reasons. Host holds the client. The runtime provider is not this client. |
| Authoring MCP and `POST /api/tools/invoke` | two consumers, one implementation | The tool behavior is Host's. The projections do not grow a second manager. |
| Panel | consumer | HTTP only. It does not import Host. The workbench slot stays in this package. |
| Heat | provider, inside Host | `activity.json` in the runtime root, plus one pure fold. Not a panel view. Do not split a package for it. |
| Shell | composition | The only process that constructs Host, injects the runtime provider, bootstraps config, and bridges the window. |

A group directory is a container. `packages/<group>/<pkg>`.

## Boundary

Manifest JSON, `host.json`, `mcp.json`, theme files, and tool arguments are `unknown` until one `resolve*` accepts them. The function throws, names the field, and returns a frozen value. The operation that uses the value does not apply a hidden default.

An omitted caller option uses the resolved host policy. A caller option outside that policy fails the call before the operation starts. The number is not part of the call shape. Those numbers are not locked.

A typed value inside the process is not validated again.

## Platforms

Implement macOS and Windows in the same change. A full run on a Windows machine waits for the Tauri app. [testing.md](../testing.md) owns that gate. Do not call a POSIX-only API without a Windows path, and do not call a Windows-only API without a POSIX path. A platform limit is a sentence on the feature page, not a silent failure. A shell command is not translated between `bash` and PowerShell. POSIX permission bits are not a Windows access lock.

## Failure codes

A caller that branches on a failure matches a closed `code`. The message is for a person. A message prefix is not the contract.

The package that emits a code declares that code. There is no single list imported by every surface. `@mohou/contract` declares only the codes it throws. Host, the brain, and the MCP client declare theirs when those packages exist.

The code is a stable literal. The page that emits it names it. Wrapping passes the original error as `cause`.

| Code | Emitted when |
| --- | --- |
| `app-id-invalid` | the id is not reverse-DNS, or it does not match the directory name |
| `manifest-invalid` | manifest JSON is broken, or a required key is missing or empty |
| `import-forbidden` | a specifier is outside the allowlist, or it crosses `ui/` and `api/` |
| `import-escape` | a relative import leaves the app directory |
| `define-app-invalid` | `name`, `description`, or `api` fails the `defineApp` check |
| `backend-invalid` | backend syntax or an undefined name in `main.api.ts` or `api/**` |
| `ui-invalid` | UI bundle failure or an undefined name in `ui.tsx` or `ui/**` |
| `shared-invalid` | an undefined name in `shared/**` |
| `event-undeclared` | the same event name is a string literal on both the UI `on` and the backend `push`; declare it once in `shared/` |
| `unknown-method` | `call` names a key that is not in `api` |
| `call-outside-wrapper` | `useApp().call` ran outside the host wrapper |
| `call-unmounted` | `useApp().call` ran inside the wrapper; the iframe call route is not mounted |
| `asset-invalid` | `useApp().resolveAssetUrl` received a path that is not a file under `assets/` |
| `storage-not-json` | `kv().set` receives a non-JSON value |
| `storage-corrupt` | the database file is not a valid database; the file is quarantined and not replaced |
| `storage-forbidden` | SQL names `kv`, leaves the file, or runs outside the transaction handle |
| `storage-sql` | SQLite rejects the statement; `cause` is the driver error |
| `storage-statement` | `query` is used for a write, or `run` for a read |
| `storage-too-large` | a query exceeds the injected row cap |
| `storage-backup-too-large` | a schema file would need a backup over the host cap; nothing is copied and the file does not run |
| `storage-migration` | a schema file is edited, missing, gapped, blocked, or rejected by SQLite |
| `storage-version` | the file's schema stamp is not this build's layout; the file is left in place |
| `http-timeout` | the request exceeds the resolved timeout |
| `http-scheme` | the URL is not http or https |
| `http-too-large` | the body exceeds the resolved cap |
| `http-network` | the network fails; `cause` is the underlying error |
| `http-policy` | the caller timeout is outside the resolved policy |
| `bash-unavailable` | `bash` is not on `PATH` |
| `pwsh-unavailable` | neither `pwsh` nor, on Windows, `powershell.exe` can be started |
| `metrics-unreadable` | the OS snapshot cannot be read; missing fields are not filled with zeros |
| `provider-missing` | no live runtime provider |
| `provider-unhealthy` | the provider is registered and not healthy |
| `empty-completion` | `llm` or `agent` returns an empty result |
| `cancelled` | the call's signal aborted the run |
| `retry-exhausted` | the resolved retry budget is spent |
| `cwd-invalid` | `cwd` and `cwdType` disagree, or `custom` is not absolute |
| `mcp-not-connected` | the server id is not in the resolved config |
| `mcp-start-failed` | the server process or session did not start; `cause` is the start error |
| `mcp-tool-failed` | the server returned a tool error |
| `app-not-registered` | the id is not a registered app |
| `activity-invalid` | `activity.json` is not the activity document, or an open is missing a field; the file is left in place |
| `activity-unreadable` | `activity.json` is present and cannot be read |
| `app-not-trashed` | undelete names an id that has no trash copy |
| `app-duplicate` | register or undelete names an id that already exists |
| `config-invalid` | a present config field fails its bound |
| `mcp-reference-unknown` | a server value names an environment variable or a credential that exists nowhere; that server does not start, so set it or add the credential, then restart |
| `mcp-reference-invalid` | a server value holds a malformed reference; fix the brace or the name |
| `config-missing` | a present config file lacks a required field |
| `path-escape` | a tool path is absolute or contains `..` |
| `path-is-directory` | the tool path names a directory |
| `file-missing` | the tool path does not name a file |
| `edit-not-unique` | `oldText` is missing or appears more than once |
| `manifest-protected` | a tool tries to delete a required entry, or a path another owner marks protected |
| `history-empty-message` | a history commit has an empty message |
| `history-unknown-commit` | the commit id is not in the app history |
| `install-denied` | the package is on the denylist, or the name or version is not a plain npm spec |
| `install-failed` | npm is missing, the install times out, or the network fails; the last good lockfile stays |
| `commit-failed` | compile succeeded and the history commit did not |
| `unknown-tool` | the authoring name is not in the mounted catalog |
| `tool-args` | a tool argument is missing or the wrong shape |
| `call-batch` | `calls` has more than 20 entries; none run |
| `authoring-token` | the authoring token is missing or wrong |
| `authoring-loopback` | the authoring caller is not loopback |
| `theme-invalid` | a pin names an unknown palette, or the app theme file cannot be used |
| `model-policy` | `maxTokens`, `retryTimes`, or `maxIterations` is outside the resolved host policy |
| `credential-invalid` | `get` was called with an empty name |
| `credential-unreadable` | the credential file is present and cannot be read; it is not rewritten |
| `credential-duplicate` | the same credential name is present in more than one source |
| `credential-write-unavailable` | the store has no writable source; the panel hides its write controls |

HTTP 4xx and 5xx do not throw and have no code. A non-zero bash exit does not throw and has no code. `push` does not throw. A non-JSON push payload is dropped and logged.

## Lifecycle

Host create registers no child. Start opens the HTTP listener and starts the injected runtime provider. The first `ctx.mcp` call opens that server. Dispose stops new work, clears timers, awaits in-flight calls, awaits child exit, then runs stored disposers.

A reconnect has a budget. Exhaustion fails that call and stops retrying inside it. The server stays registered, so the next call may open it again. It does not retry forever inside one call. A generation token ignores a stale close. The replacement child starts only after the previous close is confirmed.

A registration returns a disposer. A second registration of the same name throws. The live one stays.

## Extension points

| Change | Register at | Does not edit |
| --- | --- | --- |
| A runtime provider | the set Shell constructs | Host's call path |
| A platform module | the one Host allowlist table | a second table in the compiler or the loader |
| An external MCP server | `mcp.json`, resolved at Host boot | the authoring tool catalog |
| An authoring tool | the one Host tool implementation | a second schema on the MCP projection |

Panel does not gain an extension point for these. It renders what HTTP returns.

## Records

History is the committed source for app files. `storage/app.sqlite` is the committed source for `ctx.storage`. Author events are the committed source for `ctx.push`. A panel view is derived from those records. A live iframe is not the record.

Publish a notice after the write commits. A failed write emits nothing.

## What this plan does not lock

The HTTP server library, the compiler, the history library, the process supervisor, and the MCP session library. The port, locale, timeouts, caps, retry counts, and buffer sizes. Those stay host policy until that page moves to `locked`.
