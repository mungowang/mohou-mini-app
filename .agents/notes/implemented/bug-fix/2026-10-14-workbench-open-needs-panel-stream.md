# Agent Note: Workbench open needs a live panel stream

Status: implemented

## Problem

Clicks on Daily Work's app rail called `ctx.workbench.openApp` → `app:open`, but no tab opened. Host sometimes answered `panel: "no-panel-connected"`. A second agent was also flooding `app:reload` / `app:changed` on `data-cask`; the desk `onHostEvents` re-pushed every notice, thrashing the rail and the shared `/api/events` stream.

## Decision

1. Shell keeps one reconnecting EventSource and **queues** control commands (`app:open` and friends) until `onControls` lands, so early events are not dropped on `controls?.`.
2. Panel **debounces** `app:changed` library refetches (200ms).
3. Workbench / desk `onHostEvents` only pushes **library-shaped** notices (`app:changed`, `app:rename`, `market:install`), not every `app:reload` / `app:open`.

## Consequences

Open still depends on the panel stream being subscribed. A dead stream still cannot open tabs; reconnect recovers it. Authors must not bridge the full host-notice firehose into `ctx.push`.
