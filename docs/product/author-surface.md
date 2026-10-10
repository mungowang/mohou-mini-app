---
status: shape-locked
progress: settled
updated: 2026-10-09
---

# Author surface

The authoring agent uses this surface. Names are `mini_app_*`. MCP and the HTTP invoke route are two projections of one implementation. A projection does not define a second result.

The agent does not receive the app `ctx` bag. It does not delete the app directory. It does not curl Host as a substitute for these operations.

`mini_app_write`, `mini_app_edit`, and `mini_app_delete` stay on HTTP invoke only. MCP omits them. The [author skill](author-skill/skill-contract.md) does not document those three names; agents use their own file tools for source bytes.

Paths are app-relative. `..` and an absolute path emit `path-escape`. Listing skips history metadata, storage, `node_modules`, `theme.json`, `logs`, `dist`, `.cache`, and `.autogen`. `coverage` is listed. A batch size, a file window, and a history list limit are host policy and are not locked.

Codes are in [implementation.md](implementation.md).

## Catalog

| Operation | Input | Output | Failure |
| --- | --- | --- | --- |
| `mini_app_list` | none | `{ apps, runtimeRoot }` | empty list when none exist; Host down is a transport error |
| `mini_app_get` | `appId` | manifest summary and absolute directory | `app-not-registered` |
| `mini_app_list_files` | `appId` | relative paths and sizes | `app-not-registered` |
| `mini_app_read` | `appId`, `path`, optional line window, optional `numbered` | `{ path, content, bytes, totalLines, startLine, endLine, truncated? }` | `file-missing`, `path-escape` |
| `mini_app_edit` | `appId`, `path`, `edits: [{ oldText, newText }]`, optional `commit` | updated file, commit status | `edit-not-unique`, `file-missing` |
| `mini_app_write` | `appId`, `path`, `content`, optional `commit` | created or replaced file | `path-escape`, `path-is-directory` |
| `mini_app_delete` | `appId`, `path`, optional `commit` | file removed | `manifest-protected`, `file-missing`. Required entries cannot be deleted. Another owner may mark more paths protected. |
| `mini_app_register` | `appId`, `name`, `description`, `version`, optional `acronym`, `tags`, `kind` | `{ directory, needed }` plus the list summary. `needed` is the absolute paths of `ui.tsx` and `main.api.ts`. A `files` field is rejected. | `app-id-invalid`, `manifest-invalid`, `app-duplicate` |
| `mini_app_rename` | `appId`, `newAppId` | the list summary for the new id, including `directory` | `app-id-invalid`, `app-not-registered`, `app-duplicate`. An unchanged id is `app-id-invalid`. |
| `mini_app_market_list` | optional `search`, optional `kind` | `{ apps }`. Each row includes `kind`. Omitted `kind` returns apps and themes. | `market-catalog` |
| `mini_app_market_install` | `appId`, `kind`, optional `overwrite` | `{ id, kind }` | `market-confirm`, `market-catalog`, `tool-args`. `overwrite` defaults to false. A kind that does not match the row is `tool-args` and writes nothing. |
| `mini_app_reload` | `appId`, optional `cleanCaches` | compile result | codes on [compile.md](host/compile.md) |
| `mini_app_install` | `appId`, optional packages to add or remove, optional `commit` | `{ ok, packages, lockfile }` or `{ ok: false, code }` | `install-denied`, `install-failed` |
| `mini_app_call` | `appId` plus one `method`/`args`, or `calls` | one result, or one result per entry | `unknown-method`; one entry's failure does not drop the others |
| `mini_app_open` | `appId`, optional `title` | `{ panel: "notified" \| "no-panel-connected" }` | `app-not-registered` |
| `mini_app_errors` | `appId`, optional `since`, optional `clear` | `{ errors, lastSeq, dropped, emptyHint? }` | `app-not-registered` |
| `mini_app_view_eval` | `appId`, optional `code`, optional budget fields | view envelope | `app-not-registered`; a timeout returns `view`, it does not hang |
| `mini_app_history_commit` | `appId`, `message` | new commit id, or clean | `history-empty-message` |
| `mini_app_history_list` | `appId`, optional `limit` | `{ head, nodes, tips }` | `app-not-registered` |
| `mini_app_history_reset` | `appId`, `commitId` | `{ head, backupRef, changed, files }` | `history-unknown-commit` |
| `mini_app_mcp_list` | none | `{ servers: [{ id, tools: string[] }] }` — tool names only | one server may carry `mcp-not-connected` or `mcp-start-failed`; the rest still list. No descriptions, schemas, or `env`. |
| `mini_app_mcp_tools` | `serverId`, optional `toolName` | `{ id, tools: [{ name, description?, inputSchema }] }` for that server | server start failures return `{ id, error }` with `mcp-not-connected` or `mcp-start-failed`. Unknown `toolName` is `tool-args`. No `env`. |
| `mini_app_mcp_add` | `id`, then `command` with optional `args`/`env`, or `url` with optional `transport`/`headers`; optional `description`, `enabled`, `check`, `force` | `{ added, id, check?, servers }` | A row with neither `command` nor `url`, an unknown `transport`, or a non-text `env`/`headers` value is `tool-args`. A failed check returns `added: false` and leaves the file and the client alone unless `force` is true. `check: false` skips the check. The written set is handed to the live client, so the server is usable at once. |
| `mini_app_mcp_remove` | `id` | `{ removed, id, servers }` | An unknown id changes nothing and returns `removed: false`. The live client loses the server at once. |
| `mini_app_credential_list` | none | `{ credentials: [{ name, description }] }` | `credential-unreadable`. No secret. Not on `ctx`. |

An empty `mini_app_install` reads the current set. Mutating tools commit unless `commit` is false. `false` batches until reload or an explicit commit. The agent creates, updates, and deletes source files with its own file tools. A successful reload of a dirty tree commits that tree. A failed reload does not.

Both MCP write tools mask the values that a name segment or a value shape identifies as a credential. A recognized label stays, because it is what says what the value is — `Bearer ab*****gh`, `ghp_12*****90` — and the body behind it keeps its first and last two characters, or none of it under five. An ordinary setting such as `NODE_ENV` comes back unchanged. The file keeps the true values, and the panel reads them to edit them.

`GET /api/tools` and `POST /api/tools/invoke` mount the whole catalog, including `mini_app_write`, `mini_app_edit`, and `mini_app_delete`. MCP `tools/list` and `tools/call` omit those three. An MCP call of an omitted name is `unknown-tool` and names the MCP catalog.

Mounted: `createAuthorTools` is the one implementation. `GET /api/tools`, `POST /api/tools/invoke`, and `POST /mcp` (`initialize`, `tools/list`, `tools/call`) project it. A missing or wrong token is `authoring-token`. A non-loopback caller is `authoring-loopback`. An unknown name is `unknown-tool` and names the catalog that projection mounts. History commit, list, and reset are mounted. A tree change calls `onTreeChanged` and publishes `app:reload`. `mini_app_open` publishes `app:open` and returns `notified` only when a host-stream subscriber is attached. `mini_app_errors` reads the error ring. `mini_app_install` is mounted. It is the only writer of `package.json` and `package-lock.json`. `mini_app_view_eval` is mounted. No subscriber returns `not-open` immediately. A subscriber that reports no frame also returns `not-open` immediately. A second call while that app's view is still answering returns `pending`. A timeout returns `runner-not-booted` or `stuck` and does not hang. The iframe runs the code; Host only routes `app:eval`. Delete is not an authoring tool. `mini_app_mcp_add` and `mini_app_mcp_remove` are the only writers of the MCP server file, and a write hands the live client the specs it just wrote, so `ctx.mcp` and the authoring tools see the change without a restart. `mini_app_mcp_list`, `mini_app_mcp_tools`, `mini_app_mcp_add`, `mini_app_mcp_remove`, and `mini_app_credential_list` are not on `ctx`.

There is no migration tool. The agent writes `schema/NNN_name.sql`. One file is one transaction: create or alter app tables, seed rows, or rewrite existing rows. Do not ship a one-shot TypeScript loop of `ctx.storage.run` for that work. A file that has not been applied can be edited or deleted. A file that has been applied is changed by adding the next number, not by deleting it. Deleting an applied file fails the next open with `storage-migration`. Opening storage, including reload and the next call, applies pending files.

`mini_app_rename` moves the app directory, writes the new id into `manifest.json`, moves that id's key in `activity.json`, and points `host.json` `defaultWorkbenchId` at the new id when it was the old one. Trash copies of the old id follow. Logs, storage, theme pin, and git history sit in the directory and move with it. `.autogen` is dropped so the next open compiles the new id. The same history commit used by reload then records the tree, message `Rename <old> to <new>`. A trash copy that changed gets that commit in its own repo. Source text is not rewritten. An open panel tab follows the new id.

`mini_app_open` returning `no-panel-connected` means the app is fine and no panel is attached.

`mini_app_view_eval` omitted `code` returns the document root. Injected names are `mma.$`, `mma.$$`, and `mma.selector`. No fourth name. `view` is `live`, `not-open`, `runner-not-booted`, `pending`, or `stuck`. Only `stuck` means the main thread is blocked.

## History restore

There is one history-moving operation. `mini_app_history_reset` makes the working tree and the branch match `commitId`. That is `git reset --hard <commitId>`, plus a backup ref so the previous head stays a reachable leaf of the commit tree. If the tree already matches that commit, the result is `changed: false` and no backup ref is written.

When `changed` is true, the previous head is stored as a backup ref and returned as `backupRef`. That ref is a pointer, not a branch. It exists so the commits `main` no longer points at can still be found. `mini_app_history_list` returns those pointers in `tips` as `{ name, commitId }`, beside the `main` tip.

To undo a reset, call `mini_app_history_reset` again with that backup `commitId`. `main` returns to the head from before the first reset. The head just left becomes the new backup ref.

Undoing one commit while keeping later commits is not a tool. The author reads that snapshot and edits forward.

When `changed` is true, Host tells an already-open view to refetch. A call that returns an id and leaves the open view on the previous bundle is not a completed restore.

## Non-goals

- A tool that deletes the app.
- A tool that writes outside the app directory.
- Re-exporting `ctx`, or external MCP servers, on this surface.
- A second tool schema on the MCP projection.
