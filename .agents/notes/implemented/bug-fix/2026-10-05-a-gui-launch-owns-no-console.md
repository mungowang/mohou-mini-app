# Agent Note: A GUI launch owns no console

Status: implemented

## Problem

The Windows launch worked, and it came with three console windows: two that flashed and closed, and one that stayed — titled `C:\Program Files\nodejs\node.exe`, empty, and fatal to close. Closing it took the app with it.

That window was the sidecar. This binary is built for the Windows subsystem, so it has no console, and Windows gives one to any console child it starts: the `node.exe` running `@mohou/shell/src/dev.ts` received a new console and a *window* for it. The console belongs to that process, so closing the window kills the sidecar; the launcher sees its child exit and exits with it. The two flashes were the launcher's own short-lived helpers: `taskkill` from `stop_process`, and the `powershell` process that watches for the launcher's death.

The same mechanism hid a second problem. Without a window of its own, that console is a place the sidecar's own children inherit: the esbuild service behind `tsx`, `npm` during an update, an `npx` MCP server. Each of them would have shown a window of its own on Windows.

## Decision

`no_console(cmd)` sets `CREATE_NO_WINDOW` on Windows, and does nothing elsewhere. It is applied to every process this launcher starts that is a console program: the sidecar, the update install, `taskkill`, and the `powershell` watcher.

Nothing else is needed for the descendants. `CREATE_NO_WINDOW` still gives the child a console — it just never shows one — so the processes Node starts inherit that console rather than allocating their own.

The sidecar's stdout and stderr stay piped, so the change costs no diagnostics: `launcher.log` records the same lines, and the failure dialog still quotes them.

## Alternatives considered

- **`DETACHED_PROCESS`.** Gives the child no console at all. A process without a console that later wants one can allocate a window, which is the failure this is fixing, and it changes the semantics for grandchildren rather than the presentation.
- **`-WindowStyle Hidden` for PowerShell.** Already there, and it shows a window before hiding it: a flash, which is one of the three symptoms.
- **Let the sidecar be the only one flagged.** The flashes came from the launcher's own helpers, and the update install would show a window of its own minutes later, during an update, which is exactly when a user is watching.
- **Accept the console as a debugging surface.** It is titled with a Node path, prints nothing (stdout and stderr are pipes), and closes the app when a user tidies it away.

## Consequences

A Windows launch shows one window: the app. Its lifetime is owned by that window, as it is on macOS.

`no_console` is a no-op off Windows, so this is a Windows-only mechanism and cannot be exercised by the test suite on the machines that build the product. The one check that covers it is a launch on Windows, which is where this was found.
