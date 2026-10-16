---
status: shape-locked
progress: settled
updated: 2026-10-16
---

# Install a theme

Layer: [Market](README.md). Index: [features.md](../features.md). The tab is [tab.md](tab.md). An app install is [install.md](install.md). The file contract is [themes](../host/themes.md).

- Owner: Host. The panel asks Host to install or update one catalog row whose `kind` is `theme`.
- A theme package is an install target at the same level as an app package. It is not a tag and not a workbench. The kind switcher lists it beside `app`. The theme list is not the app grid. App and Workbench filters are absent.
- Color card: publish reads the theme file and writes `colors` on the catalog row, in order: light `primary`, light `background`, dark `primary`, dark `background`. The file does not gain a grouping field. `colors` paints the preview and nothing else. The theme tab has already fetched `@mohou-apps/themes`, so each card paints a dummy from that file's own tokens, light and dark side by side. Each side shows the background, foreground text, a card with a border, muted text, a secondary control, and a primary control pinned to the bottom of that side. The paint is a preview. It does not write `theme.json` and it does not install the file. Install remains the action button.
- Bundle (灵感 / Inspiration): a `themePacks` entry beside `apps` in the catalog. `{ id, name, nameZh?, description?, descriptionZh?, author?, official? }`. It has no version and no package: it is presentation over rows, not an install unit. A `theme` row points at one with `themePackId`. A row with none is ungrouped and the tab shows it under 未分类 / Ungrouped.
- A bundle installs nothing. There is no install-the-collection action, and `mini_app_market_install` cannot name one. Installing one member writes one file; the bundle's own state is read off its members: `0 / N` when none is installed, `k / N` when any has an update, `N / N` otherwise.
- A bundle whose rows are all hidden from this channel is dropped, so the tab never offers an empty one. That is why a `local` row inside a bundle disappears on a registry dist.
- Input: one `theme` row. `id` matches `^[a-z0-9-]+$`. Every theme row names the same package, `@mohou-apps/themes`, and a file `theme-<id>.css` inside it. The theme tab fetches that package once. It does not fetch one package per card.
- Output: `theme-<id>.css` in `~/.mini-app/themes/`. Nothing is written under `apps/`. `storage/` and `theme.json` are not touched. Other theme files stay.
- Check: the file must satisfy the theme contract before it is written. A file that does not is refused. The sum check is the same rule as an app install: Host recomputes it and writes only when it equals `mohou.sum` on that package's packument.
- A file already at that path with no market lock requires confirm before replace. An equal version has no action. A greater catalog version replaces that file. The card and the click are [card.md](card.md). This cut installs themes as well as apps.
- Failure: a missing file, a bad theme file, a sum mismatch, or an id that is not a theme id writes nothing. A `themePackId` that names no bundle, a bundle id reused, a row id reused, or a `themePackId` on an app row is `market-catalog` and the list does not load.
- Non-goals: a plugin type beside `app` and `theme`; a grouping or bundle field written into the theme file; a bundle as a catalog row or as an install unit; a hue bucket beside bundles — the grouping is the bundle, and there is not a second one; bundling a theme means one catalog edit, not a republish of the file; installing a theme by cloning the author repo; listing themes through a keyword. Grouping the palette picker by bundle is a later cut: a palette is found by scanning flat theme files, which cannot know a bundle.

## Implementation

Role: provider. The route is not locked. `GET /api/market` answers `{ rows, packs }`: the rows with their local state, and the bundles that still have a visible row. A theme file, a market lock, and `theme.json` are unchanged by a bundle — nothing about a bundle reaches the disk. A user file that replaces a shipped id remains `custom`, as [themes](../host/themes.md) already says.
