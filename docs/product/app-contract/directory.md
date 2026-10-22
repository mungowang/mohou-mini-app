---
status: shape-locked
progress: open
updated: 2026-10-22
---

# Directory and entries

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract.
- Input: a directory named with the app id, containing `manifest.json`, `ui.tsx`, and `main.api.ts`. Optional trees are `ui/` (UI only), `api/` (backend only), `shared/` (pure code both sides may import), `schema/` (numbered SQL files), and `assets/` (image and SVG files the UI loads by URL). A trivial app has none of these trees. UI modules are `ui.tsx` and `ui/**` only; a source file elsewhere is not UI even when it ends in `.tsx`.
- Output: a loadable app. `manifest.json` carries `id`, `name`, `description`, `version`, and `entry`. `entry` is `ui.tsx`. `id` equals the directory name and matches `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$`. `name` and `description` are non-empty. `version` is a non-empty string. Optional `acronym` is two letters or digits in any script; when omitted, Host derives a two-character monogram from `name`. Optional `tags` is a non-empty set of tokens, each matching `^[a-z][a-z0-9-]*$`. Order does not matter. A repeated token is one tag. Omitted `tags` means the author classified nothing. Optional `kind` is `app`, `workbench`, or `website`. Omitted `kind`, and `app`, are an ordinary app. `workbench` is [a workbench](../panel/workbench.md). `website` is [Website kind](website.md) and requires `url`, an absolute `http` or `https` URL.
- Failure: a bad id emits `app-id-invalid`. A missing required key, a broken manifest JSON, an empty `tags` array, a tag that fails the token rule, or any other `kind` emits `manifest-invalid`. A relative import that leaves the app directory emits `import-escape`. UI importing `api/**` or `main.api.ts`, backend importing `ui/**`, or any side importing `assets/**`, emits `import-forbidden`. React or JSX outside `ui.tsx` / `ui/**` emits `ui-placement`. Callers match the code. The message is for a person. Codes: [implementation.md](../implementation.md).
- Non-goals: a mandatory deep tree; a theme block in the manifest; an author-declared credential list.

`shared/**` contains no React, no DOM, no `ctx`, and no Node. Event names the UI and the backend share are declared once in `shared/`.

`theme.css` and `theme.json` may sit in the app directory. `theme.css` is an optional palette the app owns. `theme.json` is a user pin written by the panel, not an author source file.

## Implementation


Role: definition. `parseAppId` and manifest `resolve*` live with the contract and perform no I/O. `resolveManifest` admits `tags` and drops a repeated token. It admits `kind` of `app`, `workbench`, or `website`, stores `workbench` or `website`, and admits `url` only for `website`. It admits an `acronym` of two letters or digits in any script. Host calls them at load. A bad file emits a code from the plan. `monogram` derives the gallery badge after a valid manifest: the author acronym wins, otherwise the first two letters or digits of the name. Reload rejects `shared` that contains JSX or uses `ctx`, React, DOM, or Node names. Reload rejects React or JSX outside `ui.tsx` / `ui/**` with `ui-placement`. The same event-name string on `ctx.push` and `useApp().on` fails with `event-undeclared`. A name used on one side only is not that failure. `on("*")` is not an event name. Plan: [implementation.md](../implementation.md).
