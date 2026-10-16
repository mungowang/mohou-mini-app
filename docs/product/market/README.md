---
status: index
updated: 2026-10-16
---

# Market

Index: [features.md](../features.md). Why: [.agents/notes/proposed/feature/2026-10-10-app-catalog.md](../../../.agents/notes/proposed/feature/2026-10-10-app-catalog.md).

The market installs a published item into this machine. It does not clone a git repo. It does not list an npm scope or a keyword.

- [Market tab](tab.md) — the store icon, the tab, and the filters.
- [Market card](card.md) — the regions on one install card, and the facts those regions can grow.
- [Install an app](install.md) — Host copies one app tarball and leaves records in place.
- [Publish](publish.md) — the catalog package and one package per item.
- [Install a theme](theme.md) — a theme package, the same level as an app.

`kind` is the install target. `app` is [install.md](install.md). `theme` is [theme.md](theme.md).

A **bundle** (灵感 / Inspiration) is not a `kind` and not an install target. It is a catalog heading over theme rows: `mohou.themePacks`, named by a theme row's `themePackId`. It has no version, it installs nothing, and nothing about it reaches the disk. [theme.md](theme.md) owns it.

The interactive draft is [design.html](design.html). It shows the tab, the card, the theme preview, and the click. The feature pages own the contract. When the draft and a page disagree, the page wins.
