# Agent Note: Node cannot resolve a verbatim path

Status: implemented

## Problem

The launcher's startup log, added earlier the same day, printed the answer on the first run it was asked about:

```
entry \\?\C:\Workspace\Tools\Mohou-1.0.24-windows-x64\Resources\prefix\node_modules\@mohou\shell\src\dev.ts
sidecar error: Error: EISDIR: illegal operation on a directory, lstat 'C:'
```

`prefix_from_exe` canonicalizes the prefix it finds, which resolves `..` in the bundle layout and follows a symlinked install. On Windows, `std::fs::canonicalize` returns a *verbatim* path: `\\?\C:\...`. That path is fine for the operating system, fine for Rust, and fine as a working directory. Handed to Node as the entry argument, it is not: the CommonJS loader splits it, calls `lstat("C:")`, which names the current directory on a drive rather than a file, and the process dies in `resolveMainPath` before any of the sidecar's own code runs.

The verbatim prefix therefore has to stop at the process boundary. Only Node cares; nothing else in the launcher was wrong, and the macOS build never produced one.

## Decision

`plain_path` strips the verbatim prefix on Windows — `\\?\C:\dir` to `C:\dir`, and `\\?\UNC\server\share` to `\\server\share` — and returns the path unchanged everywhere else. It is applied where the prefix is resolved, in `prefix_from_exe`, so the entry, the panel directory, the runtime root, and the working directory the sidecar is started in are all plain at once.

Canonicalizing stays. It is what makes a bundle launched through a symlink, or from a directory containing `..`, resolve to one prefix.

## Alternatives considered

- **Stop canonicalizing on Windows.** Loses `..` resolution and symlink following, which is the reason the call is there.
- **The `dunce` crate.** It does exactly this, and a dependency whose whole content is one string operation, on one platform, is not worth the supply chain.
- **Hand Node forward slashes.** The path already mixes them (`\Resources\prefix\node_modules/@mohou/shell/src/dev.ts`), and the prefix is the part that breaks, not the separator.
- **Start the sidecar with a relative entry.** A relative path would depend on the working directory surviving, which is exactly what an npm install or a rollback can change underneath a running launcher.

## Consequences

A Windows launch now hands Node `C:\Workspace\...` and the sidecar starts. The log line that named the entry is what made this a five-minute diagnosis rather than another round of guessing, which was the point of the previous change.

The tradeoff is a path longer than the legacy 260-character limit: Windows would need the verbatim form for some of those, and Node is long-path aware without it. A prefix that deep is not a shape this product builds.
