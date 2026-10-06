# Agent Note: The trash behind a quiet icon

Status: proposed

## Problem

The library's first screen ends with the trash: a heading and one button per trashed app, straight
under the grid of live apps. It was the shortest path to a working restore and it reads badly — an
empty or full row of leftovers under the thing the page is for, competing with the cards, with no
indication that pressing a name restores it.

The host already has the operation: `POST /api/trash/:appId/restore` calls `undeleteApp`, which
refuses a restore whose id is live with the closed code `app-duplicate`. The panel client already
exposes `undeleteApp`, and the gallery state already carries `trash`, `trash-failed`, and
`undeleted`. What is missing is the presentation, and one decision the host does not make.

## Decision

**A quiet icon in the chrome, not a row under the grid.** The library's first screen shows apps. A
trash glyph sits with the toolbar's other quiet controls, carrying a count when there is something
in it, and opens a trash view — the same gallery shell, listing what was deleted rather than what is
live. A person who never deletes anything never sees it.

**Restore is a button on a row, and the row says what it is.** Each trashed app shows its name, when
it was deleted, and one restore action. Pressing a name restores it only if the row says so.

**A conflict is named, not swallowed.** The host refuses a live id with `app-duplicate`; the view
shows that as "an app with this id is back" rather than a failed request. A *name* that is already
in use is not a host conflict — ids are identity — so the view refuses on that too and says which
app holds the name, because "restore" that silently produces two identically named cards is not
what the person asked for. The message names both, and the restore is one press away after the
other app is renamed.

## Alternatives considered

- **Leave it under the grid and style it better.** The complaint is placement, not styling: the
  first screen is for the library.
- **A dialog instead of a view.** A dialog over the grid still puts the trash on the first screen,
  and a list of deleted apps wants the room a view has.
- **Restore on a name press, as now.** It hides the action behind a label that does not read as one.
- **Let a name collide and restore anyway.** The host allows it; the library then shows two cards
  with one name and no way to tell which is which.
- **Purge a trashed app from this view.** Not asked for, and deleting for good wants its own
  confirmation path.

## Consequences

The library's first screen is apps only, and the trash is one quiet press away with a count that
says whether there is anything to look at.

The restore path gains a name check that the host does not have, which lives in the view and not in
`undeleteApp`: the host's rule stays about identity, and the view's rule stays about the person
reading the cards.
