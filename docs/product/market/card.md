---
status: shape-locked
progress: settled
updated: 2026-10-11
---

# Market card

Layer: [Market](README.md). Index: [features.md](../features.md). The tab is [tab.md](tab.md).

- Owner: Panel. One catalog row is one card. A new fact uses an existing region. It does not add a control outside the card, and it is not drawn as another chip.
- Regions, top to bottom: title, byline, body, topics, meta. The card is a column. Meta is pinned to the bottom edge, so a short description does not lift the version line. The action sits on the title row, at the end. A notice, when present, sits on that same row, immediately before the action. An empty region is omitted. Regions do not trade places.
- Title: the name, then the source icon, and the action at the end. The source icon sits immediately to the right of the name. It is not in the footer. No monogram on an app card. A theme card opens with the color card, the ordered `colors`, primary first. It is not an app card with a swatch added. Under the name, id and author share one muted row at the same rank: a hash icon then the id, a user icon then the author. Official sits on that author as a small M mark and the word 官方 / Official. It is not a second footer fact. When there is no author, official still sits on that row alone. `appKind: workbench` is a line under that row: the word Workbench. The zh-CN word is 工作台. It is not an icon cluster in the title.
- Byline: folded into the id/author row under the title. It does not name how the package entered the catalog.
- Body: the description.
- Topics: the tags as words under the description, with a small tag icon and middots between words. No chip fill, and not on the meta line.
- Meta: a footer pinned to the bottom edge. Version is `v` plus the version, as text. Requirement is a tag, not brackets and not a second version. The tag reads `mohou ≥ x.y.z`. It disables the action when the running product is outside that range. Official is not repeated here. Source is not repeated here. Sources are `npm` and `local`. `local` is a tarball. Each source has its own icon beside the name. Official does not imply `npm`. A later source, such as a cloud disk or GitHub, is another icon. It is not a second official. Downloads sit at the end, with a download icon. A missing optional fact is omitted.
- Notice: `modified` when the local sum differs from the lock. The zh-CN label is 更新后会覆盖本地改动. `untracked` when the local id has a directory and no market lock. The notice says the app is already on this machine and that replace overwrites source while records stay. When the local manifest has a version, the notice also names that version. Confirm before that write remains on the action.
- Action: install, update, replace, or none. Install is a clean first install and carries a download icon. Replace is the action when the id is already on this machine without a market lock. None means a market lock version equals the catalog version. Update means the lock version is less than the catalog. A local sum that differs from the lock does not change the action. A directory without a lock is never none.
- Click: a clean install or update starts on the first click. The button reads 安装中, then 已安装. `modified` or `untracked` does not start the write on the first click. That click replaces the action with 取消 and 确认. Cancel restores the previous action. Confirm starts the same 安装中 state. The confirm stays on the card. It does not open another layer. Installed does not accept a click. A failed write restores the previous action and leaves the library unchanged. App and theme use this same click.
- `official` and `source` are separate fields. Omitted `source` means `npm`. This page does not accept an upload, and it does not show the path by which a package reached that source.
- Non-goals: a chip for every fact; a star; a comment thread; a second action.

## Implementation

Role: consumer. The card reads one catalog row. It does not fetch a second document per card.
