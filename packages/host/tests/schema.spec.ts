import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { openStorage, restoreStorageBackup, storageDatabase } from '../src/index.ts'

function dir() {
  return mkdtempSync(join(tmpdir(), 'mma-schema-'))
}

function write(root: string, name: string, sql: string) {
  mkdirSync(join(root, 'schema'), { recursive: true })
  writeFileSync(join(root, 'schema', name), sql)
}

describe('schema files', () => {
  it('applies a new file once and rejects an edit before later files run', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY, label TEXT)')
    const first = await openStorage(root)
    await first.connect().run('INSERT INTO notes (label) VALUES (?)', ['kept'])
    first.close()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY, label TEXT);\n')
    write(root, '002_more.sql', 'CREATE TABLE extra (id INTEGER PRIMARY KEY)')
    await expect(openStorage(root)).rejects.toMatchObject({ code: 'storage-migration' })
    const raw = new Database(storageDatabase(root))
    expect(raw.prepare('SELECT label FROM notes').all()).toEqual([{ label: 'kept' }])
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").all()).toEqual([])
    raw.close()
  })

  it('rolls back a failed file and runs it again after the fix', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY, label TEXT)')
    const first = await openStorage(root)
    await first.connect().run('INSERT INTO notes (label) VALUES (?)', ['kept'])
    first.close()
    write(root, '002_bad.sql', "INSERT INTO notes (label) VALUES ('dirty');\nNOT SQL;")
    write(root, '003_later.sql', 'CREATE TABLE later (id INTEGER PRIMARY KEY)')
    await expect(openStorage(root)).rejects.toThrow(/002_bad.sql was not applied and will run again/)
    await expect(openStorage(root)).rejects.toThrow(/003_later.sql/)
    const raw = new Database(storageDatabase(root))
    expect(raw.prepare('SELECT label FROM notes').all()).toEqual([{ label: 'kept' }])
    expect(raw.prepare('SELECT id FROM schema_migrations WHERE id >= 2').all()).toEqual([])
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'later'").all()).toEqual([])
    raw.close()
    write(root, '002_bad.sql', 'CREATE TABLE extra (id INTEGER PRIMARY KEY)')
    const second = await openStorage(root)
    expect(await second.connect().query("SELECT name FROM sqlite_master WHERE name = 'extra'")).toEqual([{ name: 'extra' }])
    expect(await second.connect().query("SELECT name FROM sqlite_master WHERE name = 'later'")).toEqual([{ name: 'later' }])
    second.close()
  })

  it('restores the backup and does not rerun the blocked file', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY, label TEXT)')
    const first = await openStorage(root)
    await first.connect().run('INSERT INTO notes (label) VALUES (?)', ['kept'])
    first.close()
    write(root, '002_wipe.sql', 'DELETE FROM notes')
    const second = await openStorage(root)
    expect(await second.connect().query('SELECT count(*) AS n FROM notes')).toEqual([{ n: 0 }])
    second.close()
    restoreStorageBackup(root)
    const raw = new Database(storageDatabase(root))
    expect(raw.prepare('SELECT label FROM notes').all()).toEqual([{ label: 'kept' }])
    raw.close()
    await expect(openStorage(root)).rejects.toMatchObject({ code: 'storage-migration' })
  })

  it('refuses to copy when the host cap is exceeded', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    await expect(openStorage(root, { backupMaxBytes: 1 })).rejects.toMatchObject({ code: 'storage-backup-too-large' })
    const opened = await openStorage(root)
    expect(await opened.connect().query("SELECT name FROM sqlite_master WHERE name = 'notes'")).toEqual([{ name: 'notes' }])
    opened.close()
    const capped = dir()
    write(capped, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const fitted = await openStorage(capped, { backupMaxBytes: 50_000_000 })
    expect(await fitted.connect().query("SELECT name FROM sqlite_master WHERE name = 'notes'")).toEqual([{ name: 'notes' }])
    fitted.close()
  })

  it('rejects a broken schema list before any new file runs', async () => {
    const bare = await openStorage(dir())
    bare.close()
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    write(root, '003_skip.sql', 'CREATE TABLE skipped (id INTEGER PRIMARY KEY)')
    await expect(openStorage(root)).rejects.toThrow(/contiguous from 1/)
    const named = dir()
    write(named, 'notes.txt', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    await expect(openStorage(named)).rejects.toThrow(/not a numbered migration/)
    const zero = dir()
    write(zero, '000_bad.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    await expect(openStorage(zero)).rejects.toThrow(/id is invalid/)
    const applied = dir()
    write(applied, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const live = await openStorage(applied)
    live.close()
    rmSync(join(applied, 'schema', '001_init.sql'))
    await expect(openStorage(applied)).rejects.toThrow(/applied schema file is missing: 1/)
  })

  it('names the files that ran and the file that must be fixed', async () => {
    const last = dir()
    write(last, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const opened = await openStorage(last)
    opened.close()
    write(last, '002_bad.sql', 'NOT SQL')
    const failed = await openStorage(last).then(() => '', (error: unknown) => error instanceof Error ? error.message : '')
    expect(failed).toMatch(/002_bad.sql was not applied/)
    expect(failed).not.toMatch(/Later files were not started/)
    const mid = dir()
    write(mid, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const first = await openStorage(mid)
    first.close()
    write(mid, '002_ok.sql', 'CREATE TABLE extra (id INTEGER PRIMARY KEY)')
    write(mid, '003_bad.sql', 'NOT SQL')
    await expect(openStorage(mid)).rejects.toThrow(/applied 002_ok.sql/)
    const raw = new Database(storageDatabase(mid))
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").all()).toEqual([{ name: 'extra' }])
    raw.close()
    const empty = dir()
    write(empty, '001_init.sql', '   ')
    await expect(openStorage(empty)).rejects.toThrow(/001_init.sql was not applied/)
    const begun = dir()
    write(begun, '001_init.sql', 'BEGIN')
    await expect(openStorage(begun)).rejects.toThrow(/001_init.sql was not applied/)
  })

  it('refuses a corrupt block list and a backup with no beforeId', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const opened = await openStorage(root)
    opened.close()
    write(root, '002_more.sql', 'CREATE TABLE extra (id INTEGER PRIMARY KEY)')
    mkdirSync(join(root, 'storage'), { recursive: true })
    writeFileSync(join(root, 'storage', 'blocked.json'), '{ "nope": true }\n')
    await expect(openStorage(root)).rejects.toThrow(/blocked schema list is invalid/)
    const other = dir()
    write(other, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const live = await openStorage(other)
    live.close()
    mkdirSync(join(other, 'storage'), { recursive: true })
    writeFileSync(join(other, 'storage', 'backup.sqlite'), '')
    writeFileSync(join(other, 'storage', 'backup.json'), '{}\n')
    expect(() => {
      restoreStorageBackup(other)
    }).toThrow(/missing beforeId/)
    const none = dir()
    expect(() => {
      restoreStorageBackup(none)
    }).toThrow(/no schema backup/)
  })

  it('moves kv rows into an app table from a schema file', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE settings (key TEXT PRIMARY KEY, a INTEGER)')
    const first = await openStorage(root)
    await first.connect().kv().set('one', { a: 1 })
    first.close()
    write(root, '002_move.sql', "INSERT INTO settings (key, a) SELECT key, json_extract(value, '$.a') FROM kv WHERE key = 'one'; DELETE FROM kv WHERE key = 'one'")
    const second = await openStorage(root)
    expect(await second.connect().query('SELECT key, a FROM settings')).toEqual([{ key: 'one', a: 1 }])
    expect(await second.connect().kv().get('one')).toBeNull()
    second.close()
  })

  it('refuses a schema file that changes or reaches the host tables', async () => {
    const cases = [
      'CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT',
      'DROP TABLE kv',
      'ALTER TABLE kv ADD COLUMN extra TEXT',
      'CREATE TABLE notes (id INTEGER PRIMARY KEY); ALTER TABLE notes RENAME TO kv',
      'CREATE INDEX settings_key ON kv (key)',
      'CREATE TRIGGER kv_log AFTER INSERT ON kv BEGIN INSERT INTO kv VALUES (1, 2); END',
      'CREATE VIEW settings_view AS SELECT key FROM kv',
      'CREATE TABLE notes (id INTEGER PRIMARY KEY); CREATE TRIGGER notes_log AFTER INSERT ON notes BEGIN INSERT INTO kv VALUES (1, 2); END',
      'INSERT INTO schema_migrations (id, checksum) VALUES (9, 9)',
      'SELECT * FROM schema_migrations',
      "INSERT INTO kv VALUES ('bad', 'not json')",
    ]
    for (const [index, sql] of cases.entries()) {
      const root = dir()
      write(root, '001_init.sql', sql)
      await expect(openStorage(root), `case ${index}: ${sql}`).rejects.toMatchObject({ code: 'storage-migration' })
      const raw = new Database(storageDatabase(root))
      expect(raw.prepare('SELECT key FROM kv').all(), `case ${index}: ${sql}`).toEqual([])
      expect(raw.prepare('SELECT id FROM schema_migrations').all(), `case ${index}: ${sql}`).toEqual([])
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('kv', 'schema_migrations')").all(), `case ${index}: ${sql}`).toEqual([])
      raw.close()
    }
  })

  it('rebuilds a kv table from an older layout and quarantines a value that is not json', async () => {
    const root = dir()
    write(root, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const first = await openStorage(root)
    first.close()
    const raw = new Database(storageDatabase(root))
    raw.exec('DROP TABLE kv')
    raw.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
    raw.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('one', JSON.stringify({ a: 1 }))
    raw.close()
    const second = await openStorage(root)
    expect(await second.connect().kv().get('one')).toEqual({ a: 1 })
    second.close()
    const check = new Database(storageDatabase(root))
    expect((check.prepare("SELECT sql FROM sqlite_master WHERE name = 'kv'").get() as { sql: string }).sql).toMatch(/json_valid/)
    check.close()
    const broken = dir()
    write(broken, '001_init.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    const third = await openStorage(broken)
    third.close()
    const rawBroken = new Database(storageDatabase(broken))
    rawBroken.exec('DROP TABLE kv')
    rawBroken.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
    rawBroken.prepare("INSERT INTO kv (key, value) VALUES ('bad', 'not json')").run()
    rawBroken.close()
    await expect(openStorage(broken)).rejects.toMatchObject({ code: 'storage-corrupt' })
    expect(existsSync(storageDatabase(broken))).toBe(false)
  })
})
