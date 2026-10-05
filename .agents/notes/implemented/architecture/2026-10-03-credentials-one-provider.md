# Agent Note: Credentials are one provider, and it writes

Status: implemented

Supersedes the read-only line in [Credential read port](../../implemented/architecture/2026-09-17-credential-read-port.md) and the "The panel has no credential editor" line in [decisions.md](../../../../docs/architecture/decisions.md).

## Problem

The credential provider read: `list` names and descriptions, `get` one secret. The write side existed as two file functions with no production caller, no port, and no route, so nothing could add an account. Two consequences followed.

An author who needed a token had nowhere to put it except the file that consumes it. A secret pasted into `mcp.json` sat in the clear on disk, came back through the panel, and reached the model-facing listing as a masked value. The provider could not accept the same account under a name.

The first attempt at this change added a second abstraction beside the read port: `CredentialWriter` with its own kind dispatch and its own binding. That gave one capability two swap points and two ways to be absent, which is the opposite of what a later storage swap needs.

## Decision

One interface covers the store. `CredentialProvider` is `writable`, `list`, `get`, `put`, `remove`. A source kind opens one provider, so a kind's read and write sides cannot drift; `builtin-json` is that provider over one JSON file. Shell injects the provider once, exactly as before, and its write side rides along. A swap to a system keychain is one new kind, and no caller changes.

App code does not see the write side. `credentialsFor` projects `get` alone onto `ctx.credentials`, so the app contract is unchanged.

Multi-source rules stay: the same name in two sources is `credential-duplicate`, and the first source that can be written owns writes. No writable source is `writable: false`, and a write against it is `credential-write-unavailable` — the panel keeps the list and hides every write control.

The file is written `0600`, and a write re-tightens a file an earlier version left readable.

## Alternatives considered

- A separate write port (the first attempt). Lost: two interfaces for one store, two injection points, and a panel that has to treat writes as optional per call site.
- Put `put`/`remove` on the read port and hand that whole object to app code. Lost: an app would be able to write credentials through `ctx`.
- Ship the keychain now. Deferred, not rejected: the order here is what makes it cheap later. Shell picks the kind; Host never learns which one it got.
- Leave the JSON file world-readable like any ordinary data file. Lost: it is the one file whose whole purpose is secrets, and the authoring token already sets the precedent at `0600`.

## Consequences

`decisions.md` and five feature pages said the panel has no credential editor; the settings section replaces that sentence. A credential is created in Settings, or by writing `credentials.json`, and referenced by name.

Until a keychain kind lands, the store is plaintext at `0600`. That closes copy-in-the-repo and world-readable exposure, and it does not close the same-user case: an app with `ctx.bash` can read the file as its owner. `writable` exists so a read-only kind needs no interface change.
