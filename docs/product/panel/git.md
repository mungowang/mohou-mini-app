---
status: shape-locked
progress: settled
updated: 2026-10-14
---

# Git UI

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel. History data comes from Host HTTP.
- Operations: [readHistory](../owner-surface.md#readhistory) and [readCommit](../owner-surface.md#readcommit).
- Output: a list of commits (id, message, time) and a detail with per-file add/del counts and a text preview.
- Failure: no history capability hides the control. A failed load shows the host error in the browse pane. No message uses the panel label. An empty history shows the empty state.
- Non-goals: reset or commit from the panel. Reset is an authoring tool. There is no revert tool. The panel does not pretend a preview is a full diff viewer of every line when the payload is a preview.

## Implementation


Role: consumer. `PanelHistory` calls an injected client and `useReducer`. The surface passes `focus` (or the injected id when nothing is focused) and remounts when that id changes. Gallery tab switches update focus via `select-app`. The list shows each commit's id, message, and time. A close control on the pane hides it; the toolbar control still toggles it. No history client hides the control. Reset stays an authoring tool. This package does not name a host route. Plan: [implementation.md](../implementation.md).
