# Agent Note: Command palette

Status: implemented

## Problem

Switching apps meant leaving the current iframe and using the library. A key listener on the panel document misses Command+Shift+P and Ctrl+Shift+P while focus is inside an app iframe.

## Decision

The panel owns one chord and one overlay. The panel document captures the chord. The app runner forwards it from the iframe, because a parent listener on that window does not see the key. The host derives pinyin when it builds the list row, with `pinyin-pro`, including other readings, and keeps each field's spelling apart. The panel ranks the name first, including that name's pinyin. A description hit does not outrank a name hit. The library search field opens the overlay and no longer filters the grid.

## Alternatives considered

- A listener only on the panel document. Lost: the shortcut does nothing while an app is focused.
- Generate pinyin in the panel. Lost: the dictionary is about 145 KB gzip in the window bundle.
- Edit-distance search. Lost: a short query matches too much.

## Consequences

`fuzzysort` is not on the app import allowlist. An app cannot import it yet. A substitution typo such as one wrong Chinese character does not match. The spelling is not stored in a file. The next list rebuilds it.
