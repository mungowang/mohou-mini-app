# Agent Note: A failed launch says why

Status: implemented

## Problem

A Windows user double-clicked the release bundle: the window opened white, a console flashed, and the process vanished. Nothing was left behind. No dialog, no log, no file to send.

Three separate decisions made that outcome possible.

The launcher's only user-facing channel was `tell_user`, and its dialog was inside `#[cfg(target_os = "macos")]`. On Windows it called `eprintln!` and returned. A packaged Tauri binary is built with `windows_subsystem = "windows"`, so there is no console to print to: every fatal message the launcher produced on Windows went nowhere. The sidecar's stderr was `Stdio::inherit()` for the same reason, so Node's own explanation was lost as well. And `read_origin` discarded the sidecar's stdout except for the origin line it was waiting for, printing the rest to the same missing stderr.

Under that silence sat the actual bug. `launch_plan` decided where to look for Node with `gui = is_app_bundle(prefix)`, which is true for a packaged app on either platform, and then took the macOS path: ask the login shell for PATH, fall back to `/usr/bin:/bin:/usr/sbin:/sbin`, prepend Homebrew. On Windows both shell probes return `None`, so the inherited environment PATH — the one place a Windows install actually records where Node is — was replaced with a unix string. `find_node` then saw one useless PATH entry and fell back to nvm-windows roots and `%ProgramFiles%\nodejs`. A Node installed anywhere else was invisible, so `launch_plan` failed, `spawn_sidecar` returned that error, and the error was printed into the void.

The same replacement had a second consequence: the sidecar's own PATH was the unix string plus the Node directory, so anything it spawned — an `npx` MCP server, a bash tool — would not find the tools that machine has.

## Decision

- **A Windows launch inherits PATH.** `reads_login_shell(gui, windows)` names the rule in one place: a login shell is a macOS bundle concern, because a Dock launch does not read `.zshrc`. Windows passes the inherited environment through, with `find_node`'s existing fallbacks left as a safety net.
- **Every launch writes `launcher.log`** in the runtime root, replacing the previous file. It leads with the platform, the version, the runtime root, the resolved Node, the entry, and the PATH — the three facts that explain this class of failure — then every line the sidecar prints on stdout or stderr, and every message shown.
- **One `Reporter` owns what the launcher says.** `note` writes the log and stderr; `say` does that and shows a native message on a GUI launch. The two previous functions, `tell_user` and `tell_user_later`, differed only in how they suppressed the dialog's stdio, which the native calls do themselves, so they collapse into one.
- **A native message on both platforms.** macOS keeps `osascript`; Windows calls `MessageBoxW` through a `#[link(name = "user32")]` declaration. One dialog is not worth a dependency, and it is the difference between a silent failure and a report.
- **A sidecar that dies before it is ready is quoted.** `read_origin` and the new stderr reader both keep the last twenty lines in a shared tail; the failure message names the exit code, those lines, and the log path.

## Alternatives considered

- **A logging crate.** `env_logger`, `log`, or `tauri-plugin-log` would each add a dependency, a level filter, and an output arrangement to configure, to write one file this launcher owns.
- **Show the failure inside the WebView.** Elegant when the page loads; the whole point is that it has not. Navigating a white window or evaluating script into it cannot report a failure that happens before the origin exists.
- **Attach a console on Windows.** `AttachConsole`/`AllocConsole` would give a window rather than a dialog, and a flashing console is exactly what confused this user in the first place.
- **Only fix the PATH.** The PATH bug explains this report. It does not explain the next one, and the next one would again arrive as "it flashed and closed".
- **Keep `tell_user_later`.** The `_later` variant existed to spawn a dialog without letting it inherit stdio handles. Both native calls already pass null handles, so the distinction had stopped carrying information.

## Consequences

A failed launch on Windows now shows a dialog naming the exit code, the sidecar's last lines, and the log path, and the log holds the PATH the launcher used — which is the line that would have turned this report into a five-minute fix.

`launcher.log` is replaced on every launch, so it describes the launch in front of the user and nothing older. A launch that fails before the runtime root exists writes no log; the dialog and stderr still carry the message.

The launcher now shares state with its reader threads through an `Arc<Reporter>`, and each write takes the log's mutex. Lines can interleave between threads at write granularity; neither reader holds the lock across a read, so no thread can block the launch.
