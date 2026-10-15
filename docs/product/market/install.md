---
status: shape-locked
progress: settled
updated: 2026-10-14
---

# Install an app

Layer: [Market](README.md). Index: [features.md](../features.md). The tab is [tab.md](tab.md). The published bytes are [publish.md](publish.md).

- Owner: Host. The panel asks Host to install or update one catalog row. The panel does not run npm.
- Input: one `app` row. `kind` omitted means `app`. A `theme` row is not installed by this page.
- Output: the tarball's `package/app/` copied to `apps/<id>/`, and `apps/<id>/.market.lock`. The lock records `id`, `package`, `version`, and `sum`. `installedAt` is display only. The lock is not in the npm package and is not in the app's git history. `package/package.json` is not copied.
- Check: Host downloads the app tarball named by the row, recomputes the source sum, and writes only when that sum equals `mohou.sum` on that package's packument. It does not compare the sum to the catalog. The tarball `manifest.id` must equal the lock id when a lock exists, and must equal the catalog row id. A different id is refused. It is not a rename.
- Update: the catalog version is greater than the lock version under semver. An equal version has no action. A recomputed sum that differs from the lock means local source changed. The write still proceeds after confirm. A missing lock means the directory was not installed from the market. Host does not match the tree to an older publish.
- Files: replace source, including `theme.css` and a shipped `package.json` and lockfile. Delete source files the package no longer ships. Keep `storage/`, `logs/`, `theme.json`, and `.git`. Commit a dirty tree first, then commit `Update <id> to <version>`. Remove `.autogen`. Reinstall dependencies only when the lockfile changed. Package scripts do not run.
- Schema: an applied `schema/` file whose checksum would change, or whose file would disappear, is refused before any write. A new numbered file is source and is applied on the next open.
- Failure: a sum mismatch, an id mismatch, a schema refusal, a missing tarball, or a failed dependency install writes nothing and leaves the previous tree. A failed dependency install restores the previous app `package.json` and lockfile, as [install dependencies](../host/install.md) already does. A replace without confirm is `market-confirm` and writes nothing. The message says records stay. Keeping the edits means backing up this app's history first and replaying them after the update, or renaming this app, installing the official id, and merging one into the other.
- Uninstall: author tool `mini_app_market_uninstall`. An app moves to trash the same way panel delete does; `storage/` stays with the trash copy. A theme deletes `theme-<id>.css` and its market lock. `confirm` defaults to false. Local source changes, or a tree/file without a market lock, need `confirm: true`. A missing install is `market-catalog`.
- Non-goals: installing every app in the catalog; cloning the author repo; putting the publisher's git history in the user's app. A `theme` row is [install a theme](theme.md).

## Implementation

Role: provider. The sum is sha256 over the source tree that will be copied, paths sorted, path plus bytes. It excludes `storage/`, `logs/`, `theme.json`, `.git`, `node_modules`, `.autogen`, and the lock file. The route the panel calls is not locked.
