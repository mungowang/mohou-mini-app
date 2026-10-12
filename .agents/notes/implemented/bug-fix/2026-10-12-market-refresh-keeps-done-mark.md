# Agent Note: Market refresh kept the post-install Installed mark

Status: implemented

## Problem

After installing a market app, the card pinned `done` so the button read Installed. A later catalog version (or chrome refresh) re-read the host list, but `done` still forced Installed. Closing the market tab and opening it again cleared the pin, so the update appeared only then.

## Decision

A catalog read that lands clears `done`. The host row owns the button. `done` is only the optimistic mark while that read is still in flight after an install click. Concurrent reads use a generation so an older response cannot overwrite a newer one.

## Consequences

Refresh on the open market tab can show Update after the catalog moves ahead of the lock. The install test still sees Installed when the post-install read returns an equal lock.
