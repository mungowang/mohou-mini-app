---
status: shape-locked
progress: settled
updated: 2026-10-04
---

# Credentials

Layer: [Host](README.md). Index: [features.md](../features.md).

- Owner: Shell supplies the provider. Host binds `get` onto `ctx` and the write side onto the panel surface. The author tool lists names.
- Input: one or more source specs, passed to `createCredentials`. The read port has no target. `builtin-json` is the built-in kind, and its target is `credentials.json` in the mini-app home. One name, one object: `{ description, secret }`. The name is the object key. An API source would be another kind with its own target. It is not a file path on the port.
- Output: `mini_app_credential_list` returns `{ credentials: [{ name, description }] }`. `ctx.credentials.get(name)` returns that secret, or `undefined` when the name is absent. A missing file is an empty list. The panel's list carries `writable` beside the rows, and no call returns a secret: a value is written and never read back out of the store.
- Failure: an empty name emits `credential-invalid`. A present file that is not the object shape emits `credential-unreadable` and is not rewritten. The same name in two sources emits `credential-duplicate`. A write against a store that has no writable source emits `credential-write-unavailable`. No source wins silently. The message does not include the secret.
- One write operation, `put(name, description, secret)`: the store writes exactly the account it is given and models no user intent. An owner who fixes a description without a new secret is a case for the caller: the panel never receives a stored secret, so the host's credential route reads the stored value with `get` and calls `put` with it. A name with no account and no secret has nothing to keep: `credential-invalid`.
- One interface covers read and write: `writable`, `list`, `get`, `put`, `remove`. A source kind opens one provider, so a kind's two sides cannot drift, and Shell swaps the store by opening another kind. Writes go to the first source that can be written. The built-in file holds plaintext at mode `0600` until a keychain kind exists.
- Non-goals: `put` or `delete` on what app code sees (the app gets `get` alone); a list on `ctx`; a platform catalog of account types; a second copy of the same account under another name. The editor is [a settings section](../panel/credentials.md); the secret store a keychain would back is a later kind, not a later interface. The built-in file source owns both the read and the write. Shell does not grow a second credential API.

## Implementation

Role: provider. The port is `CredentialProvider`, read and write on one interface. `createCredentials` opens one provider per source kind; `ctx.credentials` projects `get` alone (`credentialsFor` in `packages/host/src/kernel/call.ts`). The panel reaches the same provider through `/api/credentials`, which requires the authoring token. `createCredentials` takes the source specs and opens them. Each kind carries its own target. `builtin-json` reads its file on each call. `emptyCredentials` is no source. Shell passes the built-in file spec from `homeCredentialsPath`. The author tool is the only list. Plan: [implementation.md](../implementation.md).
