# Agent Note: Tauri native drag-drop blocks HTML5 FileDropzone

Status: implemented

## Problem

`FileDropzone` (react-dropzone / HTML5 DnD) worked in a browser panel but not inside Mohou. Click-to-pick still worked.

## Decision

Tauri/wry enables a native OS file-drop handler by default (`drag_drop_enabled`). It intercepts Finder/Explorer drops before `dataTransfer.files` reaches the page. `WebviewWindowBuilder::disable_drag_drop_handler()` turns that off so HTML5 drop works. We do not use Tauri path-based drag-drop events.

## Consequences

Desktop file drop matches the web path. Rebuild the window binary (`pnpm build:window` / app bundle) for the change to ship; a panel-only npm bump is not enough.
