---
status: shape-locked
progress: settled
updated: 2026-10-03
---

# Identity, storage, state, credentials, config, log, signal

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host implements storage, config, and the cancel signal. Shell supplies credentials.
- Input / output:

| Member | Input | Output |
| --- | --- | --- |
| `ctx.appId` | — | the app id string |
| `ctx.appDir` | — | absolute directory of this app |
| `ctx.storage.kv().get(key)` | string key | stored JSON, or `null` when missing |
| `ctx.storage.kv().set(key, value)` | JSON-serialisable value | `void` |
| `ctx.storage.kv().delete(key)` | string key | `void` |
| `ctx.storage.kv().clear()` | — | `void`; clears only the `kv` table |
| `ctx.storage.query(sql, params?)` | one read statement | rows |
| `ctx.storage.run(sql, params?)` | one `INSERT`, `UPDATE`, `DELETE`, or `REPLACE` | `{ changes, lastInsertRowid }` |
| `ctx.storage.transaction(work)` | callback receives `tx` | the callback result |
| `ctx.state` | — | in-memory object from `defineApp` |
| `ctx.credentials.get(name)` | the owner's account name | that secret, or `undefined` when the name is absent |
| `ctx.config` | — | `{ theme, palette, locale, chatLanguage, hostPort, llm }` |
| `ctx.log(...args)` | any values | appended to that app's log file; returns nothing |
| `ctx.signal` | — | `AbortSignal` for this call, or absent |

- One SQLite file per app, at `storage/app.sqlite`. Host creates table `kv` (`key`, `value`). `value` is JSON text. `query` and `run` cannot name `kv`, and cannot `ATTACH`, `DETACH`, `load_extension`, or start their own transaction. A callback uses `tx`, not the outer `ctx.storage`.
- Settings and small values use `kv()`. Records that need a filter use tables and rows declared in `schema/NNN_name.sql`. A schema file may create or alter app tables, and may seed or rewrite app rows. Host applies those files when storage opens. `query` and `run` cannot create, drop, or alter tables, and must not stand in for a one-shot data migration that belongs in the next schema file.
- `ctx.config.theme` is `light`, `dark`, or `system`. `system` stays a preference. `ctx.config.llm` is `{ provider, model }` or `null`, mirroring the runtime provider's model default.
- Failure: a non-JSON `set` emits `storage-not-json`. A corrupt database file is quarantined and the call emits `storage-corrupt`. It is never replaced with an empty database. A schema stamp from another layout emits `storage-version` and leaves the file in place. SQL against `kv`, or a statement that leaves the file, emits `storage-forbidden`. A SQLite error emits `storage-sql`. Using `query` for a write, or `run` for a read, emits `storage-statement`. A result over the injected row cap emits `storage-too-large`. The cap is host policy and is not locked. A missing credential name is `undefined`; the app shows an empty state and does not invent a second name. An empty name emits `credential-invalid`. A credential file that cannot be read emits `credential-unreadable` and is not rewritten. Callers match the code. Codes: [implementation.md](../implementation.md).
- `ctx.log` appends one JSON object per line under `apps/<appId>/logs/`. The active name is `app.log`. Snapshots and file listings skip `logs`, so history does not commit it. A line is written whole. When the active file plus that line would pass the host segment size, the file is sealed first. A line longer than the segment is still one whole line in its own file. Past the host byte cap, the oldest sealed file is deleted and the newest file stays. A write does not read the log. The cap and the segment size are host policy and are not locked. There is no log table in the app database and no panel log viewer.
- Non-goals: a second database file; an engine argument; app-declared secrets; blocking writes when the file is large. An app reads a named secret; it cannot list or write one.

## Implementation


Role: definition for the ctx fields. Host provides storage, config, and `ctx.log`. The credential provider is one interface with a write side; `ctx.credentials` projects `get` alone. `createHostLog` appends one JSON line to `apps/<appId>/logs/app.log`. It seals the active file before a line would cross it, and deletes the oldest sealed file past the cap. A write does not read the log. `logs` is in the snapshot skip table. Shell injects a credential provider. `ctx.credentials` exposes `get` only. The author lists names through `mini_app_credential_list`. The SQLite file is the committed record. Quarantine renames the corrupt file and fails the call. It does not create a replacement. Plan: [implementation.md](../implementation.md).
