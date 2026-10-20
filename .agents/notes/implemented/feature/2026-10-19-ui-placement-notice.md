# Agent Note: Reload fails UI source outside ui/

Status: implemented

## Problem

Author agents sometimes put a React component at the app root or under `components/`. Side classification is path-based: only `ui.tsx` and `ui/**` are UI. Those files are treated as backend. When used, reload failed with `backend cannot import react/jsx-runtime` (or `@mohou/ui`). When unused, nothing failed. Both left the author chasing the wrong fix.

## Decision

The layout stays path-based. Reload fails with `ui-placement` when a source file outside `ui.tsx` / `ui/**` imports a UI module or contains JSX. The message names the file and `ui/`. `shared/**` keeps `shared-invalid`. A first notice-only pass was rejected: misplaced UI is a contract miss, not a soft hint.

## Alternatives considered

- Treat root `.tsx` as UI by suffix. Lost: blurs backend and shared boundaries for little gain.
- Notice only (`ui-placement` soft). Lost: unused files stayed green; used files still failed on the allowlist first.
- Allow a second UI tree such as `components/`. Lost: more names to keep in sync with no product demand yet.

## Consequences

A misplaced component fails reload until it moves under `ui/`. The author matches `ui-placement` instead of a backend import denial.
