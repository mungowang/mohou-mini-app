# Loader

The host compiles on the fly. Backend (`main.api.ts` + relatives) loads through type stripping. UI (`ui.tsx` + relatives) bundles to one ESM file. The iframe does not compile.

## Layout

```
manifest.json         id, name, description, version, entry; optional acronym, tags
ui.tsx                UI entry (`entry` is this file)
main.api.ts           backend entry
ui/                   UI only
api/                  backend only
shared/               both sides — pure code
schema/               numbered SQL migrations: `NNN_name.sql` (DDL, seed, data rewrite)
assets/               images and SVG, loaded with `useApp().resolveAssetUrl`
theme.css             optional app palette (author)
ui.css                optional author CSS, appended unchanged
theme.json            panel pin — not an author source file
```

UI modules are `ui.tsx` and files under `ui/` only. A component at the app root or under another folder (for example `components/`) is still classified as backend. Reload fails that as `ui-placement`; move the file under `ui/`.

A trivial app needs none of the folders. `schema/` files are `NNN_name.sql`, ids from 1 with no gaps. Host applies pending files when storage opens. One file may create or alter tables and may seed or rewrite rows. Runtime `query` / `run` cannot create tables and must not replace a one-shot data migration. `theme.css` only when the look depends on a hue. Do not write `theme.json`.

Enforced:

- UI importing `./api/**` or `main.api.ts` → `import-forbidden`
- backend importing `./ui/**` → `import-forbidden`
- either side importing `./assets/**` → `import-forbidden`. Use `resolveAssetUrl`
- either side importing outside the app dir → `import-escape`
- `shared/` with JSX, or using `ctx` / React / DOM / Node names → `shared-invalid`
- React or JSX outside `ui.tsx` / `ui/` → `ui-placement`
- the same event string on `ctx.push` and `useApp().on` without a declaration in `shared/` → `event-undeclared`

`shared/` is pure: no React, no DOM, no `ctx`, no Node. Event names both sides use are declared once there and imported. A name used on one side only is not that failure. `on("*")` is not an event name.

## Backend

```ts
import { defineApp } from "@mohou/contract"
import { groupBy } from "lodash"
import { readFile } from "node:fs/promises"
```

The host injects `defineApp`. Allowlist: `@mohou/contract`, `lodash` / `lodash-es`, Node built-ins, one library installed into this app, and relative paths that are not under `ui/` or `assets/`. A UI-only module on the backend is `import-forbidden`, not an install hint.

A real Node library: `mini_app_install({ appId, packages: [{ name: "exceljs" }] })`, then `import ExcelJS from "exceljs"`. Do not hand-write `package.json`. `sheets` teaches install and ships without `package.json`.

`export default defineApp({ name, description, api, onHostEvents?, website? })`. When `kind` is `website`, `website.ensure` is required.

`onHostEvents(ctx, event)` is optional. It is not an `api` method. Any loaded app may define it. The host calls it when a host notice is published. `useApp().on` does not receive that notice. The hook may `ctx.push` a name this app owns. Notices and payload: [ctx.md](ctx.md#host-notices).

## Frontend

```ts
import { useState } from "react"
import { useApp, Button, cn } from "@mohou/ui"
import { groupBy } from "lodash"
import { motion } from "motion/react"
```

Allowlist: `react`, `@mohou/ui`, `lodash`, `lodash-es`, `motion`, `motion/react`, and relative paths that are not under `api/` or `assets/` and are not `main.api.ts`. Hooks from `react`. Components, `useApp`, and `cn` from the kit. A file under `assets/` is `resolveAssetUrl("./assets/mark.svg")`, then `<img src={url} />`. Never import `recharts`, `lucide-react`, `@codemirror/*`, `shiki`, or a second React.

`motion` is UI only. Node built-ins are backend only.

## Lodash

`lodash` and `lodash-es` are the same full build on both sides. `import lodash from "lodash"` is the shared file. `import get from "lodash/get"` is compiled into that app.

## Reload codes

Match `code`. The message is for a person.

| Code | Next step |
|---|---|
| `app-id-invalid` | `com.<you>.<thing>` |
| `app-not-registered` | `mini_app_register` first |
| `manifest-invalid` | `id` `name` `description` `version` `entry`, or a bad `acronym`, `tags`, `kind`, or website without `url` |
| `import-forbidden` | drop the specifier, or `mini_app_install` if the message names that tool |
| `import-escape` | keep the import inside the app dir |
| `define-app-invalid` | fix `name`, `description`, `api`, or a non-function `onHostEvents` |
| `backend-invalid` | backend syntax or an undefined name |
| `ui-invalid` | UI bundle or an undefined name |
| `shared-invalid` | JSX or a forbidden name in `shared/` |
| `ui-placement` | move the React/JSX file under `ui/` |
| `event-undeclared` | declare the name once in `shared/` and import it on both sides |
| `commit-failed` | compile succeeded; `mini_app_history_commit` |

`notices` do not fail reload: `keyframe-duplicate`, `keyframe-collision`, `identifier-skipped`.

`caches.appCss` is `dropped`. `caches.views` is `refetch` or `not-open`. Do not curl the host to prove CSS.

## Forbidden

- Old package names (`@monkey-mini-app/*`, `@mini-app/*`) — they fail. Use `@mohou/ui` and `@mohou/contract`
- npm packages in `ui.tsx` except the allowlist
- Node builtins in the UI or in `shared`
- `../` out of the app dir
- A second React
