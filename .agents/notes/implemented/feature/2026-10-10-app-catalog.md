# Agent Note: App catalog

Status: implemented

The contract is [Market](../../../docs/product/market/README.md). This note keeps the why.

## Problem

An internal market has to list apps and install one of them in China. GitHub is too slow. A scope search, an org package list, and a keyword search either return nothing on npmmirror or let any publisher appear in the list. `manifest.version` cannot say whether the local tree still matches the publish that was installed.

## Decision

[Market tab](../../../docs/product/market/tab.md) is the panel. [Install an app](../../../docs/product/market/install.md) and [Install a theme](../../../docs/product/market/theme.md) are Host. [Publish](../../../docs/product/market/publish.md) is the catalog package and one package per app. `kind` is only the install target. Workbench is a filter inside `app`, then tags filter what remains. Themes share `@mohou-apps/themes`. Local tarballs are only in a local dist. Author tools are `mini_app_market_list` and `mini_app_market_install`.

## Alternatives considered

- Clone or sparse-checkout the git repo. Lost: domestic access to GitHub is the problem this market is avoiding.
- One npm package that contains every app. Lost: npm downloads the whole tarball. Installing one app would fetch the rest.
- List `@mohou/*` or search a keyword, as Pi does with `pi-package`. Lost: npmmirror search returned nothing. The official org list mixes platform packages with other packages and 404s on the mirror. A keyword lets any publisher enter the list.
- Put the publisher's git commit id in the package. Lost: that commit is not in the user's app repo, so it cannot show a local edit.
- Put every historical sum in the catalog. Lost: the list grows without a bound and is fetched every time the market opens.
- One feature page for the tab, the install, and the publish. Lost: three callers would edit one page.

## Consequences

Opening the market tab is one GET of `@mohou-apps/catalog/latest`. Install checks `mohou.sum` on that package's packument and leaves `storage/` in place. A tarball whose `manifest.id` differs from the catalog is refused before write. A local edit without confirm is `market-confirm`. npmmirror may not have a new catalog version until the first fetch syncs it. The first catalog publish has to show that `mohou` survives in `/latest`.
