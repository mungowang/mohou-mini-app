# Agent Note: The update card names what it is doing and how it ended

Status: implemented

## Problem

Installing a version from the panel was a wait with no feedback and an outcome with no reason.

The offer was one line (`Install {n} and restart the host?`), the busy state one sentence, and a failure the fixed sentence `The update could not be installed.` — the host's own error text was discarded at the call site. Nothing on the page watched the install, because nothing could: `POST /api/updates/install` stages the request and the sidecar exits about 200 ms later, so the panel is torn down before the launcher starts npm.

The launcher knew more than it said. It wrote its reason into `update.log`, which the next attempt truncates with `File::create`, and reported the failure in a macOS-only dialog. On Windows a failed install said nothing at all. On this machine the evidence was already on disk: an `update.failed.json` for a 1.0.15 attempt that never installed, and an `update.log` from the 1.0.15 → 1.0.17 retry that had overwritten whatever the failure had said.

## Decision

One card, four states, and one record per attempt.

- `settings/update-dialog.tsx` owns the card: offer, install in progress, failure, and the version now running. Both entries — the check when the panel opens and the check in the settings form — go through `receiveUpdate` in the surface and open the same card, so the two cannot drift.
- The card is wider than the old confirm: `Dialog` gained `md` (`max-w-2xl`) and dropped `lg`, which mapped to the same width as the default.
- The install state is client-side and says only what it knows: elapsed time, the target version, and that the window will restart. No percentage is drawn, because npm emits none without a TTY.
- The launcher ends every attempt with one record at `update-result.json` in the runtime root: state, a closed reason code (`timeout`, `exit`, `prepare`, `closed`, `leftover`), the version it started from, the version it aimed at, whether it rolled back, the installer's exit code, the log path, and epoch milliseconds. `stagePackageUpdate` now also writes the target `version` into `update.json`, so the launcher can name the version it was asked for instead of parsing it out of an npm argument.
- Host reads that file at its own boundary, where a malformed record, an unknown code, or a missing timestamp reads as no attempt, and answers it as `lastAttempt` on `GET /api/updates`.
- The panel shows the record once and acknowledges it with `POST /api/updates/ack`, which drops that attempt. A failed attempt's card offers `Install again` for the version it names.
- The panel owns the wording of each code, in both locales. The log path is shown verbatim.

## Alternatives considered

- Put the progress in the launcher's splash page, by navigating the window back to it when the sidecar exits 75. That is the only surface with real phase information, but the window leaves that page at first boot and returning to it needs the app-scheme URL admitted by the navigation policy; a larger change for feedback the panel can carry.
- Keep the "already shown" marker in the panel's `localStorage`. It is keyed by origin (the port is part of it), it survives a relaunch only if the webview storage does, and it made the path untestable here: this repository's test environment has no `localStorage`. An acknowledgement route gives the record one owner instead.
- A percentage. npm without a TTY reports no progress, so any bar would be invented.
- Drop the record when it is read, so the GET itself consumes it. A read route stays a read; the acknowledgement is its own POST.
- Leave the reason in `update.log` and keep showing one sentence. That is the case that prompted this: the log was truncated by the next attempt before anyone could read it.

## Consequences

A failed update is visible after the restart on both platforms, with the reason and the version that is still running. The card is the only place an install starts, so no caller can start one with different copy.

The reason set is closed and the card already words every code, but two of them cannot be produced yet: `verify` and `boot`. The keys are written, nothing emits them.

Deferred to the next change, named here so it is not lost: verify the installed version against the target, keep the prefix snapshot until the new sidecar is actually ready and roll back when it does not start, and refuse to close the window while an install runs. The launcher still deletes the snapshot when npm exits zero, so a version that installs and then fails to boot leaves the prefix replaced.

The Windows gap is narrower, not closed: the launcher dialog is still macOS-only, so an install that never produces a panel to open still reports nothing there.
