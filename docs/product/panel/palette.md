---
status: shape-locked
progress: settled
updated: 2026-10-09
---

# Command palette

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel for the chord and the overlay. Host for the derived spelling on the list row.
- Input: Mod+Shift+P from any panel surface, including an app iframe. Mod is Command on macOS and Ctrl on Windows. The other of those two modifiers also opens it. Alt does not. Focusing the library search field opens the same overlay. That field does not filter the grid.
- Output: a full-window mask and a command field. An empty query lists the library row, then open apps, then the rest. A query ranks by field, then by match quality. The fields, in order, are the name, the acronym, the last segment of the id, the full id, the tags, the description, and the version. A name's pinyin and initials rank with the name. A description's pinyin and initials rank with the description. Quality is exact, then prefix, then contains, then a skipped-letter match. The same quality lists an open app first, then by name. The library row uses its titles only. Its hint does not match. A version matches only when the query contains a dot and digits. Enter or a click opens that app through [open](../owner-surface.md#open), or switches to the library tab. The current app closes the overlay and does not open again. The placeholder on the library field names the platform chord.
- Spelling: `GET /api/apps` and `GET /api/trash` add `spelling` when the row has Chinese. `spelling` has `name`, `description`, and `tags`, each `{ full, initials }` when that field has Chinese. `full` is pinyin without tones. `initials` is the first letter of each syllable. A polyphonic character keeps its readings. A Latin-only field is omitted. A Latin-only row omits `spelling`. The spelling is derived when the list is built. It is not a file, and it is not a field of [list](../owner-surface.md#list).
- Failure: an unreachable host or a failed list still opens the overlay and shows that error. There is no row to run. A query with no match shows an empty row. The chord does not reach the focused app.
- Non-goals: an app registering a command; `fuzzysort` on the app import allowlist; a shortcut while this window is not focused; Tauri IPC; scanning an app's files.

## Implementation

Role: consumer. `bindPaletteChord` listens on the panel document. The app runner forwards the same chord to the parent, because a listener the parent adds on the iframe window does not see the key. `rankApps` scores with `fuzzysort`. Host `spellFields` uses `pinyin-pro` and does not ship that dictionary to the panel. The library field is read-only and opens the overlay on focus.
