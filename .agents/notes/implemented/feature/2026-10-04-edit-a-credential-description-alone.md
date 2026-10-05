# Agent Note: A credential description is editable on its own

Status: implemented

## Problem

The panel's edit form could not save without a secret. The store has no read-back — a secret is written once and never returned to the panel — so an owner who only wanted to fix a description had to paste the secret again, and the form asked for it. The route required `name` and `secret` together, and `put` takes both, so there was no way to express "keep the stored value".

## Decision

The stored secret is resolved where the request is understood, and the store keeps one write operation.

- `CredentialProvider` is unchanged: `writable`, `list`, `get`, `put(name, description, secret)`, `remove`. `put` means "write exactly this account", so a store implementation never has to model a partial update, and a later keychain kind implements the same four methods.
- `POST /api/credentials` takes an optional `secret`. The route validates the name and passes the absence through; it does not branch.
- The host's loopback port resolves it: an absent or empty secret reads the stored value with `get(name)` and calls `put` with it. A name with no account has nothing to keep and is `credential-invalid`. This is the one place that holds both the request and the provider.
- The panel sends `undefined` when the field is empty, says that leaving it empty keeps the stored secret, and confirms which of the two happened after a save. A new credential still requires a secret, and the form names what it is waiting for.

## Alternatives considered

- A provider `update(name, description)` beside `put`. It gave one user action two store operations, and it put the same conditional in every implementation. The user named this and rejected it: one action, one API.
- `put(name, description, secret?)` with the store keeping the stored value when the argument is absent. Fewest methods, but "absent means keep" becomes a default inside the operation, and each implementation repeats it.
- Resolving in the panel. Impossible: no call returns a secret, so the panel has no value to send. This is also why the resolution cannot be a client-side convenience.
- A second route for a description-only save. Two routes for one form action, and the panel would have to decide which to call, which is the same branch one layer further out.

## Consequences

Editing a description is one call with no secret in it, and a real-host test asserts the stored secret survives it byte for byte, that an empty secret behaves the same, and that a name with no account is refused.

A description-only save is a `get` followed by a `put`, not one atomic step. The store is a single-user local file that is rewritten whole on every write, so there is no writer to race with; a store that gains concurrent writers would move this into `put` and revisit the choice.
