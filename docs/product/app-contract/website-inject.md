---
status: deferred
updated: 2026-10-22
---

# Website content injection

Layer: [App contract](README.md). Index: [features.md](../features.md).

This capability is not in the product now.

A website app may want to restyle or patch the page it embeds — for example, give a themeless internal tool the platform's light/dark palette. A same-origin policy page cannot reach a cross-origin iframe's DOM, so this needs an injection seam at the webview level, not an author API on `ctx`.

## Proposed shape (not decided)

- Declarative injection on the website driver, applied at document start in every frame:

```ts
website: {
  async ensure(ctx) { /* unchanged */ },
  inject: {
    match: '007.teslamotors.com'   // default: the manifest url host. No wildcard.
    cssFile: 'inject/theme.css'    // app-dir file, not an inline string
    jsFile: 'inject/fix.js'       // optional
    runAt: 'document-start'       // default
  },
}
```

- Host compiles the current theme tokens into a `:root { --mohou-… }` block and prefixes the author CSS, so injected styles may use `var(--mohou-…)`.
- Shell (Tauri) registers a user script per rule — macOS `WKUserScript(forMainFrameOnly: false, .atDocumentStart)`, Windows WebView2 per-frame `AddScriptToExecuteOnDocumentCreated`. A shim asks Host (loopback) whether the current origin has a registered injection and applies it. The view session end unregisters.

## Why this is the only viable path

| Path | Verdict |
|---|---|
| Webview user script (browser-extension model) | The only path that reaches a cross-origin frame. Host-process injection, not page script. |
| Reverse proxy rewriting HTML | Rejected non-goal of [Website kind](website.md); breaks SSO cookies, CSP, and TLS for internal sites. |
| Reading the iframe DOM from the panel | Impossible under same-origin policy regardless of API design. |

## Boundary (if built)

- Injected JS runs **as the target page** — it can read its cookies and call its endpoints. Manifest-declared, so an install or update shows it; market rows carrying `inject` need review before listing.
- No read-back channel: the shim does not return page data to the app. Reading data goes through `ctx.http` like any other app.
- Theme switches apply on the **next page load** (no cross-origin postMessage).
- No per-element query API (no DOM-scraping framework).

## Cost

Webview-level change on both platforms (Rust + WKWebView + WebView2) → a new app build (`dist:app:local` / release), not a package hot update.

Proposal: [.agents/notes/proposed/feature/2026-10-22-website-inject.md](../../../.agents/notes/proposed/feature/2026-10-22-website-inject.md).
