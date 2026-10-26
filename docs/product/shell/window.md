---
status: shape-locked
progress: settled
updated: 2026-10-26
---

# Window and event bridge

Layer: [Shell](README.md). Index: [features.md](../features.md).

- Owner: Shell.
- Input: the host event stream, and the iframe Shell mounted.
- Output: one Tauri window whose contents are the panel at the loopback origin. The window title is the product name for the current panel locale: `Mohou` in English, `墨猴` in Chinese. The packaged app is named Mohou, which is the name macOS shows in the Dock. The build binary stays `mini-app-window`. Dock and close-panel are off. The page has no Tauri IPC. Closing the window from `pnpm dev:host` disposes Host. Shell applies `app:open` by telling the panel to show that app. Shell applies `app:reload` by telling the frame to refetch. Shell applies `app:eval` by posting the query to the iframe with the host origin as target. Shell applies `app:changed` by telling the panel to refetch the builtin library. Shell posts theme variables the same way, and that theme message is the first message, so the iframe learns the parent origin before any query.
- The settings about block names the product and states what it does: the platform provides creation tools and a guiding skill; the user brings the idea; the AI agent the user already uses builds the mini-app; the platform manages and runs it. The block shows this in the current locale.
- The iframe accepts view queries only from `window.parent` and only from that first origin.
- Failure: no frame for a query makes Host record `not-open` as soon as Shell says so. A panel that cannot reach Host shows the unreachable state from [§6.1](../panel/list.md).
- Non-goals: Shell reading the iframe DOM; Shell compiling apps; Shell serving a second copy of the authoring tools. The app iframe cannot replace the panel. The contained view is [Embedded navigation](navigation.md).

## Implementation


Role: composition. The opened window is `mini-app-window`. It loads the loopback origin and nothing else. A document-start script runs in every frame, including a nested website frame, and forwards panel chrome chords (palette and open-tab switch). [Command palette](../panel/palette.md) owns those chords. The page still has no Tauri IPC. The panel document calls Host over HTTP. It subscribes to the host event stream and to each open app's author stream. `app:open` shows that app. `app:reload` and `app:eval` are posted to the iframe whose title is that app id; an `app:eval` no iframe carries is reported to Host as `absent`, so its caller learns the view is not open now. Author events are posted the same way, so `ctx.push` reaches `useApp().on`. `app:changed` tells the panel to refetch the builtin library. The app iframe carries `appFrameSandbox`. `createFrameBridge`, `watchHost`, and `ownerClients` remain for an in-process caller. The opened window does not use them. Shell does not read the iframe DOM and does not compile. Plan: [implementation.md](../implementation.md).
