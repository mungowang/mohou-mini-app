# Agent Note: The boot guard denied the Windows splash

Status: implemented

## Problem

On Windows the window opened white and stayed white until the panel replaced it. On macOS the same build showed the splash. The splash assets were embedded, the HTML was complete, and the page had nothing platform-specific in it.

The window's navigation guard was the difference. Before Shell prints the loopback origin, the guard admits the window's own assets and refuses everything else:

```rust
fn boot_navigation(url: &Url) -> bool {
    !matches!(url.scheme(), "http" | "https" | "mailto" | "ftp")
}
```

That reads as "refuse the web, allow the app". It is not what Tauri serves. `WebviewUrl::App` resolves to `tauri://localhost` on macOS and to the wry workaround `http://tauri.localhost` — or `https://` — on Windows. A scheme test therefore admitted the splash on macOS and denied it on Windows, and a denied navigation leaves an empty view: white, with nothing to report it.

The panel was unaffected because by then the guard has a loopback origin to compare against, and every navigation after that goes through `leave_decision`.

## Decision

`boot_navigation` admits the app's own origin by name, on either scheme, and nothing else:

```rust
url.scheme() == "tauri" || matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost")
```

The test that covers it lists both splash URLs, the loopback origin, an unrelated host, and a host that merely ends with the same name — the last one because a suffix test would have admitted `tauri.localhost.example.com`.

The splash page also lost the `both` fill mode on its entry animation. With `both`, an animation that never runs leaves the content at its `from` state — `opacity: 0` — so a rendering hiccup that suppresses the animation also produces a white window, which is the symptom this change is about. Without it, the content's own state is visible and the animation only adds the rise.

## Alternatives considered

- **Admit every http(s) URL during boot.** That is the window opening the web before it has an origin to trust, which is what the guard exists to prevent.
- **Load the splash from a `data:` URL.** Avoids the protocol question by moving the problem: it needs its own allowance, its own escaping, and it loses the asset pipeline that embeds the file.
- **Skip the splash and create the window when the origin is known.** Honest, and worse: a launch shows nothing at all for the seconds the runtime takes, on the platform where that is the slowest.
- **Test the host suffix (`ends_with("tauri.localhost")`).** Admits `tauri.localhost.example.com`. The test above names it.

## Consequences

The splash appears on Windows, and its text updates as the launch moves through the runtime and the platform, which is what `set_splash` was written to do and what could not be seen on that platform before.

The guard is now a two-part rule — the app's own origin before boot, the loopback origin after — and the platform difference between `tauri://` and `http://tauri.localhost` is recorded in one place instead of being implied by a scheme list.
