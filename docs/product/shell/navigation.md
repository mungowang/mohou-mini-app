---
status: locked
progress: settled
updated: 2026-10-21
---

# Embedded navigation

Layer: [Shell](README.md). Index: [features.md](../features.md).

This page owns how a link or a form leaves the app document. Which node it belongs to is [the blueprint](../../blueprint.md). The panel refusal is [Window and event bridge](window.md).

- Owner: Shell.
- The app iframe cannot replace the panel. `appFrameSandbox` has no `allow-top-navigation`.
- What we intercept is **leave intent** (primary click on a foreign link, foreign form submit, `target="_blank"` / new window), not an iframe that **references** a URL as content. A nested iframe may load `http` or `https` in-window (local service or external site). There is still no address bar, back stack, or chrome for that page as a browser.
- A primary click on a foreign `http` or `https` link opens the system browser and does not navigate the app document. `target="_blank"` is left to open outside.
- `javascript:` runs in the app iframe.
- A same-origin URL stays in the app iframe. That includes a relative URL and a `#hash`.
- A form whose action is on another origin does not submit in the app document. The system browser opens the action URL. The form body is not sent.
- `mailto:` opens the system mail handler.
- Any other scheme does not navigate and does not open a window.
- Failure: none. A blocked scheme is not an error. The app document stays.
- Non-goals: a full contained browser (address bar, history stack); downloads of a foreign page as a Host feature; a custom protocol handler inside the panel.

## Implementation


Role: composition. The sandbox on the panel iframe stops top navigation and does not stop nested frames from loading. `leaveGuardSource` is the capture-phase click and submit listeners in the runner document Host serves: primary click on a foreign link or foreign form action opens the system browser and prevents in-document navigation. A modifier click is left to the browser. An app script can remove those listeners. The window handler admits same-window `http`/`https` loads (so website iframes work) and sends new windows and `mailto:` outside. `javascript:` and `about:` stay. Plan: [implementation.md](../implementation.md).
