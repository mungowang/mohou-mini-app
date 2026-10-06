---
status: shape-locked
progress: settled
updated: 2026-10-01
---

# Workbench

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel for the slot. Host for `ctx.workbench`. A workbench is an app whose manifest `kind` is `workbench`. [Directory and entries](../app-contract/directory.md) owns that field. It is a homepage the author designs: what this person wants to see first, and how other apps are arranged and entered. The layout is free, including using no kit component. The sample rail is one sketch, not the type. The app keeps every ordinary app capability.
- Input: `ctx.workbench` on the backend. The UI calls `main.api.ts` and does not import a second client.
- Output: the slot under the tab strip shows either the builtin library or that app's iframe. The builtin library and a workbench iframe both sit in the app frame: inset, rounded, and bordered. An opened app tab does not use that frame. The tab strip, refresh, diagnostics, settings, and close-panel stay on the panel. `openApp` still asks the panel to add a tab. `setDefaultWorkbench` stores the id and switches the iframe immediately.
- Failure: an unknown id, or an app that is not a workbench, does not change the stored id. A missing or unreadable activity file follows [Heat](../host/heat.md). A deleted app, or an app whose kind is no longer `workbench`, leaves the stored id in place and the slot shows the builtin library.
- Non-goals: a second authoring skill or tool; a workbench directory outside `apps/`; delete, trash, settings, or another app's files on `ctx.workbench`; a recommendation source; an appearance setting that turns the app frame on for an opened app.

```ts
const builtinWorkbenchId = 'default'

interface AppListItem {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly acronym: string
  readonly tags?: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly activity?: { readonly openCount: number; readonly lastOpenedAt: string }
}

interface WorkbenchEntry {
  readonly id: string
  readonly name: string
  readonly builtin: boolean
  readonly default: boolean
}

interface AppWorkbench {
  listApps(): Promise<readonly AppListItem[]>
  openApp(appId: string, title?: string): Promise<void>
  listWorkbenches(): Promise<readonly WorkbenchEntry[]>
  setDefaultWorkbench(id: string): Promise<void>
}
```

`listApps` is the owner list. `listWorkbenches` includes `{ id: 'default', builtin: true }` and every app whose kind is `workbench`. Exactly one entry has `default: true`. When nothing else is stored, that entry is `default`. `setDefaultWorkbench('default')` shows the builtin library.

The stored id is the optional field `defaultWorkbenchId` on `host.json`. The field is absent when the builtin library is the default. `default` is the same as absent. A missing app, or an app whose kind is no longer `workbench`, does not fail boot and does not remove the field. The slot shows the builtin library until the id names a workbench app again.

The library's first screen is apps. The trash is a bare glyph beside the search field, muted until the pointer is on it, and it opens a panel listing the deleted apps with one restore action each — a refused restore stays on its own row. The count lives in that panel's header, not on the glyph. A workbench app offers the same thing through `ctx.workbench.listTrash` and `restoreApp`, which are the operations this route calls. The builtin library is one grid. Choosing a card opens a tab and does not change the slot. The grid does not put a label or a set-default control above a card. On the list home, a bar to the left of the toolbar lists the builtin library and every workbench app. The builtin tab shows a grid icon. A workbench tab shows that app's acronym. That bar is hidden on an app tab. The slot changes from that bar, from the workbench tab action, or from `setDefaultWorkbench`. Those three write the same field. Saving another setting does not clear the field. Refresh on the list home reloads the workbench in the slot after it refreshes the list. Refresh on an app tab reloads that app and does not reload the slot.

When a workbench fills the slot, the host status row carries a chip on the right: this is a custom home, more lives in a tab, and an arrow opens that workbench as an app tab. It is not a second toolbar. Settings, history, and storage cover that row. History, storage, and the app theme pin live on an app tab, not on the slot. The builtin library has no such control. Opening again focuses the existing tab.

A workbench tab shows set-as-home (pin plus that label) and delete as an icon in their own toolbar block, with a short rule between them. When that app is already the stored id, the pin is filled and the label names the current home. Clicking it writes `default` and the slot returns to the builtin library. A non-workbench app tab shows only the delete icon. The builtin library has no set-as-home action.

The builtin library renders `WorkbenchLibrary` from `@mohou/app-view`. It takes `apps` and `openApp`. The panel fills those from the owner list. A workbench app does not render that component. It calls `ctx.workbench` and composes its own page. `AppCard` is available. A card does not open an app. [UI kit](../app-contract/ui-kit.md) owns the card props.

## Implementation

Role: definition in `@mohou/contract`. `createAppWorkbench` in the host attaches `ctx.workbench` only for a live workbench app, and publishes `workbench:default` after a write. The panel renders `WorkbenchLibrary` for the builtin slot and that app's iframe when the stored id names a workbench. The home bar and the workbench-tab action write the same `host.json` field. The status-row control opens the slot workbench through the same open path as a library card. The panel imports `@mohou/app-view` and does not import the UI kit. Plan: [implementation.md](../implementation.md).
