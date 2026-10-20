# Troubleshooting

Match `code` on a reload error. The message is for a person. `mini_app_call` surfaces backend runtime failures; `mini_app_errors` surfaces UI runtime failures (the ones no compile step can see).

## The UI is blank / wrong and the build was green

That is expected: a bundle can compile and still throw at render. The loop is

```
mini_app_reload → mini_app_open → mini_app_errors → mini_app_view_eval
```

`mini_app_errors` returns `kind` + `message` + `componentStack`. `componentStack` names the component that threw, which a raw browser stack does not.

| `kind` | Meaning | Typical cause |
|---|---|---|
| `render` | Thrown while React was rendering — caught by the app's error boundary | undefined name, bad props, a hook called conditionally |
| `module` | The compiled bundle never evaluated | bad import, SDK missing, entry mismatch |
| `uncaught` | Threw outside render | an event handler, a timer callback |
| `async` | A promise rejected with no handler | `call()` without a `catch`, un-awaited fetch |

If the ring is empty you probably never opened it — the hint says so. An app that renders **but looks wrong** is a `mini_app_view_eval` question, not an error question.

The UI compile **strips types and does not typecheck**. Wrong `useStore` keys, a mistyped
`call("…")`, or a prop the component does not have all compile green and throw `TypeError`
at render (`kind: render` in `mini_app_errors`). Fix the key against the contract.

### `mini_app_view_eval` did not answer

| `view` | Meaning | Next step |
|---|---|---|
| `not-open` | no browser is attached, or the panel has no frame for this app | `mini_app_open`, then retry |
| `runner-not-booted` | the iframe exists but its script never ran | `mini_app_errors` (a `module` error), then `mini_app_open` |
| `pending` | your query is **still running** in a healthy view | raise `timeoutMs` (default 1500, max 8000) or return before awaiting. Nothing is broken and the user must not be told to reload — the host proved that by getting an answer to a trivial probe |
| `stuck` | the script ran, then stopped answering, and even the trivial probe went unanswered — the thread really is blocked | a `while (true)` in your own `code` does this, and it wedges the panel page too: tell the user to reload the tab |
| `live` + `ok: false` | the view is fine, **your query** failed | `error.line` / `error.source` point into your JS |

More → [eval.md](eval.md).

## "Did my change actually take effect?"

`mini_app_reload` answers this in its own result, so you never have to infer it from a
screenshot. **CSS is part of the contract, not an afterthought:** a successful reload always
drops the in-memory build of the API module, the UI bundle **and** the app's Tailwind CSS
(`appCss: "dropped"`), then tells every attached panel to re-fetch. There is no "CSS somehow
stayed" path — if `caches.appCss` is not `"dropped"`, something else is wrong.

```json
{ "ok": true, "caches": { "appCss": "dropped", "views": "refetch", "cleanCaches": true } }
```

- `views: "not-open"` → nobody was listening. Call `mini_app_open`.
- `views: "refetch"` → a subscriber was told to re-fetch. Host does not wait for the browser.
- `cleanCaches` defaults to true. Pass `false` only when you want to keep on-disk build output.

To prove the frame is a *new document*, compare `performance.timeOrigin` across the reload —
the refreshed URL carries a cache-buster, so a real reload always changes it:

```
mini_app_view_eval({ appId, code: "return performance.timeOrigin" })   →  reload  →  ask again
```

Unchanged means it never reloaded. Then assert your *content* too: query a string only the new
code can print, rather than looking at the panel.

## `empty-completion` / `retry-exhausted`

`ctx.llm(prompt, { schema })` retried and still got nothing parseable. The message lists every
attempt (`err.attempts`: `kind` `json` | `transport`, `error`, `bytes`, `head`) — read it before
changing anything, the shape of the bad answer *is* the diagnosis:

| The attempts say | Meaning | Fix |
|---|---|---|
| `transport`, 0 bytes every time | the model never answered | provider/config, not your prompt |
| `json` with `head` = prose ("Here is the JSON:") | the schema instruction lost to the chatty system prompt | shorten `system`, put constraints in `schema` |
| `json` with `head` = truncated object, `bytes` suspiciously round | hit the output ceiling | pass a bigger `maxTokens`, or ask for fewer items |
| `json` with `head` = reasoning text | the budget died before the answer | bigger `maxTokens`; a reasoning model needs headroom |

Never wrap `ctx.llm` in a hand-rolled salvage parser: the retries and the evidence are already the
same thing, one layer down.

## `mini_app_reload` → `errors[i].code`

Match `code`. The message is for a person. Full table: [loader.md](loader.md).

| Code | Next step |
|---|---|
| `app-id-invalid` | `com.<you>.<thing>` — no Chinese, spaces, or underscores |
| `app-not-registered` | `mini_app_register` first |
| `manifest-invalid` | `id` `name` `description` `version` `entry`; JSON has no comments |
| `import-forbidden` | drop the specifier, or `mini_app_install` if the message names that tool |
| `import-escape` | keep the import inside the app dir |
| `define-app-invalid` | `name`, `description`, and `api` as an object |
| `backend-invalid` | backend syntax or an undefined name |
| `ui-invalid` | UI bundle, missing import, or missing `ui.tsx` |
| `shared-invalid` | no JSX / `ctx` / React / DOM / Node in `shared/` |
| `ui-placement` | React/JSX only in `ui.tsx` or under `ui/` |
| `event-undeclared` | declare the push/`on` name once in `shared/` |
| `commit-failed` | compile succeeded; `mini_app_history_commit` |

### `committed.status` after a reload

| `status` | Meaning | Do |
|---|---|---|
| `committed` | A new commit was made | — |
| `clean` | Tree already matches HEAD | Nothing — this is normal |
| `skipped` | Compile failed, so nothing was committed | Fix `errors[]` first |
| `failed` | Commit itself errored (`reason`) | `mini_app_history_commit`, or check the git dir |

## Runtime / smoke-test messages

| Message | Root cause | Fix |
|---|---|---|
| `Method not found: <m>` | `call("<m>")` is not a key of `api` | Align with `defineApp({ api })` keys (case-sensitive) |
| `main.api must export defineApp({ name, description, api })` | Missing `export default defineApp({...})` | Add the default export |
| `defineApp requires name and description` | One of them is missing | Provide both |
| `defineApp.api must be an object` | `api` written as a function or array | `api: { async list(ctx) {…} }` |
| `defineApp.onHostEvents must be a function` | `onHostEvents` is present but not a function | Pass a function, or omit the field |
| `backend cannot import '<spec>'. Install it first: mini_app_install(...)` | The app needs that library but it is not in its own `node_modules` | Run `mini_app_install({ appId, packages: [{ name: "<spec>" }] })`, then `mini_app_reload`. Do **not** move the import into `ui.tsx` |
| `backend cannot import '<spec>' (no package.json)` | Same, and nothing has ever been installed for this app | `mini_app_install` creates the manifest — never hand-write `package.json` |
| `backend cannot import '<spec>': it resolves outside this app's node_modules` | The app is reaching the plugin's/repo's dependency tree | Reinstall the package into the app; a host dependency is not an app dependency |
| `Cannot find package '<x>'`-style npm failure from `mini_app_install` | Typo, no network, or the name is not on the registry | Fix the name/version; report the npm stderr to the user rather than inventing a substitute |
| `backend cannot import '<spec>': ui/** is UI-only` | Backend reached into the UI tree | Move the shared logic to `shared/**` |
| `backend import escapes app dir: <spec>` | Backend imported `../` past the app root | Keep every import inside the app dir |
| `… looks like UI; keep UI modules in ui.tsx or under ui/` | A React/JSX file sits outside `ui.tsx` / `ui/` (`ui-placement`) | Move it under `ui/`. The app root and `components/` are not UI trees |
| `unsafe relative path: <rel>` | Path contained `..` or was absolute | `mini_app_*` `path` values are app-relative |
| `register requires manifest.json` | `files` had no manifest | Add it |
| `cancelled` | The user pressed stop and `ctx.signal` fired | Expected behaviour; long jobs must wire it (see ctx.md) |
| `storage-not-json` | `kv().set` value is not JSON | Pass a JSON-serialisable value |
| `storage-forbidden` | SQL named `kv`, ran DDL, or used the outer handle in `transaction` | App tables only; use `tx` inside a transaction |
| `storage-statement` | `query` for a write, or `run` for a read | `SELECT` → `query`; `INSERT`/`UPDATE`/`DELETE`/`REPLACE` → `run` |
| `storage-migration` | `schema/` file failed or was edited after apply | Fix the file, or write the next numbered file. Seeds and data rewrites also belong in that next file, not a TypeScript `run` loop |
| `storage-corrupt` | file is not a database | Host quarantined it; do not invent a replacement |

## UI compile messages

| Message | Root cause | Fix |
|---|---|---|
| `UI cannot import main.api.ts; use useApp() from @mohou/ui` | UI imported the backend | Go through `call(method, args)` |
| `UI cannot import api/**: "<spec>"` | UI reached into the backend tree | Move the shared logic to `shared/**` |
| `UI import escapes the app dir: "<spec>"` | `../` pointed at a sibling app or outside | Keep every import inside the app dir |
| `missing ui entry (ui.tsx / App.tsx)` | `manifest.entry` points at a file that isn't there | Match `entry` to the real file |
| `Failed to resolve import "<pkg>"` | Imported an npm package the app directory does not have | UI: `react` / `@mohou/ui` / in-app relative paths. React, lucide and recharts already ship inside the SDK |

## It compiles but looks wrong

| Symptom | Check first | Note |
|---|---|---|
| A class did nothing | Whether the class name is a **complete literal** | Tailwind scans source text: `` `bg-${x}-500` `` generates **no CSS and no error**. Full names only → [styling.md](styling.md) |
| Token wash looks wrong | `bg-card/60` against the host skin | `color-mix(in oklch, var(--card) 60%, transparent)` → [styling.md](styling.md) |
| `backdrop-blur-*` did nothing | Blur over the iframe/skin is unreliable | Same `color-mix` wash; do not rely on `backdrop-blur-*` for glass |
| Colours wrong in dark mode | Any hardcoded hex | Use tokens → [theme.md](../theme.md); the user's palette rewrites token values |
| Custom theme file does not appear | Short keys (`--bg`) or only one mode | Same names as the token table (`--background`, `--foreground`, `--primary`) in **both** light and dark → [theme.md](../theme.md) |
| A node rendered to nothing | Its box and its classes, from the view | `mini_app_view_eval({ appId, code: 'return mma.$$("#root *").filter(n => !n.getBoundingClientRect().width).map(mma.selector)' })` — usually a class that never compiled, or a condition that never matched |
| A token looks unset | The **computed** value, not the class name | `const cs = getComputedStyle(mma.$(".x")); return { color: cs.color, bg: cs.backgroundColor };` → [styling.md](styling.md) |
| Panel still shows the old app after a fix | It should have refreshed on its own (`app:reload`) | If the browser was not attached to `/api/events`, use the panel's reload button |
| The iframe is a thin strip | **Not an app problem** | Host iframe height; refresh or reopen the panel |
| Blank page, no console error | Whether `#root.boot` gets cleared | That is load art only; it must be gone before mount |
| Editor missing / code not highlighted | `CodeEditor` `CodeBlock` `DiffViewer` | They fetch CodeMirror / shiki from `esm.sh` on demand; on a blocked network they degrade. **Do not** `pnpm add` them and do not `import @codemirror/*` / `shiki` |
| Rich text editor looks plain | `RichTextEditor` | It is a local contentEditable editor — no CDN, no dependency |
| `ctx.http` times out | `http: timeout` / `http: only http/https` / `http: response too large` | Pass `timeout`; http/https only; page or sample large payloads |
| `ctx.llm` says no model service / stream empty | Model not configured | A human configures it in settings or `POST /api/llm-config`; app code stays `await ctx.llm(...)` |
| `mcp-not-connected` | Unknown server id | `mini_app_mcp_list` → `mini_app_mcp_tools({ serverId })` → `ctx.mcp(serverId, toolName, args)` |
| `mcp-start-failed` | That server did not start | Read `cause`; try another server. Do not curl Host |
| MCP does nothing | Args wrapped as `{ input }` unless that is the tool schema | Pass the tool's own object |

A host that is not running is not an app bug. Do not curl the loopback port. Use `mini_app_list` to see if the tools are mounted.
