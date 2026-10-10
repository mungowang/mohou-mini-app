---
status: shape-locked
progress: settled
updated: 2026-09-29
---

# Theme

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel.
- Operations: [setAppPin](../owner-surface.md#setapppin), [listPalettes](../owner-surface.md#listpalettes), [deletePalette](../owner-surface.md#deletepalette), and [writePolicy](../owner-surface.md#writepolicy) for global appearance. The app-local row appears only in app scope and only when `theme.css` parsed. A shipped palette is marked system. A file from the themes directory is marked custom and can be deleted from Settings. The app file is marked app. Its label is the file's name when the header has one. Deleting the selected custom palette falls back to default and writes that policy.
- Failure: a failed save shows the host error and leaves the previous pin. A failed delete shows the host error and leaves the file. No message uses the panel label. An ignored theme file does not appear as a selectable chip; its reason is available from the palette response.
- Non-goals: editing theme CSS in the picker; deleting a shipped system palette; a disabled "custom palettes are unavailable" row.

## Implementation


Role: consumer. `PanelTheme` calls an injected client and `useReducer`. The picker refetches on open and reads the stored pin. The active row is pressed. `appFile` reports whether that app's `theme.css` parsed. The row stays hidden when it did not. A failed save leaves the previous pin. Ignored files are not chips. No theme client hides the picker. This package does not name a host route. Plan: [implementation.md](../implementation.md).
