---
status: shape-locked
progress: settled
updated: 2026-10-08
---

# Owner surface

The person who owns the machine uses this surface through the panel. The panel is an HTTP client. It does not import Host and does not construct Host.

Each operation below has a name, an input, an output, and a failure class. The session exposes these operations in-process. The loopback routes are in [host/http.md](host/http.md). One operation has one route.

Codes are in [implementation.md](implementation.md).

## list

- Input: none. Search and card style are panel-local filters. They are not host fields.
- Output: `{ id, name, description, version, acronym, tags?, kind?, createdAt?, updatedAt?, activity? }[]`. `kind` is `workbench` when the manifest says so, and omitted for an ordinary app. `tags`, when present, are the manifest tags. [Directory and entries](app-contract/directory.md) owns the token rule. Omitted `tags` means the manifest omitted them. `createdAt` is the time of the first history commit. `updatedAt` is the time of the latest history commit. Either is omitted when that commit does not exist. `activity`, when present, is `{ openCount, lastOpenedAt }` from [Heat](host/heat.md). Omitted `activity` means the app has not been opened. The list order is not a sort.
- Failure: the host is unreachable, or the call fails. That is an error state. An empty array is an empty gallery, not an error.
- Non-goals: editing source; opening an app by writing its directory.

## open

- Input: `appId`, optional title.
- Output: the panel shows that app's tab and loads the app document from Host. The gallery tab stays. Tabs can be switched and closed. Switching tabs does not reload the document.
- A host event `app:open` is the same operation. The panel focuses that tab.
- Failure: `app-not-registered`.

## readHistory

- Input: `appId`.
- Output: commits `{ id, message, time, parentIds }[]`, including backup tips after a reset.
- Failure: `app-not-registered`. An empty list is an empty history, not an error.
- Non-goals: commit, reset, merge. Reset is an authoring tool. There is no revert tool.

## readCommit

- Input: `appId`, `commitId`.
- Output: message, time, and files with add and delete counts plus a text preview.
- Failure: unknown commit. The preview is not a contract to return every changed line.

## readStorage

- Input: `appId`.
- Output: the database file byte size and the table names, including `kv`.
- Failure: `app-not-registered`, or `storage-corrupt` when the file is corrupt.

## readTable

- Input: `appId`, table name.
- Output: that table's rows as JSON. `kv` values are parsed. This is an export, not the file.
- Failure: `app-not-registered`, or `storage-corrupt` when the file is corrupt.
- Non-goals: writing storage; handing the app a second query API.

Owner `restoreStorage` closes the live storage handle, then calls `restoreStorageBackup`. No backup is `storage-migration` and the live database stays. The panel storage view calls `POST /api/apps/:appId/storage/restore` when the client exposes it.

## readPolicy

- Output: the public fields `theme`, `palette`, `locale`, `chatLanguage`, `hostPort`, `llm`, `runtimeProvider`, and `defaultWorkbenchId` when a workbench app is the default. Absent `defaultWorkbenchId` means the builtin library. [Workbench](panel/workbench.md) owns that field.
- Failure: host unreachable. When Host exposes no policy operation, the panel hides settings.
- Non-goals: credentials, the authoring token, MCP server environment.

## writePolicy

- Input: the public fields. One language control writes `locale` and `chatLanguage` together.
- Output: a written config, or a field error and an unchanged file. A change of `hostPort` or `runtimeProvider.id` reports that restart is required. It does not switch the live brain or rebind the listening port until restart.
- Failure: `config-invalid` or `config-missing`. The form stays dirty.
- Non-goals: writing `mcp.json`; a second language control. The panel MCP editor and the credential editor are separate operations: [MCP servers](panel/mcp.md) and [credentials](panel/settings.md).

## restartHost

- Input: none.
- Output: the host process recycles in place. The live runtime provider is the one in the written config.
- Failure: the host did not come back. The previous process is already gone if dispose finished.
- Non-goals: hot-swapping the live brain without a recycle; restarting the panel document only.

## probeBrain

- Input: the provider id shown in the form.
- Output: healthy, or the error.
- Effect: does not write config and does not switch the live brain.

## setAppPin

- Input: `appId` and a pin: follow the host palette, use the app file, a palette id, or clear.
- Output: the pin record for that app. Clear restores the app default. Follow-host is a stored pin, not deletion of `theme.css`.
- Failure: a rejected save leaves the previous pin.
- Non-goals: editing theme CSS; a theme editor.

## listPalettes

- Output: theme files, each `{ id, name, swatch, style, origin }`, and ignored files with a reason. `origin` is `builtin` or `custom`. `swatch` is that file's light `--primary`. `style` is the first-paint CSS for both modes, so the picker can apply it without reloading a document. A shipped file and a user file with the same id appear once. The user file wins, and that row is `custom`. The panel refetches when the picker opens.
- An ignored file is not a selectable chip.

## reloadView

- Input: the open `appId`.
- Output: that iframe refetches its document. A host event `app:reload` is the same refetch and does not create a tab.
- Failure: a missing app shows the host error in the frame.
- Non-goals: reload on tab switch; compile. Compile is an authoring tool.

## deleteApp

- Input: `appId`, after the person confirms.
- Output: the app leaves the list. The directory, including history, is moved under `trash` in the runtime root. It is not removed.
- Failure: the app stays in the list and the panel shows the error. An unknown id is `app-not-registered` and nothing is moved.
- Non-goals: an authoring tool that deletes the app. This is the only removal path.

## listTrash

- Input: none.
- Output: the newest trash copy of each id, with the same fields as [list](#list). An empty array means nothing can be restored. Older copies of the same id are not separate rows.
- Failure: an unreadable copy is omitted. It does not fail the list.
- Non-goals: restoring from this call.

## undeleteApp

- Input: `appId`.
- Output: the newest trash copy of that id is moved back into `apps`. The list shows it again. History is the history that was moved.
- Failure: a live app with that id is `app-duplicate` and the trash copy stays. No trash copy is `app-not-trashed`.

## readMcp / writeMcp / checkMcp / admitMcp / importMcp

- Owner: the MCP settings section. Not [writePolicy](#writepolicy).
- `readMcp` returns the servers in `mcp.json`. A missing or empty `{}` file is `[]`.
- `writeMcp` replaces the file. Invalid rows keep the previous file.
- `checkMcp` starts one server, lists tools, and closes it. It does not write.
- `admitMcp` parses pasted text. `importMcp` reads one file Shell named. Neither writes. The panel opens the add/edit form.
- Failure: `config-invalid`. A failed check stays on that server.

## readAuthorSkill / writeAuthorSkill / revealAuthorSkill

- Input: selected assistant ids and custom `.../skills` dirs.
- Output: dests, source `version`, per-copy `version` and `updateAvailable`.
- `writeAuthorSkill` copies this repo's writing skill into those dests.
- The built-in assistants for this call and for [readAuthorMcp](#readauthormcp--writeauthormcp--revealauthormcp) are [Supported agents](mcp-client/supported-agents.md).
- `revealAuthorSkill` opens one dest this layout already owns.
- Failure: `config-invalid` when the dest is not in the list or the last folder is not `skills`.

## readAuthorMcp / writeAuthorMcp / revealAuthorMcp

- Input: selected assistant ids and a description.
- Output: dests and whether the `mini-app` server matches this host's url and token.
- `writeAuthorMcp` merges that server into the selected assistant files. Other servers stay. The live url and token come from this host, not the panel.
- `revealAuthorMcp` opens one file this layout already owns.
- Failure: `config-invalid` when the dest is not in the list.
- Non-goals: writing app `mcp.json`. That file is [the MCP editor](#readmcp--writemcp--checkmcp--admitmcp--importmcp).

## Panel-local state

These are not host operations.

- Close-panel is hidden in the standalone Shell window. The panel has no dock mode. It is not a field of `host.json`.
- Chrome strings follow the host locale. A missing key fails in development and falls back to the key in production.
