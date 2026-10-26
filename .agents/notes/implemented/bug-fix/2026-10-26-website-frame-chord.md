# Agent Note: Website frame forwards the palette chord

Status: implemented

## Problem

Mod+Shift+P opens the palette from the panel and from an app iframe. A website app nests another iframe. Focus in that frame delivers the key to that document only. The runner listener does not see it, and the app cannot add a listener to a cross-origin frame.

## Decision

The window runs a document-start script in every frame. A frame that is not the top window posts the chord to its parent and re-posts a child frame's chord. The panel still accepts that message only from an app iframe on the panel origin. The runner keeps its own forwarder for a window that has not installed the hook. The panel collapses two copies of the same chord that arrive together, so the runner and the hook do not toggle the overlay twice. A repeated key does not fire the chord. The page does not call Tauri.

## Alternatives considered

- A listener on the runner document only. Lost: the key never leaves the nested frame.
- Tauri IPC from the page. Lost: the page has no Tauri IPC, and the palette names that as a non-goal.
- A native menu accelerator that evals into the panel. Lost: WebView2 often consumes Ctrl+Shift+P before the menu, and the page would grow a second open path.
- Installing the listener from the website app. Lost: the frame is cross-origin, so the app cannot reach its document.

## Consequences

The window binary must be rebuilt before a nested website frame forwards the chord. The hook stops the event, so the focused frame does not receive the chord. A panel opened outside this window still depends on the runner forwarder and still misses a nested website frame. The palette decision remains [Command palette](../feature/2026-10-09-command-palette.md).
