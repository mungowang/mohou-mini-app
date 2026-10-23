# Agent Note: The market card acts on an installed row

Status: implemented

## Problem

An installed market row was a dead end: a disabled 已安装 button that looked like an action but accepted no click. Getting the app on screen meant leaving the market for the library; applying a theme meant Settings; removing a bad install meant the author tool `mini_app_market_uninstall`, which the panel does not expose. The card's own non-goal said "a second action", so every one of these needed a second surface.

## Decision

Installed is a status, not an action. The disabled button becomes a check-mark chip (已安装, or 可更新 v → v beside the Update button), and the row's installed state carries three one-click controls: 打开 for an app (the library's open path, a new tab), 应用 for a theme (the same host-palette write the Settings appearance card makes), and 卸载 for both — an icon-only action, danger color on hover, with the same 取消 / 确认卸载 two-step confirm install already uses, because the host's `market-confirm` semantics are the same shape. Untracked rows offer none of it: no lock means not installed.

Uninstall was host-only (`mini_app_market_uninstall`). It now has a panel route too: `POST /api/market/uninstall`, a `market:uninstall` host notice beside `market:install`, and the same library/palette refresh on the shell bridge. An uninstalled app keeps the existing trash path — `app:changed` deleted — so an open tab of a removed app closes on its own.

## Alternatives considered

- One uninstall click with no confirm. Lost: the host already requires confirm for untracked or modified trees, and a first click that moves an app to trash is not recoverable from the card.
- Open / Apply / Uninstall as separate pages or panels. Lost: the card's rule is one fact one card region; the controls are that row's own state, not a second surface.
- A second market event for the library refresh only. Lost: reusing `app:changed` works for apps but themes publish nothing, so the palette picker would go stale.

## Consequences

The card non-goal "a second action" is now "a second install action": one card still has one install action; open, apply, and uninstall are states of an installed row. `apply` needs a settings client, so the surface owns the policy write and the gallery passes it down; the market view itself stays policy-free.
