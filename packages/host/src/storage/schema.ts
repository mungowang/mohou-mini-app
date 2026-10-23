import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'

import { appTrees } from '@mohou/contract'

import { StorageError } from './codes.ts'
import { storageBackup, storageBackupMeta, storageBlocked, storageDatabase, storageDir } from './layout.ts'
import { KV_TABLE_SQL, MIGRATIONS_TABLE_SQL, assertMigrationSql, canonicalTableSql, stripSql } from './sql.ts'

interface SchemaFile {
  id: number
  name: string
  checksum: string
  sql: string
}

interface Applied {
  id: number
  checksum: string
}

/**
 * Apply pending `schema/NNN_name.sql` files. One backup covers the batch.
 * A foreign checksum, a gap, or a blocked checksum fails before any new file runs.
 * @param db - open database with the host tables already stamped
 * @param appDir - app directory
 * @param backupMaxBytes - host cap; omitted means no byte cap
 */
export async function applySchema(db: Database.Database, appDir: string, backupMaxBytes?: number): Promise<void> {
  const files = readSchema(appDir)
  const applied = db.prepare('SELECT id, checksum FROM schema_migrations ORDER BY id').all() as Applied[]
  assertConsistent(files, applied)
  const pending = files.filter(file => !applied.some(row => row.id === file.id))
  if (pending.length === 0) return
  const blocked = readBlocked(appDir)
  const stopped = pending.find(file => blocked.has(file.checksum))
  if (stopped !== undefined) {
    throw new StorageError('storage-migration', `schema file is blocked, write a new file: ${stopped.name}`)
  }
  const first = pending[0]
  if (first === undefined) return
  assertBackupFits(db, backupMaxBytes)
  await writeBackup(db, appDir, first.id)
  const appliedThisBatch: string[] = []
  for (const [index, file] of pending.entries()) {
    try {
      runFile(db, file)
    } catch (error) {
      const done = appliedThisBatch.length === 0
        ? 'no schema file in this batch was applied'
        : `applied ${appliedThisBatch.join(', ')}`
      const rest = pending.slice(index + 1).map(item => item.name)
      const stopped = rest.length === 0 ? '' : ` Later files were not started: ${rest.join(', ')}.`
      throw new StorageError(
        'storage-migration',
        `${done}. ${file.name} was not applied and will run again after it is fixed.${stopped}`,
        { cause: error },
      )
    }
    appliedThisBatch.push(file.name)
  }
}

/**
 * Replace the database with the latest pre-migration snapshot and block the
 * checksums applied after that snapshot. The caller must close the live handle first.
 * @param appDir - app directory
 */
export function restoreStorageBackup(appDir: string): void {
  const metaPath = storageBackupMeta(appDir)
  const backupPath = storageBackup(appDir)
  if (!existsSync(metaPath) || !existsSync(backupPath)) {
    throw new StorageError('storage-migration', 'no schema backup to restore')
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { beforeId?: number }
  if (meta.beforeId === undefined) {
    throw new StorageError('storage-migration', 'schema backup is missing beforeId')
  }
  const live = storageDatabase(appDir)
  const db = new Database(live)
  let checksums: string[] = []
  try {
    checksums = (db.prepare('SELECT checksum FROM schema_migrations WHERE id >= ?').all(meta.beforeId) as Applied[])
      .map(row => row.checksum)
  } finally {
    db.close()
  }
  writeBlocked(appDir, checksums)
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${live}${suffix}`, { force: true })
  copyFileSync(backupPath, live)
}

/** The leading number of a schema file name; `undefined` when the name is not a numbered migration. */
export function schemaFileId(name: string): number | undefined {
  const match = /^(\d+)_.+\.sql$/.exec(name)
  return match === null ? undefined : Number(match[1])
}

function readSchema(appDir: string): SchemaFile[] {
  const dir = join(appDir, appTrees.schema)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).flatMap((name) => {
    const id = schemaFileId(name)
    if (id === undefined) {
      throw new StorageError('storage-migration', `schema file name is not a numbered migration: ${name}`)
    }
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new StorageError('storage-migration', `schema file id is invalid: ${name}`)
    }
    const sql = readFileSync(join(dir, name))
    return [{ id, name, sql: sql.toString('utf8'), checksum: createHash('sha256').update(sql).digest('hex') }]
  }).sort((left, right) => left.id - right.id)
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (file === undefined || file.id !== index + 1) {
      throw new StorageError('storage-migration', 'schema file ids must be contiguous from 1')
    }
  }
  return files
}

function assertConsistent(files: SchemaFile[], applied: Applied[]): void {
  for (const row of applied) {
    const file = files.find(item => item.id === row.id)
    if (file === undefined) {
      throw new StorageError('storage-migration', `applied schema file is missing: ${row.id}`)
    }
    if (file.checksum !== row.checksum) {
      throw new StorageError('storage-migration', `applied schema file changed: ${file.name}; write a new file`)
    }
  }
}

function assertBackupFits(db: Database.Database, backupMaxBytes: number | undefined): void {
  if (backupMaxBytes === undefined) return
  const pageSize = db.prepare('PRAGMA page_size').get() as { page_size: number }
  const pageCount = db.prepare('PRAGMA page_count').get() as { page_count: number }
  if (pageSize.page_size * pageCount.page_count > backupMaxBytes) {
    throw new StorageError('storage-backup-too-large', 'schema backup would exceed the host cap')
  }
}

async function writeBackup(db: Database.Database, appDir: string, beforeId: number): Promise<void> {
  const dir = storageDir(appDir)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  await db.backup(storageBackup(appDir))
  writeFileSync(storageBackupMeta(appDir), JSON.stringify({ beforeId }))
}

function runFile(db: Database.Database, file: SchemaFile): void {
  assertMigrationSql(file.sql, file.name)
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(file.sql)
    assertHostTablesIntact(db, file)
    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)').run(file.id, file.checksum)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (error instanceof StorageError) throw error
    throw new StorageError('storage-migration', `schema file failed: ${file.name}`, { cause: error })
  }
}

/**
 * A view, trigger, or virtual table that names a host table would reach it at runtime, where the runtime guard
 * cannot see the indirection. Check after the file runs, inside the transaction, so a hit rolls the file back.
 */
function assertHostTablesIntact(db: Database.Database, file: SchemaFile): void {
  for (const [name, ddl] of [['kv', KV_TABLE_SQL], ['schema_migrations', MIGRATIONS_TABLE_SQL]] as const) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { sql: string } | undefined
    if (row === undefined || canonicalTableSql(row.sql) !== canonicalTableSql(ddl)) {
      throw new StorageError('storage-migration', `schema file must not change the host table: ${name} (${file.name})`)
    }
  }
  const objects = db.prepare('SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL').all() as Array<{ name: string; type: string; sql: string }>
  for (const object of objects) {
    if (object.name === 'kv' || object.name === 'schema_migrations') continue
    if (object.type === 'table' && !/^CREATE\s+VIRTUAL\s+TABLE/i.test(object.sql)) continue
    if (/\b(?:kv|schema_migrations)\b/i.test(stripSql(object.sql))) {
      throw new StorageError('storage-migration', `schema file must not add ${object.type} ${object.name} over a host table (${file.name})`)
    }
  }
}

function readBlocked(appDir: string): Set<string> {
  const path = storageBlocked(appDir)
  if (!existsSync(path)) return new Set()
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('checksums' in parsed) || !Array.isArray(parsed.checksums)) {
    throw new StorageError('storage-migration', 'blocked schema list is invalid')
  }
  return new Set(parsed.checksums.filter((item): item is string => typeof item === 'string'))
}

function writeBlocked(appDir: string, checksums: string[]): void {
  const path = storageBlocked(appDir)
  const next = [...readBlocked(appDir), ...checksums]
  writeFileSync(path, JSON.stringify({ checksums: [...new Set(next)] }))
}
