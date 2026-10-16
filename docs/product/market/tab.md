---
status: shape-locked
progress: settled
updated: 2026-10-16
---

# Market tab

Layer: [Market](README.md). Index: [features.md](../features.md).

- Owner: Panel. Host fetches the catalog. This page does not install.
- Input: a store icon in the header, after the desk switcher and before refresh. It is visible on every tab.
- Output: one market tab. The first click opens it. A later click focuses it. Closing it leaves the library tab. The status row stays on the library tab. The tab reads `@mohou-apps/catalog` latest from Host and renders `mohou.apps` as a grid of [cards](card.md).
- Filters: ranked rows with short captions. Kind is primary (应用 / 主题) when the list has more than one kind. Status is next: 所有 / 未安装 / 有更新 / 已安装 (All / Not installed / Updates / Installed). 未安装 means no market lock. 有更新 means a lock whose version is behind the catalog, or local source that differs from the lock. 已安装 means the lock version equals the catalog and source matches. Type follows for apps (全部 / 小程序 / 工作台). For themes that row is the bundle — 灵感 / Inspiration: 全部, then one chip per bundle that has a row in this channel, then 未分类 / Ungrouped for the themes no bundle claims. Bundle names are catalog data (`name`, `nameZh` by panel locale), not dictionary keys. A computed hue bucket is gone: a theme is grouped by the bundle that claims it, or not at all. Tags are tertiary chips under that, only for apps, and only tags present on visible rows. The search field sits on the title row. It matches name, description, and tags. It does not open the command palette. The tab title is 应用市场 / App Market.
- Install and update are [install](install.md) for `app` and [theme](theme.md) for `theme`. Success refreshes the library and does not open the installed app. A bundle is a heading, not a card: it installs nothing, and the action stays on each member row. The header refresh control reads the catalog again while this tab is shown, and spins the same toolbar icon the library and app tabs use until that read settles. A finished install reads the catalog again so the rows, the install status, and the filter counts are the host's answer, not a remembered one. A temporary Installed mark after a click does not survive that read, so a later catalog version can show Update without closing the tab.
- Failure: a failed catalog fetch shows that error in this tab. It does not present an empty library. A failed install stays on this tab and leaves the library as it was.
- Non-goals: an overlay instead of a tab; a public web gallery; favorites, installed, advanced, or tasks as their own pages; the settings control that installs shipped samples.

## Implementation

Role: consumer. The tab does not run npm. It does not download the catalog tarball. The catalog read and the install call are Host operations. Paths are not locked.
