# Agent Note: `kv` row moves are schema files, host structure is not

Status: implemented

Supersedes the blanket "SQL against `kv`" non-goal in [storage.md](../../../../docs/product/host/storage.md) and the matching line in [decisions.md](../../../../docs/architecture/decisions.md).

## Problem

A schema file could not name `kv`, runtime SQL could not name `kv`, and the guides said a data migration is the next numbered SQL file. A move from `kv` to an app table was unreachable on every documented path: the rows lived behind `kv()`, which SQL cannot name, and the TS migration the work needed was the one thing the guides told the author not to write.

The blanket token check was text-level because the layer below had no finer tool: `better-sqlite3` does not expose the SQLite authorizer, and a regex cannot tell a read from a write across views, triggers, and CTEs. Deny-all was the only text rule that did not leak.

## Decision

The policy is split by what each host table is.

- `schema_migrations` is a ledger. A schema file never names it — token deny, as before.
- `kv` holds app rows. A schema file may read and rewrite `kv` rows, so a `kv`-to-table move is one numbered file. It must not create, drop, or alter `kv`, and runtime SQL still cannot name `kv`.

The json contract moved from text to engine: `kv` carries `CHECK (json_valid(value))`, so any write path that would strand a non-JSON value in `kv` fails inside the migration transaction. `kv().set` always writes `JSON.stringify`, so the API path never sees the check. An older `kv` table is rebuilt on open behind its rows; a legacy value that is not JSON fails the rebuild and the file is quarantined, not repaired.

Structure is enforced in two layers, because a regex cannot see indirection. Before the file runs, table DDL naming `kv` (create, drop, alter, rename-to) is rejected. After the file runs, inside its transaction, `sqlite_master` is verified: the `kv` and `schema_migrations` DDL is unchanged, and no persisted view, trigger, or index names `kv` — those would reach `kv` from runtime SQL that cannot name it. A hit rolls the file back and it stays pending.

## Alternatives considered

- Allow `kv` writes at runtime too. Lost: `kv()` is the one contract for those rows; raw SQL returns unparsed text, bypasses the size notice, and freezes the internal layout as a public contract.
- A host table function (a read-only `host_kv()`) instead of opening the table. Lost: another surface to define and guard for the one job a numbered file now does, and views over the function would need their own runtime guard.
- Keep deny-all and document a guarded TS migration channel. Lost: the migration is then split across two files, two failure modes, and no rollback covering the `kv` delete.

## Consequences

A view, trigger, or index that names `kv` fails the file that creates it; an app table column named `kv` in a view definition hits the same rule. An app that needs such a name gets the failure at apply time, not at runtime. The skill references in both shell skills now route a `kv`-to-table move to the next numbered file.
