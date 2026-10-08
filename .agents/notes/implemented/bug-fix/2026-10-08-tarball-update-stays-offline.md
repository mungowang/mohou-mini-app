# Agent Note: A tarball update does not revalidate the registry

Status: implemented

## Problem

A local update installs `file:` tarballs that are already on disk. npm still rebuilt the tree and asked the mirror for every packument. Each request failed TLS, then returned a stale cache entry about ten seconds later. The 120-second budget ran out while that walk was still going, so the install always stopped as `timeout`.

## Decision

A tarball install passes `--prefer-offline`. Cached packuments are used as they are. A miss may still be fetched. A registry install does not pass the flag, so a published version is not hidden by a stale cache. The launcher adds the flag when an argument is a `file:` spec, including a request written by an older host.

## Alternatives considered

- Raise the budget. Lost: the walk is the defect. A longer wait still blocks open, and a mirror outage still loses.
- `--offline`. Lost: one package missing from the cache fails the whole update. Prefer-offline fetches that miss and keeps the rest local.
- A prefix `.npmrc`. Lost: it would also cover a later registry install from the same prefix.

## Consequences

The budget stays. A tarball install that still needs the network is a cache miss, not a full revalidation. The window binary that is already installed does not grow this flag until it is replaced; a request written by the updated host does, because that binary forwards arguments it does not know.
