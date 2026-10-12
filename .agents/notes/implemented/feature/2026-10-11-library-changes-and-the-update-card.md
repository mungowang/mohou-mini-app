# Agent Note: Library changes, empty credentials, and the update card

Status: implemented

Supersedes the quick-add half of [The MCP page offers our own servers](2026-10-05-the-mcp-page-offers-our-own-servers.md). Extends [The update card names what it is doing and how it ended](2026-10-05-the-update-card-names-its-outcome.md).

## Problem

Three gaps showed up together.

A preset click filled the MCP form and tried to create empty credentials, but a put with no secret throws `credential-invalid` when the name is new, so the empty row never landed. The server itself waited for a second save.

Creating, editing, trashing, or restoring an app did not tell the homepage. The builtin gallery refetched on a market install. A workbench homepage did not hear that either, and an author UI cannot subscribe to `GET /api/events`.

The card that says the new version is running stopped there. The writing skill ships at the same version as the app, and the place to install it is Settings → Agent.

## Decision

**A placeholder write is a fourth argument, not a blank secret.** `putCredential(name, description, secret, true)` creates `{ secret: '' }` when `get` is `undefined`, and returns without writing when the name already exists, including an empty secret. The credentials form still omits the flag, so a new row there still needs a secret.

**Quick add writes the server and the missing credentials in one click.** The same id is replaced. A scan of the saved file, and a save of a handwritten server, create the same empty rows. The notice says to fill each secret in Credentials, then restart the host. A failed server write does not say the server was added.

**Host publishes `app:changed` after the write returns.** The payload is `{ appId, change, from? }`. `change` is `created`, `updated`, `deleted`, `restored`, or `renamed`. `appId` is the id after the change. `from` is the previous id when the change is `renamed`. `app:rename` stays, so an open tab follows the id. The panel bumps the library tick, which refetches the gallery and the trash.

**A loaded app handles host notices with `defineApp.onHostEvents(ctx, event)`.** The hook is not an `api` method. The host calls it on each loaded instance that defined it, with a fresh `ctx`. `useApp().on` stays this app's own `ctx.push`. The sample workbench pushes one name of its own, and the view refetches from `on`. An instance that is not loaded is skipped. `app:eval` is not a notice. A thrown hook is logged.

Publish sites: register `created`; file write, edit, or delete `updated`; the reload that publishes `app:reload` also `updated`; a history reset that changed the tree `updated`; rename `renamed` with `from`; trash `deleted`; restore `restored`; a market app install `created`, or `updated` when it replaces, beside `market:install`; each sample the settings button copies `created`. A failed write publishes nothing. npm package install and the sample copy at host boot publish nothing.

**The done card names where the skill is, and can update it.** The sentence points at Settings → Agent, and at this card. The button installs into the assistants this browser already chose, or into every assistant whose home exists when nothing was saved. The settings skill list is the same `SkillInstall`, folded in the card. The one-step install returns `PanelSkillStatus` and passes it into that list, so a successful click replaces "update available" with the version just written. An in-flight `readSkill` from the list's own mount does not overwrite that result.

## Alternatives considered

- **Keep quick add as an unsaved form.** That was the previous decision, so a server that cannot connect is not written until the person checks it. The click then does not install anything, which is the gap this change closes. The notice carries the fill-and-restart step the form used to be for.
- **`useApp().onAppChanged`, or a second `useWorkbench()` handle.** `useApp().on` is this app's own push. A host notice is not that stream. `ctx.workbench` is the desk calls, and the view does not hold it. `defineApp.onHostEvents` is the hook the host calls on a loaded instance.
- **Remind the done card about MCP credentials.** The version that just started does not change those secrets. The skill version does follow the app version, and Settings → Agent is where that copy is installed.
- **Only a sentence, with the update left on the settings page.** The card is already open at the moment the copies are stale. The button uses the selection the settings page remembered, and the folded list is there when that selection is wrong.

## Consequences

An empty credential keeps the server from starting until the secret is filled and the host restarts. A second placeholder write does not clear a secret that was filled in between.

A market app install refetches the gallery twice, once for `market:install` and once for `app:changed`. Theme installs stay on `market:install` only.

The workbench template and the skill copy both define the hook and listen for the name they push. `check:skill` fails if those two trees drift. The skill states the hook on any loaded app — Files, `loader.md`, `skeleton.md`, and a Host notices section in `ctx.md` — not only under workbench. The skill version is still the shell version and is not bumped here.
