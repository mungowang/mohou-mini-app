# Agent Note: Signal stays bound while the window closes

Status: implemented

## Problem

The GitHub check on `e1d4561` failed in `packages/shell/tests/entry.spec.ts`. `SIGTERM` after the panel answered left a null exit status, which is signal death, not `process.exit(143)`. The supervised entry on the same run exited with a code. The window path is the one that spawns `mini-app-window` and used `once` for the signal.

## Decision

`SIGINT` and `SIGTERM` are bound before the window spawn and stay until the process exits. A second signal does not dispose again and does not restore the default terminate action. A signal that arrives during the spawn still disposes, kills the window if the spawn returned, and exits 143. No pid file is written once dispose has started. A spawn that throws removes the listeners and disposes without exiting. The adopt and supervised paths keep their listeners the same way.

## Alternatives considered

- Print the origin only after the spawn returns. Lost as the only fix: a signal during the blocked spawn, or a second signal during dispose, still takes the default action. A relaunch that finds a dead window still has to print the origin before it exits.
- Accept a null exit status in the entry spec. Lost: that status means dispose did not run. The pid file and the window can remain.

## Consequences

`pnpm dev:host` and the supervised sidecar keep handling `SIGINT` and `SIGTERM` until they exit. A second signal while Host is disposing does not abort that dispose.
