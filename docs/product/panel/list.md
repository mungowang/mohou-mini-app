---
status: shape-locked
progress: settled
updated: 2026-10-11
---

# List and open

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel.
- Operations: [list](../owner-surface.md#list) and [open](../owner-surface.md#open). Search and card style stay on this page. They are not host fields.
- Output: a gallery of name, description, monogram, and version. The library search field opens [Command palette](palette.md). It does not filter this grid. A search with no matches is that overlay's empty row, not the empty gallery. The host status row is on the gallery tab only. Its mark is muted: quiet while the host is up, dull when the list failed, and duller when the host is unreachable. When a workbench fills the slot, that row also carries a right-side control that opens the workbench as an app tab; [Workbench](workbench.md) owns that control. An app tab does not show the status row. An app tab fills the area under the tab strip. It has no inset and no rounded frame. Opening adds a tab immediately and mounts the iframe at the host app URL. Open tabs share the host event stream, so a new document is not waiting on a socket held by another tab. The tab shows a host pending state until that document loads. The document does not wait for the UI bundle. Switching a tab hides that iframe and does not load it again. Closing the tab unmounts it. The gallery tab stays. An `app:open` event focuses that app's tab and shows the panel.
- `app:changed` refetches the gallery and the trash. [Events](../host/events.md) owns the payload.
- Failure: Host unreachable shows a distinct error, not an empty gallery. A failed open removes the tab it just added and shows the host error. A failed list shows the host error. A trash load failure does not clear the gallery. An empty real list shows the empty state.
- Non-goals: editing source in the gallery; opening an app by writing the runtime directory.

## Implementation


Role: consumer. `PanelGallery` calls an injected client and `useReducer`. The reducer calls `filterGallery`, `galleryKind`, and the tab functions. The library field does not dispatch that filter. It opens the command palette. Chrome is Tailwind utilities. `pnpm build:panel` writes the document and script. Host serves those files and does not compile the panel. Host still injects the palette into the document. The gallery sets `data-card` and `data-cardstyle` to `stamp`, `etch`, `hero`, `pulse`, `list`, or `glass`, and draws each app with `AppCard`. A workbench app is marked. Opening it adds a tab and does not change the slot. The first card style is `hero`. A later choice is kept in the panel document's local storage and restored on the next load. It is still not a host field. `list` puts the name before the monogram. The frame contents are injected. An open app's frame stays mounted while another tab is visible. This package does not name a host route and does not import Host. Plan: [implementation.md](../implementation.md).
