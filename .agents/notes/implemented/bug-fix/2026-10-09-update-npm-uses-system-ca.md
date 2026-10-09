# Agent Note: Update npm uses the system certificate store

Status: implemented

## Problem

A tarball update that needs a new direct dependency, such as `fuzzysort` or `pinyin-pro`, asks the mirror for that tarball. The request fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Packument reads can still hit a stale cache. The tarball download cannot.

## Decision

The update npm process sets `NODE_USE_SYSTEM_CA`, the same way the sidecar does. Node then uses the operating system certificate store. That store can verify the mirror. The bundled store cannot.

## Alternatives considered

- Drop the new packages from `dependencies`, or vendor them into the tarball. Lost: a later new dependency fails the same way.
- Set `NODE_TLS_REJECT_UNAUTHORIZED=0`. Lost: the install would accept any certificate.

## Consequences

The running window binary does not grow this variable. An in-app shell update cannot ship it. The next window build can. Until then, launching that window with `NODE_USE_SYSTEM_CA=1` already in the environment is enough, because the npm process inherits it.
