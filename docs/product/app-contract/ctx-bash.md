---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# ctx.bash

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host runs the command.
- Input: `ctx.bash(command)` with one string.
- Output: `{ stdout, stderr, exitCode }`.
- Failure: a non-zero exit does not throw and has no code; `exitCode` carries it. A missing shell emits `bash-unavailable`. A timeout or an output cap is a non-zero result, not a code. Those bounds come from the resolved host policy. The command runs as the host user. The child environment drops key, secret, token, and password entries. There is no directory jail. Codes: [implementation.md](../implementation.md).
- Non-goals: an argument allowlist; using the shell as the HTTP client; a sandbox; translating the command into PowerShell. Windows runs this only when `bash` is on `PATH`; [ctx.pwsh](ctx-pwsh.md) is the shell to reach for there, and an `bash-unavailable` code is the signal to do it.

## Implementation


Role: definition. Host provides the call until a second executor exists. Each command is a fresh `bash -c`. A missing shell is `bash-unavailable`. Timeout and output cap are a non-zero result, not a code. The child environment is scrubbed of key, secret, token, and password entries. Dispose awaits child exit. Stopping a command signals the process group on POSIX and uses `taskkill /T` on Windows. A Windows Job object is not wired. Plan: [implementation.md](../implementation.md).
