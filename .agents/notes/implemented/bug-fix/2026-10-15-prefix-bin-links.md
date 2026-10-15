# Agent Note: Shipped prefix bin links stay inside the bundle

Status: implemented

## Problem

`xattr -cr` on an installed `Mohou.app` reports missing files under `Contents/Resources/prefix/node_modules/.bin`. Those entries are symlinks to `/Users/runner/work/.../artifacts/app/stage/prefix/...`. The app was built on the release runner and installed somewhere else, so the targets do not exist.

## Decision

`copyInstallPrefix` copies the stage prefix into the macOS bundle and the Windows zip. The copy keeps symlink text (`verbatimSymlinks`). An absolute link whose target sits inside the stage prefix is rewritten to that same relative path in the shipped prefix. A link that points outside the prefix stays as npm wrote it.

## Alternatives considered

Rewriting the links only on the installed app. That repairs one machine, and the next download is broken the same way.

Leaving the copy on Node's default `fs.cp`. That is what turned npm's relative bin links into absolute paths of the build machine.

## Consequences

A bundle built before this copy still has the absolute links. Windows `.bin` entries are files with `%~dp0` relative paths; the same copy is used so a symlink on that prefix is not absolutized either. The spec copies one relative bin link and one absolute bin link, deletes the stage tree, moves the copy, and reads the target through the link.
