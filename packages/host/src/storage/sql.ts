import { StorageError } from './codes.ts'

/** Strip comments and string literals so keyword checks do not match quoted text. */
export function stripSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
}

/** The `kv` table the host owns. The check is the json contract behind `kv()`. */
export const KV_TABLE_SQL = [
  'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY,',
  'value TEXT NOT NULL CHECK (json_valid(value))) STRICT',
].join(' ')

/** The migration ledger the host owns. */
export const MIGRATIONS_TABLE_SQL = [
  'CREATE TABLE IF NOT EXISTS schema_migrations',
  '(id INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT',
].join(' ')

/** `sqlite_master` drops `IF NOT EXISTS` and quotes the name after a rename, so both stored forms compare equal. */
export function canonicalTableSql(sql: string): string {
  return sql
    .replace(/^CREATE TABLE IF (?:NOT )?EXISTS /i, 'CREATE TABLE ')
    .replace(/\s+/g, ' ')
    .replaceAll('"', '')
    .trim()
}

/** Runtime SQL may read or write rows. It may not change schema or touch host tables. */
export function assertRuntimeSql(sql: string): void {
  const bare = stripSql(sql).trim()
  assertHostTables(bare, 'storage-forbidden')
  if (!/^(select|insert|update|delete|replace|with)\b/i.test(bare)
    || /\b(create|drop|alter|pragma|vacuum|reindex|analyze|attach|detach|begin|commit|rollback|savepoint|release)\b/i.test(bare)
    || /\bload_extension\s*\(/i.test(bare)) {
    throw new StorageError('storage-forbidden', 'statement is not allowed')
  }
}

/** A schema file may change app tables and app rows, and may read and rewrite `kv` rows. Not the ledger, not the `kv` structure. */
export function assertMigrationSql(sql: string, name: string): void {
  const bare = stripSql(sql).trim()
  if (bare === '') {
    throw new StorageError('storage-migration', `schema file is empty: ${name}`)
  }
  if (/\bschema_migrations\b/i.test(bare)) {
    throw new StorageError('storage-migration', `schema file must not name schema_migrations: ${name}`)
  }
  if (/\b(?:create|drop|alter)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?["`\[]?kv\b/i.test(bare)
    || /\brename\s+to\s+["`\[]?kv\b/i.test(bare)) {
    throw new StorageError('storage-migration', `schema file must not change the kv table structure: ${name}`)
  }
  if (/\b(attach|detach|begin|commit|rollback|savepoint|release)\b/i.test(bare)
    || /\bload_extension\s*\(/i.test(bare)
    || /\bvacuum\s+into\b/i.test(bare)) {
    throw new StorageError('storage-migration', `schema file is not allowed: ${name}`)
  }
}

function assertHostTables(bare: string, code: 'storage-forbidden' | 'storage-migration'): void {
  if (/\b(kv|schema_migrations)\b/i.test(bare) || /["`\[](kv|schema_migrations)["`\]]/i.test(bare)) {
    throw new StorageError(code, 'host table is reserved')
  }
}
