import { closeSync, existsSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import Database from 'better-sqlite3'

import type { AppKeyValueTable, AppStorage, SqlParams, SqlRow, SqlValue } from '@mohou/contract'

import { StorageError } from './codes.ts'
import { storageDatabase, storageQuarantine } from './layout.ts'
import { applySchema } from './schema.ts'
import { KV_TABLE_SQL, MIGRATIONS_TABLE_SQL, assertRuntimeSql, canonicalTableSql } from './sql.ts'

/** A bound SQLite file. `connect` is what a call receives. `close` is host-only. */
export interface StorageFile {
  connect(options?: StorageConnect): AppStorage
  close(): void
  /** Host-only. Not `ctx.storage`. */
  listTables(): string[]
  /** Host-only export. `kv` values are parsed. */
  exportTable(name: string, maxRows: number): unknown[]
}

/** Per-call limits. The row cap is host policy and is not locked. */
export interface StorageConnect {
  readonly signal?: AbortSignal
  readonly maxRows?: number
}

/** Physical layout version. Stamped last. Any other stamp rejects. */
const SCHEMA_VERSION = 2

/** Bytes past which a committed write may emit one size notice. Host policy, not locked. */
export const DEFAULT_STORAGE_NOTICE_BYTES = 64 * 1024 * 1024

/** Host policy for the pre-migration snapshot. The number is not locked. */
export interface StorageOpenOptions {
  readonly backupMaxBytes?: number
  /** Emit one advisory notice after a committed write past this size. Not a locked number. */
  readonly noticeBytes?: number
  readonly onNotice?: (notice: { table: string; keys: string[] }) => void
}

/** How many heavy keys a size notice names. Host policy, not a locked number. */
const NOTICE_KEYS = 5

interface KvStatements {
  get: Database.Statement
  set: Database.Statement
  delete: Database.Statement
  clear: Database.Statement
}

interface Shared {
  db: Database.Database
  kv: KvStatements
  tail: Promise<void>
  depth: number
  noticeBytes?: number
  onNotice?: (notice: { table: string; keys: string[] }) => void
  lastNotice: string | undefined
}

/**
 * Open the app database from {@link storageLayout}, creating the reserved `kv` table.
 * A corrupt file is renamed aside. A later open does not create a replacement.
 * @param appDir - absolute app directory
 */
export async function openStorage(appDir: string, options?: StorageOpenOptions): Promise<StorageFile> {
  const file = storageDatabase(appDir)
  const marker = storageQuarantine(appDir)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  if (existsSync(marker)) {
    throw new StorageError('storage-corrupt', `storage file is quarantined: ${file}`)
  }
  ensurePrivateFile(file)
  const db = openDatabase(file, marker)
  try {
    await applySchema(db, appDir, options?.backupMaxBytes)
  } catch (error) {
    db.close()
    throw error
  }
  const shared: Shared = {
    db,
    kv: prepareKv(db),
    tail: Promise.resolve(),
    depth: 0,
    ...options?.noticeBytes === undefined ? {} : { noticeBytes: options.noticeBytes },
    ...options?.onNotice === undefined ? {} : { onNotice: options.onNotice },
    lastNotice: undefined,
  }
  return {
    connect(options) {
      return facade(shared, options)
    },
    close() {
      db.close()
    },
    listTables() {
      return listTables(db)
    },
    exportTable(name, maxRows) {
      return exportTable(db, name, maxRows)
    },
  }
}

function listTables(db: Database.Database): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>
  return rows.map(row => row.name)
}

function exportTable(db: Database.Database, name: string, maxRows: number): unknown[] {
  const tables = listTables(db)
  if (!tables.includes(name)) throw new StorageError('storage-forbidden', `table is not in this file: ${name}`)
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`).get() as { n: number }
  if (count.n > maxRows) throw new StorageError('storage-too-large', `table exceeds the host cap: ${name}`)
  const rows = db.prepare(`SELECT * FROM ${quoteIdent(name)}`).all() as Array<Record<string, unknown>>
  if (name !== 'kv') return rows
  return rows.map(row => ({
    key: row.key,
    value: parseKv(row.value),
  }))
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function parseKv(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function noteSize(shared: Shared, table: string): void {
  if (shared.noticeBytes === undefined || shared.onNotice === undefined) return
  try {
    const pages = shared.db.prepare('PRAGMA page_count').get() as { page_count: number }
    const size = shared.db.prepare('PRAGMA page_size').get() as { page_size: number }
    if (pages.page_count * size.page_size <= shared.noticeBytes) {
      shared.lastNotice = undefined
      return
    }
    const keys = heaviestKeys(shared.db, table)
    const signature = `${table}:${keys.join('\0')}`
    if (shared.lastNotice === signature) return
    shared.lastNotice = signature
    shared.onNotice({ table, keys })
  } catch {
    // A notice never fails the write that already committed.
  }
}

function heaviestKeys(db: Database.Database, table: string): string[] {
  if (table === 'kv') {
    const rows = db.prepare('SELECT key FROM kv ORDER BY length(value) DESC LIMIT ?').all(NOTICE_KEYS) as Array<{ key: string }>
    return rows.map(row => row.key)
  }
  const columns = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>
  if (columns.length === 0) return []
  const weight = columns.map(column => `length(CAST(${quoteIdent(column.name)} AS TEXT))`).join(' + ')
  const key = columns.some(column => column.name === 'id') ? quoteIdent('id') : 'rowid'
  const rows = db.prepare(`SELECT ${key} AS key FROM ${quoteIdent(table)} ORDER BY ${weight} DESC LIMIT ?`).all(NOTICE_KEYS) as Array<{ key: unknown }>
  return rows.map(row => String(row.key))
}

function writtenTable(sql: string): string | undefined {
  const match = /\b(?:into|update|table)\s+([A-Za-z0-9_]+)/.exec(sql)
  return match?.[1]
}

function ensurePrivateFile(file: string): void {
  try {
    closeSync(openSync(file, 'wx', 0o600))
  } catch (error) {
    if (!isCode(error, 'EEXIST')) throw error
  }
}

function openDatabase(file: string, marker: string): Database.Database {
  let db: Database.Database
  try {
    db = new Database(file)
  } catch (error) {
    if (isCorrupt(error)) {
      quarantine(file, marker)
      throw new StorageError('storage-corrupt', `storage file is corrupt: ${file}`, { cause: error })
    }
    throw error
  }
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    const check = db.prepare('PRAGMA quick_check').all() as Array<{ quick_check: string }>
    if (check.some(row => row.quick_check !== 'ok')) {
      throw new StorageError('storage-corrupt', `storage file is corrupt: ${file}`)
    }
    stampSchema(db)
    return db
  } catch (error) {
    if (db.open) db.close()
    if (error instanceof StorageError && error.code === 'storage-corrupt') {
      quarantine(file, marker)
      throw error
    }
    if (isCorrupt(error)) {
      quarantine(file, marker)
      throw new StorageError('storage-corrupt', `storage file is corrupt: ${file}`, { cause: error })
    }
    throw error
  }
}

function stampSchema(db: Database.Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version !== 0 && row.user_version !== 1 && row.user_version !== SCHEMA_VERSION) {
    throw new StorageError('storage-version', `storage schema version ${row.user_version} is not ${SCHEMA_VERSION}`)
  }
  upgradeKv(db)
  db.exec(MIGRATIONS_TABLE_SQL)
  if (row.user_version !== SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

/**
 * Keep `kv` on the host statement: rows written by an older layout are host-written json, so the copy holds.
 * A row that is not json fails the check, and the file is quarantined, not repaired.
 */
function upgradeKv(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'kv'").get() as { sql: string } | undefined
  if (row === undefined) {
    db.exec(KV_TABLE_SQL)
    return
  }
  if (canonicalTableSql(row.sql) === canonicalTableSql(KV_TABLE_SQL)) return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('CREATE TABLE kv_upgrade (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK (json_valid(value))) STRICT')
    db.exec('INSERT INTO kv_upgrade (key, value) SELECT key, value FROM kv')
    db.exec('DROP TABLE kv')
    db.exec('ALTER TABLE kv_upgrade RENAME TO kv')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw new StorageError('storage-corrupt', 'kv values must be json; the kv table was not upgraded', { cause: error })
  }
}

function prepareKv(db: Database.Database): KvStatements {
  return {
    get: db.prepare('SELECT value FROM kv WHERE key = ?'),
    set: db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    delete: db.prepare('DELETE FROM kv WHERE key = ?'),
    clear: db.prepare('DELETE FROM kv'),
  }
}

function quarantine(file: string, marker: string): void {
  const kept = `${file}.corrupt-${Date.now()}`
  renameSync(file, kept)
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${file}${suffix}`)) renameSync(`${file}${suffix}`, `${kept}${suffix}`)
  }
  writeFileSync(marker, kept)
}

function facade(shared: Shared, options?: StorageConnect): AppStorage {
  const signal = options?.signal
  const maxRows = options?.maxRows
  const tx: AppStorage = {
    kv: () => kv(shared, signal, true),
    query: (sql, params) => asPromise(() => queryNow(shared, signal, maxRows, sql, params)),
    run: (sql, params) => asPromise(() => runNow(shared, signal, sql, params)),
    transaction: work => savepoint(shared, signal, maxRows, work),
  }
  return {
    kv: () => kv(shared, signal, false),
    query: (sql, params) => enqueue(shared, signal, () => queryNow(shared, signal, maxRows, sql, params)),
    run: (sql, params) => enqueue(shared, signal, () => runNow(shared, signal, sql, params)),
    transaction: work => enqueue(shared, signal, () => inTransaction(shared, signal, tx, work)),
  }
}

function kv(shared: Shared, signal: AbortSignal | undefined, direct: boolean): AppKeyValueTable {
  const run = <T>(fn: () => T): Promise<T> => direct
    ? asPromise(fn)
    : enqueue(shared, signal, fn)
  return {
    get: key => run(() => readKey(shared, signal, key)),
    set: (key, value) => run(() => {
      writeKey(shared, signal, key, value)
      noteSize(shared, 'kv')
    }),
    delete: key => run(() => {
      assertLive(signal)
      shared.kv.delete.run(key)
      noteSize(shared, 'kv')
    }),
    clear: () => run(() => {
      assertLive(signal)
      shared.kv.clear.run()
      noteSize(shared, 'kv')
    }),
  }
}

function readKey(shared: Shared, signal: AbortSignal | undefined, key: string): unknown {
  assertLive(signal)
  const row = shared.kv.get.get(key) as { value: string } | undefined
  if (row === undefined) return null
  try {
    return JSON.parse(row.value) as unknown
  } catch (error) {
    throw new StorageError('storage-corrupt', `kv value is not JSON: ${key}`, { cause: error })
  }
}

function writeKey(shared: Shared, signal: AbortSignal | undefined, key: string, value: unknown): void {
  assertLive(signal)
  shared.kv.set.run(key, encode(value))
}

function queryNow(
  shared: Shared,
  signal: AbortSignal | undefined,
  maxRows: number | undefined,
  sql: string,
  params?: SqlParams,
): SqlRow[] {
  assertLive(signal)
  const stmt = prepare(shared, sql)
  if (!stmt.reader) {
    throw new StorageError('storage-statement', 'query expects a statement that returns rows')
  }
  const rows = bind(stmt, params).all() as SqlRow[]
  if (maxRows !== undefined && rows.length > maxRows) {
    throw new StorageError('storage-too-large', 'query returned too many rows')
  }
  return rows
}

function runNow(
  shared: Shared,
  signal: AbortSignal | undefined,
  sql: string,
  params?: SqlParams,
): { changes: number; lastInsertRowid: number | bigint } {
  assertLive(signal)
  const stmt = prepare(shared, sql)
  if (stmt.reader) {
    throw new StorageError('storage-statement', 'run expects a statement that does not return rows')
  }
  const info = bind(stmt, params).run()
  const table = writtenTable(sql)
  if (table !== undefined) noteSize(shared, table)
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
}

async function inTransaction<T>(
  shared: Shared,
  signal: AbortSignal | undefined,
  tx: AppStorage,
  work: (tx: AppStorage) => Promise<T>,
): Promise<T> {
  assertLive(signal)
  shared.depth += 1
  shared.db.exec('BEGIN IMMEDIATE')
  try {
    const value = await work(tx)
    shared.db.exec('COMMIT')
    return value
  } catch (error) {
    shared.db.exec('ROLLBACK')
    throw error
  } finally {
    shared.depth -= 1
  }
}

async function savepoint<T>(
  shared: Shared,
  signal: AbortSignal | undefined,
  maxRows: number | undefined,
  work: (tx: AppStorage) => Promise<T>,
): Promise<T> {
  assertLive(signal)
  const name = `sp_${shared.depth}`
  shared.depth += 1
  shared.db.exec(`SAVEPOINT ${name}`)
  const nested: AppStorage = {
    kv: () => kv(shared, signal, true),
    query: (sql, params) => asPromise(() => queryNow(shared, signal, maxRows, sql, params)),
    run: (sql, params) => asPromise(() => runNow(shared, signal, sql, params)),
    transaction: inner => savepoint(shared, signal, maxRows, inner),
  }
  try {
    const value = await work(nested)
    shared.db.exec(`RELEASE ${name}`)
    return value
  } catch (error) {
    shared.db.exec(`ROLLBACK TO ${name}`)
    shared.db.exec(`RELEASE ${name}`)
    throw error
  } finally {
    shared.depth -= 1
  }
}

function asPromise<T>(run: () => T): Promise<T> {
  try {
    return Promise.resolve(run())
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error('storage call failed'))
  }
}

function enqueue<T>(shared: Shared, signal: AbortSignal | undefined, run: () => T | Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(new StorageError('cancelled', 'storage call was cancelled'))
  if (shared.depth > 0) {
    return Promise.reject(new StorageError('storage-forbidden', 'use the transaction handle'))
  }
  const job = shared.tail.then(() => Promise.resolve(run()))
  shared.tail = job.then(() => undefined, () => undefined)
  return job
}

function prepare(shared: Shared, sql: string): Database.Statement {
  assertAllowed(sql)
  try {
    return shared.db.prepare(sql)
  } catch (error) {
    if (error instanceof RangeError && /more than one statement/i.test(error.message)) {
      throw new StorageError('storage-forbidden', 'only one statement is allowed', { cause: error })
    }
    throw new StorageError('storage-sql', error instanceof Error ? error.message : 'storage sql failed', { cause: error })
  }
}

function assertAllowed(sql: string): void {
  assertRuntimeSql(sql)
}

function bind(stmt: Database.Statement, params?: SqlParams): { all(): unknown[]; run(): Database.RunResult } {
  if (params === undefined) return { all: () => stmt.all(), run: () => stmt.run() }
  if (Array.isArray(params)) {
    const values = params.map(normalize)
    return { all: () => stmt.all(...values), run: () => stmt.run(...values) }
  }
  const named: Record<string, SqlValue> = {}
  for (const [key, value] of Object.entries(params)) named[key] = normalize(value)
  return { all: () => stmt.all(named), run: () => stmt.run(named) }
}

function normalize(value: SqlValue): SqlValue {
  if (typeof value !== 'object' || value === null || Buffer.isBuffer(value)) return value
  return Buffer.from(value)
}

function encode(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new StorageError('storage-not-json', 'storage value is not JSON')
  }
  try {
    return JSON.stringify(value)
  } catch (error) {
    throw new StorageError('storage-not-json', 'storage value is not JSON', { cause: error })
  }
}

function assertLive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new StorageError('cancelled', 'storage call was cancelled')
}

function isCorrupt(error: unknown): boolean {
  return isCode(error, 'SQLITE_NOTADB') || isCode(error, 'SQLITE_CORRUPT')
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
