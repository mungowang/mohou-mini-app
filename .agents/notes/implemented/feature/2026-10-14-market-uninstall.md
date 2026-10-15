# Agent Note: Market uninstall

Status: implemented

## Problem

The market could install an app or theme but had no author tool to remove a market-tracked install. Panel delete only covers apps, not themes, and agents had no MCP path.

## Decision

`mini_app_market_uninstall({ appId, kind, confirm? })`. Apps go through the same trash path as panel delete (storage stays in trash). Themes delete `theme-<id>.css` and the market lock. `confirm` defaults to false; local edits or an untracked tree need `confirm: true`. A missing install is `market-catalog`. After success, publish `market:install` so the panel refreshes library/palette rows; app trash already publishes `app:changed` deleted.

## Consequences

Catalog may drop a row while a local install remains — uninstall still works by id/kind. Untracked apps are not silently trashed.
