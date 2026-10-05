---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# Settings

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel for the form. Host for the file.
- Sections: appearance (theme, palette, card style, locale), network (host port), agent (mini-app model plus writing skill and authoring MCP dests), [MCP servers](mcp.md), [credentials](credentials.md), about (versions and update check). The credentials entry is hidden when Host exposes no credential store. The default workbench is not a section. [Workbench](workbench.md) owns that switch.
- Operations: [readPolicy](../owner-surface.md#readpolicy), [writePolicy](../owner-surface.md#writepolicy), [probeBrain](../owner-surface.md#probebrain), and [restartHost](../owner-surface.md#restarthost).
- Output: a written config, a preview of appearance before save, and an about block. The about block shows the product name and its meaning in the current locale. [Window and event bridge](../shell/window.md) owns that wording. When save requires a host restart, the form shows the restart control. When the restart is because `hostPort` changed, it also tells the user to update the MCP authoring connection under Agent. Unsaved edits ask before close and before restore. Escape closes a confirm first, then the form when clean.
- Failure: an illegal port is rejected in the form and is not written. A save that Host rejects shows the host error and keeps the form dirty. No message uses the panel label. Update check failure shows `error` and leaves the panel usable. When the host exposes no config capability, the settings entry is hidden.
- Non-goals: hot-swapping the live brain; a second language control. MCP servers are not a field of this form. They are [their own section](mcp.md).

## Implementation


Role: consumer. `PanelSettings` calls an injected client and `useReducer`. `admitPanelPort` rejects an illegal port before the write. `panelLanguageFields` writes `locale` and `chatLanguage` together. A dirty form asks before close and before restore. Confirm closes, or copies the saved policy back. Escape cancels that ask first. No config client hides the form. Shell supplies the about text from `aboutVersions`, which reads package versions and does not invent a number. This package does not name a host route. Plan: [implementation.md](../implementation.md).
