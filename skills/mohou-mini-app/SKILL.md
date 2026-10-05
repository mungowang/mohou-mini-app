---
name: mohou-mini-app
description: Create or edit local mini-apps (ui.tsx + main.api.ts) that run in the mini-app panel. Confirm the core choices before mini_app_register when the ask is vague. Then write source with your file tools, compile with mini_app_reload, smoke-test with mini_app_call, and reveal with mini_app_open. Triggers include 做个小程序 / 小工具 / 面板 / 仪表盘 / dashboard / 看板 / 工作台 / mini-app. Not for editing Host, Panel, or Shell source.
version: 1.0.28
---

# Mini-app authoring

Instructions are English. Product copy follows the host locale (samples use Chinese because the shipped host defaults to it).

Open one file from the table at the bottom. Hand guides are `references/guide/`. Generated component pages are `references/catalog.md`, `references/contracts/`, and `references/examples/`. Do not browse `contracts/` or `examples/` as a list. Map: [references/README.md](references/README.md).

`ctx` and the model APIs are [references/guide/ctx.md](references/guide/ctx.md) and [references/guide/llm-json.md](references/guide/llm-json.md). Live apps are not a contract. Do not copy another app from `~/.mini-app/runtime/apps/`. Write this app's source at the `directory` `mini_app_register` returns.

## Do not

- Write outside the app directory returned by `mini_app_register`. Source files inside it are yours.
- Delete the app directory. Delete is a panel action.
- Curl the host. Do not bash against the loopback port.
- Set `data-mode`. The host sets it.
- Invent a second colour name. No `bg-card` as a custom class. No hex as a theme.
- Invent a `mini_app_*` name, a `ctx` member, or a kit part name.

## Before you register

Classify the ask in that reply. Detail and red flags: [references/guide/choices.md](references/guide/choices.md).

- **One loop.** One screen, one interaction. Two sentences of intent, then register, when no core choice below is open.
- **Several regions.** One app, more than one desk. Lift one facade per region. Do not paste a whole template.
- **A workbench.** A custom homepage. `kind: "workbench"`. Opening it shows what this person wants first, and the page designs how other apps are arranged and entered. The sample rail is one layout, not the type.

One message asks only what you cannot see. Recommend one option and name the consequence of the others:

- What the first screen is for.
- Where the records come from, when you cannot see the source.
- An ordinary app, or a workbench homepage. Several independent products: say so, and build the first one only.
- How a named external system is reached. List connected servers with `mini_app_mcp_list` first.
- Look, in that same message. The user may skip it.

If the user says you decide, or skips an item, state the assumption and continue. Do not ask a second round. Do not call `mini_app_register` in the same turn while a core choice is still open. A familiar app shape is not permission to skip this.

The UI kit is not the design. It is a shortcut for SaaS-shaped screens. A beautiful page may be native elements and Tailwind, kit parts, or both.

## Write loop

1. `mini_app_register({ appId, name, description, version })` → `directory` and `needed`. Optional: `tags`, `acronym`, `kind`.
2. Write the files in `needed` (`ui.tsx`, `main.api.ts`) with your file tools. Add `ui/`, `api/`, `shared/`, `assets/` the same way.
3. `mini_app_reload({ appId })`. Success commits a dirty tree. Failure does not.
4. `mini_app_call` → `mini_app_open` → `mini_app_errors` → `mini_app_view_eval`.

```
mini_app_register({
  appId: "com.example.todo",
  name: "今日待办",
  description: "Open, see my todos, open one",
  version: "0.1.0",
  acronym: "待办",
  tags: ["daily", "todo", "personal"]
})
```

## How files reach disk

| Goal | Tool |
|---|---|
| Inspect manifest + directory | `mini_app_get({ appId })` |
| List source files | `mini_app_list_files({ appId })` |
| Read one file | `mini_app_read({ appId, path })` |
| Create an app | `mini_app_register({ appId, name, description, version })` — optional `tags`, `acronym`, `kind`. Writes `manifest.json`, returns `directory` and `needed` |
| Write / edit / delete source | your file tools on `directory` / `needed`. Not MCP. |
| Compile | `mini_app_reload({ appId })` — success commits a dirty tree |
| Add a backend library | `mini_app_install({ appId, packages: [{ name: "exceljs" }] })` — never `lodash` / `motion` / `react` / a UI library |
| Smoke-test methods | `mini_app_call({ appId, method, args })` or `calls: […]` (max 20) |
| Show it | `mini_app_open({ appId })` |
| Runtime errors | `mini_app_errors({ appId, since? })` |
| Ask the rendered view | `mini_app_view_eval({ appId, code? })` |
| Connected MCP servers + tool names | `mini_app_mcp_list()` |
| One server's tool schemas | `mini_app_mcp_tools({ serverId, toolName? })` |
| Add or replace one MCP server | `mini_app_mcp_add({ id, command?, args?, env?, url?, transport?, headers? })` — opens it once as the check; `check: false` skips that and `force: true` keeps a row that failed it. A value may be `${env:NAME}` or `${credential:NAME}` instead of a secret, and the host resolves it at load; a name that exists nowhere fails the check and the next boot with `mcp-reference-unknown`. The server is usable at once, and the result masks the secret part of a literal credential while keeping its label (`Bearer ab*****gh`) |
| Remove one MCP server | `mini_app_mcp_remove({ id })` — also at once |
| Credential names | `mini_app_credential_list()` |
| Confirm the host | `mini_app_list()` |

Versioning: [references/guide/history.md](references/guide/history.md). `mini_app_history_commit` is optional. A successful reload of a dirty tree commits.

### Reload

`{ ok, errors, notices?, compiled, committed, caches }`. Match `errors[i].code`. Read `notices`. The code and the next step are in [references/guide/loader.md](references/guide/loader.md). Successful reload drops the API module, the UI bundle, and app CSS.

Compile green is not a running view. `panel: "no-panel-connected"` means the app is fine and no panel is attached — tell the user to open the panel. Eval: [references/guide/eval.md](references/guide/eval.md).

When `mini_app_*` fails or is unavailable, run `node bin/diagnose.mjs` from this skill tree. It prints JSON: Host about, authoring MCP, core tool names, skill version, runtime root.

## Files

`@mohou/ui` is the UI package. `@mohou/contract` is the backend package. The host injects `defineApp`. Layout, imports, and allowlists: [references/guide/loader.md](references/guide/loader.md).

- UI: `const { call, on, resolveAssetUrl } = useApp()` from `@mohou/ui`.
- Backend: `export default defineApp({ name, description, api })`.
- `call("foo")` must be a key of `api.foo`.
- `ctx.llm` / `ctx.agent` return **string**. MCP args are the tool's own object.
- `shared/` is pure. Event names both sides use are declared once there.
- `acronym` is two letters or digits. `tags` match `^[a-z][a-z0-9-]*$`. `kind` is omitted, `"app"`, or `"workbench"`.
- A short `kv()` list: [references/guide/skeleton.md](references/guide/skeleton.md). Filterable rows, table DDL, seeds, and one-shot data rewrites use `schema/NNN_*.sql`, not that list and not a TypeScript `run` loop.

Full `ctx`: [references/guide/ctx.md](references/guide/ctx.md).

## UI

The kit is a shortcut for SaaS-shaped screens: lists, settings, boards, dashboards. It is not a law and it is not the layout. Use a component when its interaction matches. Build the interaction from native elements and Tailwind when it does not. Mixing is normal. Using none of the kit is valid.

`ui.tsx` may import `react`, `@mohou/ui`, `lodash` / `lodash-es`, `motion` / `motion/react`, and in-app relative paths. Never `api/**`, never `../` out of the app dir, never another npm package.

Names, parts, and props: [references/catalog.md](references/catalog.md), then one file under [references/contracts/](references/contracts/). Icons: [references/guide/icons.md](references/guide/icons.md). Colour: [references/theme.md](references/theme.md). Toast is `toast.add`, not a function call: [references/contracts/toast.md](references/contracts/toast.md). `CodeEditor`, `CodeBlock`, and `DiffViewer` load an engine on demand and degrade if that fetch fails. Do not import the engine.

Reach an external system only after the confirm in [references/guide/choices.md](references/guide/choices.md). Lead with a connected MCP server when `mini_app_mcp_list` has one. Otherwise `ctx.http`, a logged-in CLI (`ctx.bash` / `ctx.pwsh`), or `mini_app_install`. Do not install `react`, `lodash`, `motion`, or a UI library. Secrets use `ctx.credentials.get`.

## Read on demand

| When | Open |
|------|------|
| A choice, a trade-off, or a red flag | [guide/choices.md](references/guide/choices.md) |
| A short `kv()` list | [guide/skeleton.md](references/guide/skeleton.md) |
| Component props / parts | [catalog.md](references/catalog.md), then one file in [contracts/](references/contracts/) |
| Tailwind / colour | [guide/styling.md](references/guide/styling.md), [theme.md](references/theme.md) |
| Live DOM | [guide/eval.md](references/guide/eval.md) |
| A runnable widget | one example under [examples/](references/examples/), from the catalog |
| Icons | [guide/icons.md](references/guide/icons.md) |
| `ctx.*` | [guide/ctx.md](references/guide/ctx.md) |
| `opts.schema` JSON | [guide/llm-json.md](references/guide/llm-json.md) |
| External systems | [guide/tools.md](references/guide/tools.md) |
| Layout / imports / reload codes | [guide/loader.md](references/guide/loader.md) |
| Smoke tests | [guide/test.md](references/guide/test.md) |
| Errors | [guide/troubleshoot.md](references/guide/troubleshoot.md) |
| History | [guide/history.md](references/guide/history.md) |
| A named visual style | [looks/index.md](references/looks/index.md) — when the user named one, or you are stating the default |

## Facades

Lift one loop per region. Do not paste a whole file. [templates/README.md](templates/README.md).

| Facade | Loop | Teaches |
|---|---|---|
| `minimal` | one `call` | skeleton, no motion |
| `today` | open, see my screen, open one record | `ListDetail`, `kv()` |
| `board` | items move in two-dimensional status | `Kanban` and a sheet |
| `radar` | trigger, wait, read, cancel | `ctx.http`, `ctx.llm`, `ctx.push`, `ctx.signal` |
| `sheets` | file in, grid work | `mini_app_install`, lodash, `DataGrid` |
| `runner` | the UI is the run | `ctx.agent` and `streamCall` |
| `chores` | named buttons, this machine, no model | `ctx.bash` |
| `watch` | numbers move by themselves | `ctx.system.metrics`, hidden-document stop, `DashboardShell`, `Reveal` |
| `workbench` | a custom homepage for what to see first, and how other apps are entered | `kind: "workbench"`, `ctx.workbench`. Any layout. The sample is one homepage |

`chores` stays buttons. A prompt box would make it `runner`.

A workbench is a homepage the author designs. `manifest.json` has `"kind": "workbench"`. `ctx.workbench` exists only then. The page shows what this person wants to know first, and it lays out other apps and their entry points however that design needs: a rail, a grid, tiles, or something with no kit. `listApps` and `openApp` supply the apps and the open. They do not require the sample aside. `openApp` asks the panel to add a tab. It does not navigate inside this homepage. The sample tickets and the sample rail are one sketch. Replace the rows from `ctx.http`, `ctx.mcp`, or this app's own storage, and replace the arrangement. The app keeps every ordinary capability. `setDefaultWorkbench` makes this homepage the panel's first screen instead of the builtin library.

Looks are asked once, in the confirm message, and may be skipped. Named looks: `glass-island`, `aurora-bento`, `desk-split`, `editorial`, `tape`, `void`, `signage`, `terminal`. If the user skips or says you decide, say the pairing you will use: `today`/`glass-island`, `board`/`aurora-bento`, `sheets`/`desk-split`, `radar`/`editorial`, `watch`/`tape`, `runner`/`terminal`, `chores`/`terminal`. `void` and `signage` are opt-in. `minimal` has no preset Look. A workbench has no preset Look either: design that homepage, including with no kit. There is no `data-look` attribute.

## Checklist

- [ ] Confirm sent; core choices answered or stated as assumptions; then `mini_app_register`
- [ ] One facade per region; a workbench when the page is a designed homepage, including how other apps are entered
- [ ] `mini_app_reload` compiles; `notices[]` read
- [ ] `mini_app_call` smoke test (batch with `calls`)
- [ ] `mini_app_open`, then `mini_app_errors`, then `mini_app_view_eval`
- [ ] `call` keys ⊆ `api` keys; no fetch / secrets / llm in the UI; compound parts from a contract
