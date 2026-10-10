---
status: shape-locked
progress: settled
updated: 2026-10-10
---

# Install a theme

Layer: [Market](README.md). Index: [features.md](../features.md). The tab is [tab.md](tab.md). An app install is [install.md](install.md). The file contract is [themes](../host/themes.md).

- Owner: Host. The panel asks Host to install or update one catalog row whose `kind` is `theme`.
- A theme package is an install target at the same level as an app package. It is not a tag and not a workbench. The kind switcher lists it beside `app`. The theme list is not the app grid. App and Workbench filters are absent.
- Color card: publish reads the theme file and writes `colors` on the catalog row, in order: light `primary`, light `background`, dark `primary`, dark `background`. The file does not gain a tone field. The grouping uses that list. The preview does not. The theme tab has already fetched `@mohou-apps/themes`, so each card paints a dummy from that file's own tokens, light and dark side by side. Each side shows the background, foreground text, a card with a border, muted text, a secondary control, and a primary control pinned to the bottom of that side. The paint is a preview. It does not write `theme.json` and it does not install the file. Install remains the action button.
- Group: one group, computed from the first color. It is not stored in the theme file and not a tag. The theme tab's second row is those groups. A group with no row is omitted. The hue and lightness bounds are host policy.
- Input: one `theme` row. `id` matches `^[a-z0-9-]+$`. Every theme row names the same package, `@mohou-apps/themes`, and a file `theme-<id>.css` inside it. The theme tab fetches that package once. It does not fetch one package per card.
- Output: `theme-<id>.css` in `~/.mini-app/themes/`. Nothing is written under `apps/`. `storage/` and `theme.json` are not touched. Other theme files stay.
- Check: the file must satisfy the theme contract before it is written. A file that does not is refused. The sum check is the same rule as an app install: Host recomputes it and writes only when it equals `mohou.sum` on that package's packument.
- A file already at that path with no market lock requires confirm before replace. An equal version has no action. A greater catalog version replaces that file. The card and the click are [card.md](card.md). This cut installs themes as well as apps.
- Failure: a missing file, a bad theme file, a sum mismatch, or an id that is not a theme id writes nothing.
- Non-goals: a plugin type beside `app` and `theme`; a tone comment in the theme file; installing a theme by cloning the author repo; listing themes through a keyword.

## Implementation

Role: provider. The route is not locked. A user file that replaces a shipped id remains `custom`, as [themes](../host/themes.md) already says.
