---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# ctx.pwsh

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host runs the command.
- Input: `ctx.pwsh(command)` with one PowerShell string.
- Output: `{ stdout, stderr, exitCode }`.
- Failure: a non-zero exit does not throw and has no code; `exitCode` carries it. A missing shell emits `pwsh-unavailable`. Host tries `pwsh`, then on Windows `powershell.exe`. It does not fall back to `bash`. A timeout or an output cap is a non-zero result, not a code. Those bounds come from the resolved host policy. The command runs as the host user. The child environment drops key, secret, token, and password entries. There is no directory jail. Codes: [implementation.md](../implementation.md).
- Non-goals: translating a `ctx.bash` command; an argument allowlist; a sandbox.

macOS, Linux, and Windows are all targets. A command string is not portable across `ctx.bash` and `ctx.pwsh`. An app that must run on both platforms branches, or avoids the shell.

## Implementation


Role: definition. Host provides the call. Each command is a fresh `pwsh -NoLogo -NoProfile -NonInteractive -Command`, with a UTF-8 preamble on the first line. Windows may use `powershell.exe` when `pwsh` is absent. Dispose awaits child exit. Stopping a command signals the process group on POSIX and uses `taskkill /T` on Windows. A Windows Job object is not wired. Plan: [implementation.md](../implementation.md).
