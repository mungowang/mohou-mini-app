# Agent Note: Website app kind

Status: implemented

## Problem

Wrap tool sites and local CLIs (`pi-web --no-open`, etc.) as installable mini-apps so non-technical owners do not start servers by hand. Need session lifecycle, process ownership, and a path for later content hooks without a second render pipeline.

## Decision

- `manifest.kind: "website"` plus required `url` (http/https). Still `entry: ui.tsx`.
- `defineApp({ website: { ensure, refresh?, dispose?, content? } })`. Host calls Driver; not `api`.
- Host holds one SiteSession per app id: open tab → ensure; toolbar reload → refresh (keep spawn); close tab → dispose + kill registered spawn.
- `ctx.spawn` only on website hooks; handles register on the session.
- UI: `useWebsite()` + default `WebsiteFrame`. Content plane hooks (path C): `content.onLoad` / `onLoadFailed` / `onDocumentIdle`.
- Market install target stays `app`; catalog may use `appKind: "website"` later like workbench.

## Alternatives considered

- Host-only shell without `ui.tsx`. Rejected: breaks compile/iframe/`useApp` and blocks chrome around the frame.
- `useApp().website` bag. Rejected: duplicate of Frame/`useWebsite`.
- Closed-recipe inject / reverse proxy in V1. Deferred; session first; content hooks reserved for path C.

## Consequences

- Panel must call `closeWebsite` on tab close or processes leak.
- Author `ctx.bash('… &')` is not session-scoped; skill must prefer `ctx.spawn`.
- Cross-origin content only reliably gets `onLoad`, not true document-idle DOM access, until a later proxy/inject surface.
- Coverage stays on `packages/host/src/website/**` (no gate exclude). Unit + author + HTTP + live `pi-web` smoke cover the surface.
