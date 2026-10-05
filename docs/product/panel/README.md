---
status: index
updated: 2026-10-03
---

# Panel

Index: [features.md](../features.md).

Panel is a client of Host over HTTP. It never constructs Host and never imports Host. The operation contract is [owner-surface.md](../owner-surface.md). Paths are not locked.

The shipped Shell window is standalone: the panel is the window, so close-panel is hidden. The control still exists for a window that embeds the panel beside other UI. That embedder is out of scope; the control is specified so the panel component is complete. The panel has no dock mode.

- [List and open](list.md)
- [Workbench](workbench.md)
- [Close panel](dock.md)
- [Responsive layout](responsive.md)
- [Page find](find.md)
- [Settings](settings.md)
- [MCP servers](mcp.md)
- [Credentials](credentials.md)
- [Theme](theme.md)
- [Git UI](git.md)
- [Storage browse](storage.md)
- [Reload and delete](reload.md)
- [Panel chrome language](language.md)
