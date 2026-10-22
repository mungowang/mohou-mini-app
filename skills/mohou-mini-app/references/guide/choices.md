# Choices before register

One message. Recommend one option and name the consequence of the others. If the user says you decide, or skips an item, state the assumption and continue. Do not ask a second round.

Do not call `mini_app_register` in the same turn while a core choice is still open. A one-loop app whose source, shape, and look are already clear is two sentences of intent, then register.

## Classify, and say which

- **One loop.** One screen, one interaction.
- **Several regions.** One app, more than one desk. Lift one facade per region. Do not paste a whole template.
- **A workbench.** A homepage this person designed. `kind: "workbench"`. It shows what they want first, and it arranges how other apps are entered. The sample rail is one sketch.
- **A website.** Embed a local CLI web UI or a remote tool page. `kind: "website"` plus `url`. Backend `website.ensure` (and `ctx.spawn` for local servers). UI `WebsiteFrame`.

Several independent products: say so, and build the first one only. Do not design the rest in the same app.

## Core

Ask these when you cannot see the answer. Each line is the recommendation first.

| Choice | Recommend | Also possible | Consequence |
|---|---|---|---|
| First screen | Name the one job that screen does | A different job | The facade you lift follows this job |
| Records | Rows you filter go in `schema/NNN_*.sql` (DDL, seed, and data rewrite live there too) | `kv()` for a setting, one snapshot, or a short list | One `kv` array cannot be queried. An applied schema file is not edited; the next change is a new file. Do not bulk-seed or migrate with a TypeScript `run` loop |
| Shape | An ordinary app when the tool is one screen of its own | `kind: "workbench"` when this page is the homepage; `kind: "website"` when embedding a URL or local service | Workbench: `ctx.workbench`. Website: `url` + `defineApp({ website })` + `WebsiteFrame` / `useWebsite`. Do not fake a website with a bare iframe and `ctx.bash` |
| External system | An MCP server already in `mini_app_mcp_list` | HTTP, a local CLI, or `mini_app_install` | See below. Do not invent a server id or a tool name |

Status unions and `ctx.push` event names go in `shared/`. The same literal on both sides without that file is `event-undeclared`.

## External system

Run `mini_app_mcp_list` before you recommend. Open `mini_app_mcp_tools` only for the server you will call. Secrets use `ctx.credentials.get`. They do not go in the UI or in source.

| Reach it by | When | Consequence |
|---|---|---|
| `ctx.mcp(serverId, toolName, args)` | That server is already connected | Args are the tool's own object. A missing server fails that call. The app still opens |
| `ctx.http` | There is an HTTP API and no connected server | You handle auth, paging, and errors. 4xx/5xx do not throw |
| `ctx.bash` / `ctx.pwsh` | A CLI on this machine is already logged in | Another machine may not have the command |
| `mini_app_install` | The backend must import a library the platform does not ship | Never `react`, `lodash`, `motion`, or a UI library |

Lead with the connected MCP server when one exists. Say why you did not pick the others.

## Look and the kit

Ask which look, in the same message, as a question the user may skip.

A named look (`glass-island`, `aurora-bento`, `desk-split`, `editorial`, `tape`, `void`, `signage`, `terminal`) is used as named. Otherwise state the default pairing and continue: `today`/`glass-island`, `board`/`aurora-bento`, `sheets`/`desk-split`, `radar`/`editorial`, `watch`/`tape`, `runner`/`terminal`, `chores`/`terminal`. `void` and `signage` are opt-in. `minimal` has no preset Look. A workbench has no preset Look: design that homepage.

The UI kit is a shortcut for SaaS-shaped screens: lists, settings, boards, dashboards. It is not the design. A beautiful page may be native elements and Tailwind, kit parts, or both. Use a kit component when its interaction matches. Build the interaction when it does not. Leaving the kit unused is valid. Colour stays on tokens either way. `theme.css` is only for a hue this app cannot share with the host.

## Red flags

| Thought | Do this |
|---|---|
| This shape is familiar, so no confirm | Familiar is not the user's answer. State the classification. Ask the core choices you cannot see |
| I will register while they read the question | The confirm is the gate. Register on the next turn, or in this turn only when no core choice is open |
| I will keep asking until the brief is complete | One message. A skip is the stated default |
| I will put every module in one `kv` list | Filterable rows get a schema file |
| I will migrate or seed rows with a one-shot TypeScript `ctx.storage.run` loop | Put that SQL in the next `schema/NNN_*.sql` file |
| I will copy the sample rail because this is a workbench | The sample aside is one sketch. Design the homepage and the app entry points. The kit does not choose that layout |
| The catalog lists `DataGrid`, so the page is a `DataGrid` | The kit did not choose the layout |
