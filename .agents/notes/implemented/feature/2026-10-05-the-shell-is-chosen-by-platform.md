# Agent Note: The shell is chosen by platform, and a run can be repeated

Status: implemented

## Problem

Two templates reached for `ctx.bash`, which is `bash`: on a Windows machine without it the call answers `bash-unavailable`, and the templates had only one command string, written for POSIX. The previous change made them fall back to `ctx.pwsh`, which fixed the mechanism and not the intent — `df -k /` still went to PowerShell when bash was missing, and it failed there in a way that reads like the app is broken. Falling back *after* a failure is the wrong order: the machine's platform is knowable before the call.

Nothing told a person what `ctx.state` and `ctx.log` are, either. The guide named them in one table row each and two product pages described `ctx.state` as "the in-memory object from `defineApp`", which the host does not pass.

## Decision

**The platform picks the shell and the command.** `chores` reads `ctx.system.metrics().platform` once, then runs the POSIX string through `ctx.bash` or the Windows string through `ctx.pwsh`. No fallback: a command written for the wrong shell is a worse failure than a button that does not apply, and `win32` is the fact the author needs either way. `AppSystemMetrics.platform` already carries it, so no contract member was added.

**The workbench can exercise the shells.** A `shell` station runs a command through either shell — `auto` resolves by platform — and records it as a run with the exit code as a field rather than a status: a non-zero exit is a finished run, and [defensive outcomes](../../../docs/product/implementation.md) keeps facts independent. The station says in the code that a shell call takes no abort signal, so Cancel marks the run and leaves the child to the host's timeout.

**A record can be handed back to its form.** The rail's rows carry a button that fills the station's own form — prompt, goal, MCP server/tool/arguments, or command — so the next run starts from what the last one used. The hand-off is a `RunRecall` with an `at` stamp, because filling twice from one record must land twice.

**The two undocumented members are documented, or reported.** `ctx.log` has a page: JSONL at `apps/<appId>/logs/app.log`, 1 MiB segments, a 5 MiB cap that drops the oldest sealed segment, no read-back, and a warning that the file is not scrubbed after the fact. `ctx.state` is documented as what the host does — a fresh `{}` per call — in the guide, and the two pages that promised otherwise are flagged rather than quietly rewritten, because whether the host should keep state per app is a product decision and not a doc edit.

## Alternatives considered

- **Keep the capability probe and fall back.** It survives the case where a machine has neither shell in the usual place, and it cannot choose the command: by the time `bash` answers `bash-unavailable`, the string is already the wrong one.
- **Add `ctx.platform` to the contract.** `ctx.system.metrics().platform` already answers this, at the cost of one OS snapshot. A second member for a fact in hand is a seam without a second consumer.
- **One command string with a portable subset** (`echo`, `node -e`). It rules out the tools worth having: `ps`, `df`, and their Windows counterparts.
- **Implement `ctx.state` while documenting it.** It changes the meaning of every app's persisted expectations; the owner decides that, not a documentation pass.
- **Put the recall button in the detail sheet.** The sheet is for reading a record; the button is for the next run, and the station's form is where the next run starts.

## Consequences

A Windows machine runs the Windows command with the Windows shell, decided before the call.

The workbench records four kinds of run and can repeat any of them from its rail, which also makes the shell capability testable by hand rather than only through an app that happens to need it.

`ctx.state`'s documentation now matches the host. If the product decides state should persist per app, the guide, the two product pages, and this note are what to revisit.
