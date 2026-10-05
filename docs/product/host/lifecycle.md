---
status: shape-locked
progress: settled
updated: 2026-09-23
---

# App lifecycle

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Host.
- Input: authoring tools or panel HTTP that create, list, open, call, reload, or delete an app.
- Output: apps on disk under `apps/<appId>/`, a loaded backend module, and a compiled UI bundle. `mini_app_list` returns `{ apps, runtimeRoot }`. `mini_app_get` returns the manifest summary and the absolute directory.
- Failure: an unknown app id fails the operation with `app not registered`. A duplicate register fails and does not overwrite. Delete moves the app directory, including history, to trash. A delete of an unknown id fails and moves nothing.
- First boot: `apps/` and `trash/` are created, and when the library has no apps and no `.startup-seed` marker, the skill's facades are copied in — `today`, `board`, and `lab` — with their manifest ids rewritten. The marker makes that once per runtime root, so deleting a sample does not bring it back.
- Non-goals: Host opening a window; Host choosing a model vendor; an unregister tool on the authoring surface.

`mini_app_register` takes manifest fields (`appId`, `name`, `description`, `version`, optional `acronym`, `tags`, `kind`) and returns `{ directory, needed }` plus the list summary. `needed` is the absolute paths of `ui.tsx` and `main.api.ts`. A `files` field is rejected. The agent writes those paths with its own file tools. [Author surface](../author-surface.md) owns the tool row.

## Implementation


Role: provider, constructed only by Shell. Create registers no child. `createHost` resolves config, creates the authoring token when missing, and registers no child. The session exposes the authoring tools, the owner reads, owner `list` and `open`, policy read and write, provider probe, owner `deleteApp`, owner `listTrash`, owner `undeleteApp`, and owner `restoreStorage`. `start` opens the loopback listener and the injected brain. Author, owner, and iframe routes share that listener. A failed start leaves neither running. `dispose` stops new calls, waits for in-flight calls, waits for child exit, then closes storage. Duplicate id emits `app-duplicate`. Plan: [implementation.md](../implementation.md).
