# Agent Note: Open-tab switch chord and palette rail

Status: implemented

## Problem

Switching open panel tabs required a pointer on the tab strip. The command palette could open any app, but it did not surface the already-open set as a first-class left/right target while the search field stayed focused.

## Decision

Mod+Shift+ArrowLeft and Mod+Shift+ArrowRight cycle open panel tabs when the palette is closed — same Mod as Mod+Shift+P (Command or Ctrl; Alt does not). While the palette is open, plain ArrowLeft and ArrowRight move a numbered open-tabs rail under the search field; Mod is not required. The search field stays first focus. Enter opens the rail focus after a rail move, and the list row after a list move or a query change. App iframes and nested website frames forward the palette chord and the closed-panel tab-switch chord through the existing `mma-chord` path.

## Alternatives considered

- Ctrl-only tab chord (no Meta). Lost: macOS users expect the same Command modifier as the palette chord.
- Alt+Shift on Windows. Lost: the palette already uses Ctrl+Shift; a second modifier set splits muscle memory.
- Replace the search row with tabs. Lost: search must stay first focus and the primary filter.
- Live-switch the real tab while the palette is open. Lost: the palette is for locating, then opening; a preview switch fights an abandoned Esc.
- Require Mod+Shift while the palette is open too. Lost: the overlay already owns the keyboard; plain arrows are enough.

## Consequences

`bindPaletteChord` remains as a thin wrapper; new call sites use `bindPanelChords`. The frame hook and runner forward source must stay aligned with `matchPanelChord`. A single open tab is a no-op for the global cycle. Nested website frames only see the native frame hook (window binary) — a package hot update does not refresh that script; website tab-switch needs a new app install. Match logic is one file, `packages/panel/src/palette/chord-wire.js`: the panel imports it, Host leave embeds it into the runner forward source, and the launcher prepends it into the every-frame hook. Forwarders do not keep a second key list. The matcher uses both `key` and `code` because some engines omit `key` when Meta is held, and normalizes arrows to `ArrowLeft`/`ArrowRight` on the wire.
