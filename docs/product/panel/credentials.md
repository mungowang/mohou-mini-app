---
status: shape-locked
progress: settled
updated: 2026-10-04
---

# Credentials

Layer: [Panel](README.md). Index: [features.md](../features.md).

- Owner: Panel for the form. Host for the store.
- The editor is its own settings section beside [MCP servers](mcp.md). The entry is hidden when Host exposes no credential store.
- A row shows the name, the description, and the reference a server writes to use it: `${credential:<name>}`. A secret is never listed, echoed, or shown again after it is saved; the form has no field that can display one.
- Add opens a form for name, description, and secret. Edit opens the same form with the name fixed, because a name is what a server references; a rename is a delete and an add.
- Edit leaves the secret empty: the form says that saving with no secret keeps the stored one, and the save sends the description alone. The stored value never reaches this side, so keeping it is Host's step. A new credential still needs a secret, and the form says which of the two it is waiting for.
- A write with no name does not leave the form, and a new credential without a secret does not either. Delete asks first, and its prompt says that servers naming it will stop starting.
- A store that reports `writable: false` keeps its list and hides add, edit, and delete. The section says why instead.
- The client presents the panel's authoring token on every call here, read once from the about block. A caller without it is refused before the body is read.
- Failure: a read that Host refuses shows that the list could not be read and leaves the section usable. A failed write keeps the form and shows the message. An empty name or secret is refused in the form before the call.
- Non-goals: revealing a stored secret; a per-app or per-server scope for a credential; editing a credential while a form holds unsaved settings changes; a second language control.

## Implementation

Role: consumer. `CredentialSettings` calls `readCredentials`, `putCredential`, and `removeCredential` on the injected client and holds its own row state. No route string lives here. Routes are in [host/http.md](../host/http.md); the store is [Credentials](../host/credentials.md). Plan: [implementation.md](../implementation.md).
