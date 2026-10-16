---
status: shape-locked
progress: open
updated: 2026-10-16
---

# Publish

Layer: [Market](README.md). Index: [features.md](../features.md). Install reads these bytes in [install.md](install.md).

- Owner: the publish step. The running app does not publish. The panel does not publish.
- Catalog: `@mohou-apps/catalog` is a `package.json` only. `mohou.apps` is the list. A row has `id`, `name`, `description`, `package`, `version`, and `kind`. Omitted `kind` means `app`. An app row may set `appKind` to `workbench`. Omitted `appKind` means an ordinary app. Optional `tags` uses the app tag rule. A `theme` row may set `themePackId`, which names one entry of `mohou.themePacks`; on an app row it is a catalog error. Row ids are unique across the list, and `themePacks[].id` is unique: installs are flat files with one lock each, so a reused id cannot carry two provenances. The catalog does not carry a checksum and does not carry older versions. Its own `version` changes when a row changes.
- Bundles: `mohou.themePacks` is `[{ id, name, nameZh?, description?, descriptionZh?, author?, official? }]`. No version and no package — a bundle is a heading over rows, not an install target. Publish derives it from `theme.manifest.json` in each pack folder and stamps `themePackId` on that folder's rows from the same file. The manifest is build input: it is not published as part of an install target and Host never reads it. Moving a theme between bundles is a catalog rebuild, not a theme republish. A bundle the catalog declares but no visible row names is dropped from the list. Opening the market reads `GET {updateRegistry}/@mohou-apps%2fcatalog/latest`. It does not download this tarball.
- Author tree: [mini-apps](https://github.com/mungowang/mini-apps) keeps one app at `apps/<appId>/`. The directory name is `manifest.id`. That tree is the edit source. It is not the install channel. A later layout change revises the publish step. It does not change an app already written to `apps/<id>/` on a machine.
- App package: one app is one package `@mohou-apps/<appId>`, not under `@mohou`. npm wraps the publish in `package/`. `package/package.json` carries the package name, the version, `mohou.id`, and `mohou.sum`. It is not copied into the installed app. `package/app/` is a copy of `apps/<appId>/` and is the tree install copies. The copy excludes `storage/`, `logs/`, `theme.json`, `.git`, `node_modules`, `.autogen`, `.ui-build/`, `.market.lock`, and the names npm never publishes: `.gitignore`, `.npmignore`, `.npmrc`, `.DS_Store`. The packument carries the same `mohou.sum`. A later version's sum stays on that version's packument. It is not copied into the catalog.
- When: CI publishes the app whose `manifest.version` changed, then updates that one catalog row to the same version and id. A package that changes id is a new package, not an update of the old row. The author git repo is the edit tree. It is not the install channel.
- Failure: a catalog row whose package is missing, or whose `mohou.sum` is absent from that version's packument, is refused by install. The first catalog publish must leave `mohou` visible on `/latest`. If `mohou.apps` exceeds the packument, the list moves into the catalog tarball. This page does not specify that move.
- Card facts: a row may also carry `requires`, `author`, `downloads`, `official`, and `source`. How each is drawn is [card.md](card.md). `official` does not imply `source`. Omitted `source` means `npm`. `local` is a tarball, and only a local dist reads it. The list is `market-catalog.json` in `~/.mini-app/market`, or `MINI_APP_MARKET_DIR`. The row's `file` is the tarball name. A registry install ignores that file and refuses a `local` row. The path into that source is not a field. This page does not accept uploads.
- Non-goals: a scope listing; a keyword that opts a package into the market; publishing from the panel; a command inventory. The command, when it exists, belongs in [development.md](../../development.md).

## Implementation

Role: producer. The registry is the same `updateRegistry` the shell update uses. npmmirror may not have a new version until the first fetch syncs it.
