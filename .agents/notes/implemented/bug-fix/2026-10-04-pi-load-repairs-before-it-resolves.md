# Agent Note: A repaired prefix still loads Pi in the same process

Status: implemented

## Problem

A hot update left Pi unavailable until the user reopened the app. The update installs the prefix with `--omit=peer`, and npm removes `node_modules/@earendil-works/pi-coding-agent` and `pi-ai` from the prefix: they are peers, so they are not in the manifest, and npm reports them as removed. The sidecar that starts after the install has to link them again, and it does — the filesystem ends correct. Pi still reported unavailable for that whole process, and only the next start worked.

The cause was the order inside the load. `loadPi` asked `import.meta.resolve` whether a peer resolved, linked when it did not, and then imported. Node remembers a failed resolution for the life of the process, so the repair could not undo the probe:

```
resolve#1: FAILED ERR_MODULE_NOT_FOUND     probe runs first, and the failure is remembered
(link created here)
resolve#2: FAILED ERR_MODULE_NOT_FOUND     still the remembered failure
import#1:  FAILED ERR_MODULE_NOT_FOUND     so Pi is unavailable until the process ends
```

Two smaller things made it worse. `ensurePiLoaded` cached the promise with `loading ??= loadPi()`, so a failed load was the answer for every later caller, and nothing retried. And the load swallowed the error to return `false`, so the provider said `pi is not available` with no reason.

## Decision

The load repairs first and asks the loader once, and a failure is not the last word.

- The presence check reads the filesystem (the two link paths in this prefix), never the module loader. Repairing is what makes a later loader call succeed, so the loader cannot be the check that runs before the repair.
- `createPiLoad` takes three steps — `present`, `link`, `load` — and wraps the repair and the load in one guard. A repair that throws is a failed attempt, not a rejected promise, because a prefix the user cannot write must still leave the id registered.
- A failed attempt clears the cache, so the next `ensure` retries; a success is cached, and concurrent callers share one attempt.
- The last failure message rides along, and the provider's `provider-unhealthy` error names it instead of saying only `pi is not available`.
- `registerPiRuntime` asks for a fresh `ensure()` on each `llm` and `agent` call, so a retry that succeeds is used, and `healthy()` reports the last finished attempt.

## Alternatives considered

- Link the peers in the launcher before it spawns the sidecar, so no load ever needs the repair. The launcher deliberately does not link: Shell owns the prefix links, and the same load has to work under `pnpm dev:host` and on a prefix a user fixed by hand. It also would not cover a prefix whose links are removed while the app runs.
- Wait for the load during boot and fail boot when it fails. That reverses the deliberate choice that Pi registers and never blocks the window, and a slow or missing Pi install would then cost the whole product.
- Import the peers by absolute path instead of by name, which would sidestep the resolver cache. It hides the real problem — a link that is not there yet — and the bare specifier is what the consumers of these peers expect.

## Consequences

A hot update no longer costs Pi until the next app start; the sidecar that follows the install links the peers and loads them in the same process. Measured on a prefix left in the post-update state: `ensurePiLoaded()` returns true in about 300 ms, with the links restored as a side effect.

A prefix whose peers cannot be linked at all now reports the reason with the failure, and retries on the next call rather than staying silent. The launcher still does not link, so the first load of a fresh install is the step that creates these links.
