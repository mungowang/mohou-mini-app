---
status: shape-locked
progress: settled
updated: 2026-10-10
---

# Themes and palettes

Layer: [Host](README.md). Index: [features.md](../features.md). Value-set order: [style.md](../app-contract/style.md).

- Owner: Host for files and the first-paint variables. Panel for the picker.
- Shipped themes are `theme-<id>.css` files with the same token contract as a custom file. Ids come from those filenames. A user file with the same id replaces the shipped file.
- Custom host themes: `~/.mini-app/themes/theme-<id>.css`, id matching `^[a-z0-9-]+$`. Same contract as app `theme.css`. Creating the directory is allowed. The file is host-global. Apply-scope (every app, or the current app) is a pin, not a second file. A custom file can be deleted; a shipped builtin cannot.
- `GET /api/palettes` returns shipped and custom palettes, each with `origin`, and `ignored` entries with a reason. The picker refetches when it opens, so a file written in this session appears without a Host restart. A user file that replaces a shipped id is `custom`. `DELETE /api/palettes/:id` removes that custom file and its market lock when present. A missing custom id is refused.
- An app `theme.css` is parsed on the runner response and its variables are baked into the first HTML, so the first frame is not the kit default waiting for a later message.
- Failure: a bad file is ignored and reported. It does not brick the picker. A save of an unknown builtin id is rejected.
- Non-goals: a visual theme editor; mini-app-authored `<style>` hex as the theme system; per-app theme files other than `theme.css`.

## Implementation


Role: `createThemePins` and `parseThemeCss`. The custom directory is `homeThemesDir`, beside the runtime root. `__global__` follows the host palette and does not delete `theme.css`. `__local__` uses the app file. Clearing the pin deletes `theme.json` only. A bad custom file is ignored and reported. The session `runnerDocument` bakes that paint into the first HTML. `GET /api/palettes` and `GET /app/:appId` are mounted. Shipped themes are files, not a code list. Plan: [implementation.md](../implementation.md).
