# Agent Note: Rename an app id

Status: implemented

## Problem

An app id is the directory name, the manifest id, and the key in several host records. Changing one of them leaves the others pointing at an app that is no longer there.

## Decision

`mini_app_rename` moves the live directory, writes the new id into `manifest.json`, moves the `activity.json` key, and points `host.json` `defaultWorkbenchId` at the new id when it was the old one. Trash copies of the old id follow, including the id inside each copy's manifest. Logs, storage, the theme pin, and git history sit in the directory and move with it. `.autogen` is dropped. An open panel tab follows the new id. Source text is not rewritten.

## Alternatives considered

- Leave trash on the old id. Lost: restoring a deleted copy recreates the id that was just renamed away.
- Rewrite every source file that mentions the id. Lost: a string that happens to match is not the identity.

## Consequences

The rename commits the tree itself. The message is `Rename <old> to <new>`. Pending source edits ride along, the same way a reload commit does. The live homepage pin in memory follows the file.
