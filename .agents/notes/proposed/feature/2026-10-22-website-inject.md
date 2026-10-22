# Agent Note: Website content injection

Status: proposed

## Problem

Website apps embed cross-origin pages that do not follow the platform theme. Authors asked to restyle them (e.g. give a themeless internal tool the light/dark palette). Same-origin policy makes any page-level API useless: the panel cannot touch a cross-origin iframe's DOM.

## Decision (proposed; not shipped)

Defer to a dedicated `inject` seam on the website driver, applied at the webview level:

- Declarative (`match` + `cssFile`/`jsFile`), applied at document start in every frame via WKUserScript / WebView2 per-frame scripts. A shim asks Host (loopback) for registered injections.
- Host compiles current theme tokens into a `:root` prefix so injected CSS may use `var(--mohou-…)`.
- Reverse proxy stays a rejected non-goal ([website.md](../../../docs/product/app-contract/website.md)).

Security boundary: injected JS runs as the target page (its cookies, its endpoints); manifest-declared so install/update surfaces it; no read-back channel — page data still goes through `ctx.http`.

Deferred page: [website-inject.md](../../../docs/product/app-contract/website-inject.md).

## Alternatives considered

- Command-line injection from content hooks. Rejected: `onLoad` fires far too late; document start needs declaration.
- Reverse proxy. Rejected (SSO/CSP/TLS; already a non-goal).
- Do nothing / use the target's API when it has one. Preferred when an API exists — the 007 secret-message app is built on its documented API instead of embedding and injecting.

## Consequences if built

- Webview change on both platforms: a new app build, not a package hot update.
- Market rows carrying `inject` need review before listing.
