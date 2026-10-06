# Agent Note: The trash behind a quiet icon

Status: implemented

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

**A quiet glyph in the chrome, and a panel rather than a view.** The library's first screen shows
apps. The trash is a bare glyph beside the search field — no border, no background, muted until the
pointer is on it — and it opens a small panel listing what was deleted. Three shapes were drawn as
clickable prototypes first (a view, this panel, and a peer tab beside the library); the panel was
chosen because the errand is short and a view is more machinery than it earns. A person who never
deletes anything sees one grey glyph, and the count lives in the panel's own header, not on the
icon.

**Restore is a button on a row, and the row says what it is.** Each trashed app is a row with its
name and one restore action. Pressing a name no longer restores it, which was the old behaviour and
read as nothing in particular.

**A conflict is named, not swallowed.** The host refuses a live id with `app-duplicate`; the view
shows that as "an app with this id is back" rather than a failed request. A *name* that is already
in use is not a host conflict — ids are identity — so the view refuses on that too and says which
app holds the name, because "restore" that silently produces two identically named cards is not
what the person asked for. The message names both, and the restore is one press away after the
other app is renamed.

## Alternatives considered

- **Leave it under the grid and style it better.** The complaint is placement, not styling: the
  first screen is for the library.
- **A dialog instead of a panel.** A modal over the grid wants a scrim, a focus trap, and a decision
  about dismissal; the panel is anchored, light, and closes on an outside press.
- **A view instead of a panel.** More room, and more machinery: navigation, a back affordance, and a
  first screen that no longer shows the library. Worth it when the trash grows actions of its own.
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
reading the cards. A refusal stays on its own row, and `restoreApp` returns the message instead of
dispatching a delete failure, which is what it used to do — a restore that failed was reported as a
deletion that failed.

The trash is still panel-only: `ctx.workbench` has `apps`, `openApp`, and `setDefault`, so an
authored workbench cannot list or restore a deleted app. That is the next change, and it is the
same capability the panel's route already calls.
