# Agent Note: Toolbar refresh spins on library, app, and market

Status: implemented

## Problem

The chrome refresh control spun while an app reload or library refetch ran. On the market tab it only bumped a tick, so the icon sat still and the only motion was a small title spinner. Fast library refetches were easy to miss for the same reason unless the minimum spin window was noticed.

## Decision

Library and app keep `withRefreshSpin` (400ms floor). Market refresh starts that same spin, bumps the tick, and ends the spin when `MarketView` reports `onCatalogSettled`. The control is disabled while spinning. Mount and install-driven reads also settle the callback; with no pending chrome spin that is a no-op.

## Consequences

One toolbar icon means “work in flight” on every tab. The market title spinner can still show during install-driven reloads.
