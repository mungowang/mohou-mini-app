# Agent Note: Theme pack bundle

Status: implemented

Extends [Install a theme](../../../docs/product/market/theme.md). Supersedes the tone grouping of [The app market ships themes](2026-10-05-the-mcp-page-offers-our-own-servers.md)'s market line — the hue bucket is gone.

## Problem

The market grouped themes by **tone**: one bucket computed from the row's first `colors` value (`market/tone.ts` → `dark / red / warm / green / blue / neutral`). That answers "what hue is the primary", not "what is this set for". A spring palette with a cool accent lands in `blue`, and a person browsing for 情人节 or 秋天 finds nothing, because the product had no word for a curated set.

A curated set has to be publishable by whoever makes the themes, not only by bumping a constant in this repository. And an **un-updated** Mohou has to keep working: same flat theme list it reads today, simply no grouping.

## Decision

A theme pack is a **catalog heading over theme rows**. It changes no install unit, no on-disk theme layout, no version rule, and no palette or pin mechanism.

`mohou.themePacks` sits beside `mohou.apps`: `{ id, name, nameZh?, description?, descriptionZh?, author?, official? }`. It has no version and no package, and it is not a `kind`. A `theme` row names one with `themePackId`; a row without it is ungrouped and shows under 未分类 / Ungrouped.

`resolveCatalog` is total about it. A `themePackId` that names no bundle, a `themePackId` on an app row, a reused `themePackId` shape, a reused bundle id, and a reused **row** id are all `market-catalog`. The row-id rule is new in the same breath and is load-bearing: installs are flat files with one lock each, so a reused id cannot carry two provenances.

`listMarket` answers `{ rows, packs }`, and `packs` holds only the bundles with a row **in this channel** — a bundle of `local` rows disappears on a registry dist. `GET /api/market` carries that shape, `mini_app_market_list` answers `{ apps, themePacks }`, and `MarketView` puts bundles in the row that held tone. Pack names are catalog data drawn like `PaletteChip` (`nameZh` first for a Chinese panel), so they stay out of the label dictionary.

`tone.ts`, `CatalogRow.tone`-era grouping, `MarketListRow.tone`, and `market-tone-*` labels are deleted. `colors` stays — it paints the card preview and has nothing to do with grouping.

Publish is outside this repository: the pack folder holds `theme.manifest.json`, and the catalog build reads it to emit one `themePacks` entry and stamp `themePackId` on that folder's rows. **The manifest is build input.** It is never part of an install target and Host never reads it.

## Alternatives considered

- **A `pack` object repeated on every member row.** Compatible and it needs no route change, so it is the smaller diff. It lost on two counts: six descriptive fields duplicated per member, and re-bundling a theme means rewriting every member row instead of rebuilding one catalog. Its precedent — `colors` is publish-derived too — is weaker than it looks: `colors` is per-file data, a bundle descriptor is per-collection.
- **`kind: 'theme-pack'` as a catalog row.** Rejected on evidence. `resolveRow` requires `package` and `version` before it checks `kind`, and `resolveCatalog` throws on any kind outside `app | theme`, so one pack row fails the **whole list**. An un-updated Mohou would not have lost the grouping; it would have lost the market tab — the exact property this design exists to keep. A pack also has no package and no version by definition, so it cannot satisfy the row contract without making required fields depend on kind, and living in the row list makes it addressable by `mini_app_market_install`, which it must never be.
- **`mohou.packs[]` keyed by npm `package`.** Rejected: the official themes are one package holding several collections, so keying by package collapses 春 and 秋天 into one group. Membership is never inferred from `package`.
- **A `kind` field on pack entries, to allow app packs later.** Rejected as speculative: a one-value discriminator has no branch to guard but does need its unused values refused, and it pulls toward the row-shaped mistake declined above. Extension stays open — `mohou.appPacks` plus `appPackId` is a later additive sibling, and an old host ignores an unknown sibling exactly as it ignores `themePacks`. Naming the list `themePacks` is also what makes `themePackId` need no kind check.
- **`packs` / `packId` without the `theme` prefix.** Shorter, but it leaves an app row's `packId` pointing into a theme list. The prefixed pair keeps the reference total by construction.
- **Provenance in the theme file (`/* pack: spring */`) or in the market lock.** Both rejected, and the lock case is the instructive one. The lock already writes `package` — an earlier draft of this design read it to answer "which bundle installed this file". With a pack not an install unit, no such question exists, so the field is unused and the lock was left alone. A file's own content could not answer it either: membership is needed to **draw** the card before anything is installed, and re-bundling would mean republishing every file.
- **Grouping the palette picker by bundle too.** Not done. `readThemeDir` finds palettes by scanning flat `theme-*.css` and cannot know a bundle; grouping there puts market data into the runtime theme layout, which is the boundary this note keeps out. One surface at a time.
- **Moving the shipped `packages/host/themes/` files into pack folders.** Not done, and it would have been a bug: that directory is the builtin **palette** set for the picker, not a market channel, and a subfolder there is invisible to `readThemeDir`.
- **Host-shipped constant list plus a new read route.** The first draft here. Rejected: two authorities for one fact, a version bump per new collection, and third parties could not publish.

## Consequences

An un-updated Mohou reads the new catalog unchanged — it ignores `themePacks` and `themePackId` because `resolveCatalog` and `resolveRow` only ever read the keys they declare. A spec admits a catalog carrying keys the resolver does not know, which is the same property the old resolver had.

Bundles are invisible until a catalog declares them. This repository ships the reader and the UI; `@mohou-apps/catalog` and the theme package stay outside it, so the market shows 未分类 only until that catalog is rebuilt with `themePacks` and stamped rows. The theme repo must also keep theme ids unique across packs, or the new duplicate-row-id rule fails the list at build.

The market's row response shape changed (`{ rows, packs }`), so Host and Panel ship together. The Shell client still reads the bare array a Host from before this change answered, so a mixed prefix lists every theme with no bundles rather than failing the tab.

A bundle is deliberately inert: no install, no uninstall, no version, no lock, no file. Its state is read off its members each time the catalog is read, so it can never disagree with them. `mini_app_market_install` still names only rows, and `search` can empty a bundle's visible rows without dropping the chip — the chip list is the bundle set with rows **before** search.
