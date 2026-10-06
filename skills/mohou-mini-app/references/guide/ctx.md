# `ctx`

Every `defineApp({ api })` method receives the same `ctx`. Do not invent a member.

## Always available

| Member | Returns | Notes |
|---|---|---|
| `ctx.appId` | string | Reverse-DNS id |
| `ctx.appDir` | string | Absolute app directory |
| `ctx.storage.kv()` | `{ get, set, delete, clear }` | Host-owned key-value table. `get` is JSON or `null` when missing |
| `ctx.storage.query(sql, params?)` | rows | One read. Cannot name `kv` |
| `ctx.storage.run(sql, params?)` | `{ changes, lastInsertRowid }` | One `INSERT`/`UPDATE`/`DELETE`/`REPLACE` |
| `ctx.storage.transaction(work)` | callback result | Use `tx`, not the outer `ctx.storage` |
| `ctx.state` | object | A fresh `{}` on every call: not shared, not persisted. Cross-call state goes in module scope (the app module loads once); anything that must outlive a reload goes in `ctx.storage`. |
| `ctx.credentials.get(name)` | string or `undefined` | Owner-stored secret. Do not invent a second name |
| `ctx.config` | `{ theme, palette, locale, chatLanguage, hostPort, llm }` | `theme` is `light` \| `dark` \| `system`. `llm` is `{ provider, model }` or `null` |
| `ctx.log(...args)` | void | App log: JSONL at `apps/<appId>/logs/app.log`, 1 MiB segments, 5 MiB per app, oldest sealed segment dropped. Never log credentials. Nothing reads it back for the app. |
| `ctx.signal` | `AbortSignal` or absent | Aborts when this call settles, and when the user stops. Long jobs must check it |
| `ctx.push(name, params)` | void | Fire-and-forget to this app's views. JSON-serialisable |
| `ctx.http(url, opts?)` | `{ ok, status, headers, text, json }` | 4xx/5xx do not throw. `json` is set only when the content type contains json and parsing succeeds |
| `ctx.bash(command)` | `{ stdout, stderr, exitCode }` | This machine. Do not curl through bash |
| `ctx.pwsh(command)` | `{ stdout, stderr, exitCode }` | Windows path of the same idea |
| `ctx.system.metrics()` | OS snapshot | `loadavg` is `null` where the OS has none |
| `ctx.llm(prompt, opts?)` | **string** | Omitted `provider`/`model` use the live runtime |
| `ctx.agent(goal, opts?)` | **string** | Isolated run. Do not fake it with a loop of `ctx.llm` |
| `ctx.mcp(serverId, toolName, args?)` | tool result | Args are the tool's own object |

## Storage

One SQLite file: `storage/app.sqlite`. JSON files and `table()` are gone. Host owns tables `kv` and `schema_migrations`.

| Need | Use |
|---|---|
| Settings, one snapshot, a small list | `ctx.storage.kv()` |
| Rows you filter, join, or page | `schema/001_name.sql` then `query` / `run` |
| Create/alter tables, seed rows, one-shot data rewrite | next `schema/NNN_name.sql` — not a TypeScript loop of `run` |

`kv().get` returns JSON or `null`. `set` must be JSON-serialisable. `clear` clears only `kv`.

Schema files are `schema/NNN_name.sql`, ids contiguous from 1 (`001_notes.sql`, `002_seed.sql`, `003_backfill.sql`). Host applies pending files when storage opens. One file is one transaction. Do not edit an applied file — write a new one. A schema file may `CREATE` / `ALTER` / `DROP` app tables, and may `INSERT` / `UPDATE` / `DELETE` app rows (seed data and data migration). It must not name `kv` / `schema_migrations`, or `ATTACH` / `BEGIN`. Do not migrate or bulk-seed with a one-shot TypeScript script of `ctx.storage.run` — that work is the next numbered SQL file.

Runtime SQL is one statement: `SELECT` / `WITH` → `query`; `INSERT` / `UPDATE` / `DELETE` / `REPLACE` → `run`. Params are `?` arrays or named keys without the sigil. Forbidden at runtime: `CREATE` / `DROP` / `ALTER` / `PRAGMA` / `ATTACH` / `BEGIN` / `kv`. Runtime `run` is for ongoing app writes after the schema is in place.

Inside `transaction(work)`, use `tx`, not the outer `ctx.storage`.

```sql
-- schema/001_notes.sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

-- schema/002_seed.sql
INSERT INTO notes (title, done) VALUES ('Welcome', 0);

-- schema/003_backfill.sql
UPDATE notes SET title = trim(title) WHERE title != trim(title);
```

```ts
await ctx.storage.run("INSERT INTO notes (title) VALUES (?)", [title])
const rows = await ctx.storage.query("SELECT id, title FROM notes WHERE done = ?", [0])
```

| Code | When |
|---|---|
| `storage-not-json` | `kv().set` value is not JSON |
| `storage-forbidden` | SQL names `kv`, DDL at runtime, `ATTACH`, or the outer handle inside `transaction` |
| `storage-statement` | `query` used for a write, or `run` for a read |
| `storage-sql` | SQLite rejected the statement |
| `storage-too-large` | result over the host row cap |
| `storage-corrupt` | file is not a database; it is quarantined, not replaced |
| `storage-version` | schema stamp from another layout; file stays |
| `storage-migration` | a `schema/` file failed or was edited after apply |
| `storage-backup-too-large` | pending migration backup over the host cap |

Restore is a panel action. The app does not restore backups.

## Workbench

`ctx.workbench` is present only when `manifest.json` has `"kind": "workbench"`. On any other app the field is absent. Do not invent it. The UI still uses `call`. It does not import a panel client. The first screen is the author's own material. The app list is a rail beside that, not the whole page. Worked example: `templates/workbench/`.

| Member | Returns | Notes |
|---|---|---|
| `ctx.workbench.listApps()` | owner list | Each item may include `tags`, `createdAt`, `updatedAt`, `activity` |
| `ctx.workbench.openApp(appId, title?)` | void | Asks the panel to add a tab |
| `ctx.workbench.listWorkbenches()` | `{ id, name, builtin, default }[]` | Includes `{ id: "default", builtin: true }`. One entry has `default: true` |
| `ctx.workbench.setDefaultWorkbench(id)` | void | Writes `defaultWorkbenchId` on `host.json` and shows that iframe. `"default"` clears the field and returns to the builtin library |

An unknown id, or an app that is not a workbench, does not change the stored id. The field does not delete an app, read another app's files, or change settings.

## Shared event names

`ctx.push("stage", …)` and `useApp().on("stage", …)` are joined by a string. Declare names in `shared/` — the only tree both sides may import. The same literal on both sides without that declaration is `event-undeclared`. A name used on one side only is not that failure. `on("*")` is not an event name.

Worked example: `templates/radar/shared/events.ts`. The UI loads one snapshot on mount and then applies events. It does not poll. A reconnect whose last id is older than the buffer delivers `app:gap`; `onAny` surfaces `{ name: "*", data: { gap: true } }`. Refetch the snapshot. Do not invent the missing events.

## HTTP

```ts
const r = await ctx.http("https://example.com/api", {
  method: "GET",
  headers: { accept: "application/json" },
  query: { q: "hi" },
  timeout: 8000,
})
if (!r.ok) throw new Error("HTTP " + r.status)
const data = r.json ?? JSON.parse(r.text)
```

POST: `ctx.http(url, { method: "POST", body: { a: 1 } })`. Objects are JSON. For RSS/HTML use `r.text`.

## Model options

Shared by `llm` and `agent`: `provider?` `model?` `system?` `schema?` `maxTokens?` `retryTimes?` `signal?`.

`schema` is a JSON Schema hint plus fence stripping. The return stays a string. Parse it yourself. See [llm-json.md](llm-json.md).

`llm` and `agent` take `stream?`. Default false. `true` returns a stream the method reads with `for await`. Awaiting it is still the final string. The stream does not reach the UI.

`agent` also takes `maxIterations?` `cwdType?` `cwd?`.

`cwdType` is `app` \| `process` \| `temp` \| `custom`. Default `process`. A `cwd` path alone means `custom`. `custom` requires an absolute `cwd`.

```ts
await ctx.llm(prompt, { stream: true })
await ctx.agent(goal, { maxIterations: 12 })
```

A method that should stream to the UI is an async generator. `yield` is what `streamCall` receives. `return` is the value `await streamCall(...)` resolves to. Do not invent a call id. Model events are not `ctx.push`.

```ts
async function* analyze(ctx, { prompt }) {
  let body = ""
  for await (const event of ctx.llm(prompt, { stream: true })) {
    if (event.type !== eventType.textDelta) continue
    body += event.text
    yield body
  }
  return { title: body.slice(0, 20), body }
}
```

```ts
const pending = streamCall("analyze", { prompt })
for await (const text of pending) append(text)
const row = await pending
```

`call` waits for `return` and drops yields.

The view imports `LlmEvent` and `AgentEvent` from `@mohou/ui`. Do not declare those unions again. `llmEventType` lists llm `type` values. `agentEventType` adds `tool` and `turn`. `done` is that model call's final string.

```ts
import { agentEventType, eventType, llmEventType, useApp, type AgentEvent, type LlmEvent } from "@mohou/ui"
```

Empty completion throws `empty-completion`. Cancel throws `cancelled`. Exhausted retries throw `retry-exhausted`. Match `code`, not the message.

## Long jobs

Honour `ctx.signal`. Persist a snapshot. `ctx.push` progress. Sample first; cap batches. Live numbers stop their timer when the document is hidden (`templates/watch`).

```ts
if (ctx.signal?.aborted) throw new Error("cancelled")
```

## MCP

```ts
const value = await ctx.mcp("calendar", "CalendarDates", { input: JSON.stringify({ year: 2026 }) })
```

Unknown server: `mcp-not-connected`. Start failure: `mcp-start-failed`. Tool error: `mcp-tool-failed`. While authoring, list server and tool names with `mini_app_mcp_list`, then `mini_app_mcp_tools({ serverId, toolName? })` for descriptions and schemas. Not from `ctx`.
