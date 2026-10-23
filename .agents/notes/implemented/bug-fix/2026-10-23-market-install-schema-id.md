# Agent Note: Market install matches a schema id by number

Status: implemented

## Problem

`assertSchema` in `market/install.ts` matched an applied migration row by string prefix: `file.startsWith(`${row.id}_`)`. Schema files are `001_name.sql`, so the row id `1` never matched and every market install over an app with any applied migration failed with `applied schema file is missing: 1`. The two existing `market-schema` tests wrote a hand-made `1_init.sql`, a name that does not match the file rules the rest of the product states, so the suite passed against the bug.

## Decision

One parser owns the name. `schemaFileId(name)` in `storage/schema.ts` reads the leading number of a numbered migration name; `readSchema` and `assertSchema` both use it. The market check compares parsed numbers, so `001_` matches row `1`.

## Consequences

A package shipping a non-numbered schema file name no longer matches any row; that is the same rejection `readSchema` already gives. A market install over applied zero-padded migrations succeeds and applies new files on the next open.
