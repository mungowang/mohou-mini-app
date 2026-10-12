# A short list

This is one `kv()` list. Do not put several filterable entities in this array. Settings and one snapshot stay in `kv()`. Rows you filter get `schema/001_name.sql` plus `query` / `run`. Seed data and one-shot row rewrites also go in the next numbered schema file, not a TypeScript migration. See [ctx.md](ctx.md).

`acronym` is optional: two letters or digits in any script. `tags` are lowercase tokens matching `^[a-z][a-z0-9-]*$`. A repeated token is one tag. Omit `tags` when the app is not classified. `kind` is omitted, or `"app"`, for an ordinary app. `"workbench"` is a homepage. There is no theme block.

`manifest.json`:

```json
{
  "id": "com.example.foo",
  "name": "My Mini App",
  "description": "One line description for the app",
  "version": "0.1.0",
  "entry": "ui.tsx"
}
```

`main.api.ts`:

```ts
import { defineApp } from "@mohou/contract"

async function loadItems(ctx) {
  const items = await ctx.storage.kv().get("items")
  return Array.isArray(items) ? items : []
}

export default defineApp({
  name: "My Mini App",
  description: "One line description for the app",
  api: {
    async list(ctx) {
      return loadItems(ctx)
    },
    async add(ctx, args) {
      const title = String(args?.title ?? "").trim()
      if (!title) throw new Error("请填写标题")
      const items = await loadItems(ctx)
      const item = { id: "i_" + Date.now(), title, createdAt: Date.now() }
      items.unshift(item)
      await ctx.storage.kv().set("items", items)
      return item
    },
  },
})
```

`onHostEvents(ctx, event)` is an optional sibling of `api`, on any app. It is not a method the UI `call`s. Use it when this loaded instance must react to a host notice (library change, reload, market install, and the rest). Push a name this app owns; the view listens with `useApp().on`. Details: [ctx.md](ctx.md#host-notices). Worked example: `templates/workbench/`.
