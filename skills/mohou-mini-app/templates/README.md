# Mini-app templates

Each template is a **product facade**: one interaction loop × one default Look. Use the table to find the closest starting point — real apps routinely take pieces from several.

Looks (style recipes, not apps) live in [`../references/looks/`](../references/looks/index.md). Open them only when the user names a style.

| Template | Loop | Copy it when | What it teaches |
|---|---|---|---|
| [minimal](./minimal/) | one `call` | Starting out / connectivity | `defineApp` + `useApp().call` + `AppShell` skeleton. No Look. |
| [today](./today/) | open → see my screen → one record | Personal home, "what first" | `ctx.storage.kv()` + `ListDetail` + glass-island |
| [board](./board/) | items move in 2D status | Pipelines, "who is blocked" | `Kanban` + `DataGrid` + `Sheet` + `ctx.llm` confirm. aurora-bento |
| [radar](./radar/) | I trigger → wait → read (cancel) | Fetch sources, write a brief, long job | `ctx.push`/`on` names in `shared/events.ts`; long job in `api/`; brief in `ui/`. editorial |
| [sheets](./sheets/) | file in, grid work | `.xlsx` / column stats / compare | **`mini_app_install`** (`exceljs`) + lodash aggregates + `DataGrid`. desk-split |
| [runner](./runner/) | the UI *is* the run | Multi-step model work | `ctx.agent` + `streamCall`. terminal |
| [chores](./chores/) | named buttons, no model | One button on this machine | `ctx.bash` → stdout in `Terminal`. Not a prompt. |
| [watch](./watch/) | numbers move by themselves | Live status, stop when hidden | `ctx.system.metrics()` + polling that stops when hidden. tape. **Reveal** |
| [lab](./lab/) | I drive a model or an MCP tool, once, and keep the record | Model workbench, MCP tool picker, a run log | `ctx.llm` vs `ctx.agent` + `ctx.mcp` in one app; a catalog of MCP servers in `shared/mcp.ts`; a run table in SQLite. No Look. |
| [workbench](./workbench/) | a custom homepage | What to see first, and how other apps are entered | `kind: "workbench"`, `ctx.workbench`. Any layout. This sample is one homepage: a queue and a rail. No Look. |

## Templates that need a library

`sheets/` ships **no** `package.json`. After `mini_app_register`, install first, then reload:

```
mini_app_install({ appId: "com.example.sheets", packages: [{ name: "exceljs" }] })
mini_app_reload({ appId: "com.example.sheets" })
```

## How to use them

1. **Start from the closest loop** (the table). An app with several regions lifts one loop per region. A workbench is a homepage: design what is seen first, and design how other apps are arranged and entered. The sample rail is one sketch.
2. **Lift the pattern, not the file.** Comments marked `// ⭐` are the teaching points.
3. Looks are optional. Kit components first; Tailwind for the distinctive grammar. No hex.
4. **Three facades ship a `theme.css`** (`today`, `runner`, `chores`) because their look is
   hue-dependent — the panel shows it as a palette tagged `本应用` and the user can switch away.
   The other facades follow the host palette on purpose. Do not add one to a plain CRUD app
   ([../references/theme.md](../references/theme.md) → *App-local palette*).
5. Visible copy in these samples is Chinese. Instructions and comments are English.
