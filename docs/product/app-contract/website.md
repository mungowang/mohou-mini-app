---
status: shape-locked
progress: settled
updated: 2026-10-22
---

# Website kind

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host runs the driver and the view session. Panel shows the tab and reports close.
- A website is still a full app: `ui.tsx`, `main.api.ts`, optional `api`, and ordinary `ctx`. It adds a **driver** layer for the embedded content URL and optional local process.
- **Manifest:** `kind` is `website`. `url` is required and is an absolute `http` or `https` URL. `entry` remains `ui.tsx`. [Directory and entries](directory.md).
- **Two layers:**
  1. **App / view session** — same rules as every app ([View session](../host/view-session.md)). `api` methods and chrome UI run here. Spawns from `api` are **`app`**-tagged ([ctx.spawn](ctx-spawn.md)).
  2. **Website driver** — `defineApp({ website: { ensure, refresh?, dispose?, content? } })`. Host calls these hooks. Spawns inside these hooks are **`website`**-tagged.
- **`ensure(ctx)`:** required. Runs when the view session starts (open tab / slot). May `ctx.spawn`, await `ready`, and `return { url }` to override the manifest default. Omitted return keeps `manifest.url`.
- **`refresh(ctx, { url })`:** optional. Panel reload and `useWebsite().refresh` use this path while the **view session stays**. Host does **not** kill **`website`**-tagged spawns before or after the hook. If a process must restart, the author `kill`s that handle and spawns again inside `refresh`. Host **does** kill **`app`**-tagged spawns on reload, same as an ordinary app.
- **`dispose(ctx)`:** optional. Runs when the view session ends, before Host kills remaining spawns. Authors may release non-spawn resources; Host still kills all registered spawns for the app.
- **`content`:** optional `onLoad` / `onLoadFailed` / `onDocumentIdle` with `{ url, generation, reason? }`. Content plane; not a substitute for ensure.
- **UI:** `@mohou/ui` exports `WebsiteFrame` and `useWebsite`. The default chrome covers ensuring, connecting, live, refreshing, and failing (expand detail + copy). Failing `error.detail` may carry recent child process output for analysis. Authors may wrap the frame with more UI and still use `api`.
- **Open:** Host publishes `app:open` without waiting for ensure to finish. Ensure runs in the background; the frame shows starting until the snapshot is ready.
- Failure: missing `website.ensure` or invalid driver shape is `define-app-invalid` at load. Ensure/refresh failures surface on the website snapshot (`failing`) and do not replace the view session by themselves. Spawn failures use spawn codes. When a child wrote stdout/stderr, Host attaches a bounded tail as `error.detail` (and `SpawnError.detail` / `handle.output()` for authors who catch in hooks).
- Non-goals: reverse proxy; Host auto-killing website-tagged children on refresh; website without `ui.tsx`.

```ts
defineApp({
  name: 'Pi Web',
  description: '…',
  api: {
    // optional chrome; spawn here is app-tagged
  },
  website: {
    async ensure(ctx) {
      const child = await ctx.spawn('pi-web', ['--no-open', '--port', '30141'])
      try {
        await child.ready({ url: 'http://127.0.0.1:30141', timeoutMs: 30_000 })
      } catch (error) {
        const tail = child.output()
        if (tail.length > 0) ctx.log('pi-web output:\n', tail)
        await child.kill().catch(() => undefined)
        throw error // Host also sets snapshot error.detail from the same tail
      }
      return { url: 'http://127.0.0.1:30141' }
    },
    async refresh(ctx, cur) {
      // default: keep website-tagged processes; only rebind url if needed
      return { url: cur.url }
    },
  },
})
```

## Implementation

Role: definition for driver types; Host tags spawn by hook vs api, runs ensure after view enter, refresh on reload for website kind, dispose on view session end. Snapshot event `mohou.website`. Plan: [implementation.md](../implementation.md).
