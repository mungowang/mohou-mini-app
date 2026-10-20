---
status: shape-locked
progress: settled
updated: 2026-10-19
---

# Compile and reload

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Host.
- Input: `mini_app_reload({ appId, cleanCaches? })`. Default `cleanCaches` is true.
- Output: `{ ok, errors, notices?, compiled, committed, caches }`. On success the in-memory API module, UI bundle, and app CSS are dropped (`caches.appCss` is `dropped`), on-disk build output is purged when `cleanCaches` is true, and open panels are told to refetch. `caches.views` is `refetch` when a subscriber was told, and `not-open` when nobody was listening. Host does not wait for the browser.
- Stages, in order: backend transpile and module load; UI bundle; undefined-identifier pass. The iframe does not compile. `react` is served as the platform runtime. The UI kit is served as the platform SDK. Each vendor is served as its own file.
- Failure codes, and the only next step they imply. The message is for a person. A `backend-invalid` or `ui-invalid` failure that no resolve plugin named carries esbuild's own text, one line per message as `file:line:column: text`. Codes: [implementation.md](../implementation.md).

| Code | Next step |
| --- | --- |
| `app-id-invalid` | fix the id |
| `app-not-registered` | register first |
| `manifest-invalid` | fix JSON or a required key |
| `import-forbidden` | remove the specifier, or install a backend library if the message names that tool |
| `import-escape` | keep the import inside the app directory |
| `define-app-invalid` | fix `name`, `description`, or `api` |
| `backend-invalid` | fix backend syntax or an undefined name |
| `ui-invalid` | fix the UI bundle or an undefined name |
| `shared-invalid` | fix an undefined name in `shared/**` |
| `ui-placement` | move the React/JSX file under `ui/` |
| `event-undeclared` | declare the shared event name once in `shared/` and import it on both sides |
| `commit-failed` | compile succeeded; fix the history commit |

- `committed.status` is `committed`, `clean`, `skipped`, or `failed`. `skipped` on a failed compile means no commit was attempted. `failed` includes `reason`.
- `notices` carry lower-confidence findings, including keyframe collisions and a skipped identifier pass when the parser cannot load. A notice does not fail reload. A missing parser does not brick reload.
- The UI bundle keeps component names. Relative imports are checked against the real directory path so a symlink prefix is not mistaken for an escape. The runner document does not wait for that bundle. The iframe loads it from `GET /api/app/:appId/ui/entry.js`.
- Failure of compile leaves the previous good bundle in place for an already-open view until a later success emits reload. The tool result is `ok: false` with `errors`.
- Reload opens storage, then loads the backend, then runs the identifier pass, then bundles `ui.tsx` in memory. Platform modules stay external. Component names are kept. A relative import whose real path leaves the app is `import-escape`. A storage, load, review, or bundle failure returns `ok: false` and leaves the previous backend and bundle in place. A missing parser is a notice and does not fail reload. A duplicate or reserved `@keyframes` name is a notice and does not fail reload. React or JSX outside `ui.tsx` / `ui/**` fails reload with `ui-placement`. The bundle is written to `.autogen/entry.js` inside the app. A later read whose source stamp still matches returns that file and does not keep the text. `cleanCaches` defaults to true. A non-boolean is `tool-args`. The flag is recorded on the result. `cleanCaches` deletes `.autogen` before the new bundle is written.
- Non-goals: type-checking the whole app as a gate; compiling inside the iframe; a second copy of a platform module inside the app bundle.

Tailwind compiles the app sheet to `.autogen/ui.css`. Host does not parse `className`. A missing app directory is `ui-invalid`. The author's `ui.css`, when present, is appended unchanged. The stylesheet uses the same source stamp as the bundle. `cleanCaches` deletes `.autogen`, so the next request compiles again.
