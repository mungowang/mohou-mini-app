import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  forceKillTree,
  readAppSpawnLedger,
  reclaimAppSpawns,
  trackAppSpawn,
  untrackAppSpawn,
} from '../src/process/spawn-ledger.ts'
import { createSpawnRegistry } from '../src/process/spawn.ts'

describe('website spawn ledger', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('tracks and untracks pids on disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ledger-'))
    roots.push(root)
    await trackAppSpawn(root, { pid: 4242, appId: 'com.x', tag: 'app' })
    await trackAppSpawn(root, { pid: 4242, appId: 'com.x', tag: 'app' })
    await trackAppSpawn(root, { pid: 0, appId: 'com.x', tag: 'app' })
    await trackAppSpawn(root, { pid: -1, appId: 'com.x', tag: 'app' })
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([4242])
    await untrackAppSpawn(root, 4242)
    await untrackAppSpawn(root, 99999)
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([])
    expect((await reclaimAppSpawns(root)).reaped).toEqual([])
  })

  it('forceKillTree no-ops on invalid pids and tolerates a dead pid', () => {
    expect(forceKillTree(0)).toBe(false)
    expect(forceKillTree(-3)).toBe(false)
    expect(forceKillTree(999_999_999)).toBe(true)
  })

  it('treats a missing or corrupt ledger as empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ledger-bad-'))
    roots.push(root)
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([])
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'app-spawns.json'), '{not-json')
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([])
    await writeFile(join(root, 'app-spawns.json'), JSON.stringify({
      entries: [
        { pid: 'x' },
        { pid: 0, appId: 'a', tag: 'app' },
        { pid: 7, appId: 'a', tag: 'website' },
      ],
    }))
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([7])
  })

  it('reclaims legacy website-spawns.json pids and normalizes odd shapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-legacy-ledger-'))
    roots.push(root)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'website-spawns.json'), JSON.stringify({ pids: [0, 'x', 12.5, 888_888_888] }))
    await writeFile(join(root, 'app-spawns.json'), JSON.stringify({
      entries: [
        null,
        { pid: 1 },
        { pid: 2, appId: '', tag: 'app' },
        { pid: 3, appId: 'a', tag: 'nope' },
        { pid: 3, appId: 'a', tag: 'website' },
      ],
      pids: [9],
    }))
    const reaped = await reclaimAppSpawns(root)
    expect(reaped.reaped).toEqual(expect.arrayContaining([888_888_888, 3]))
    expect((await readAppSpawnLedger(root)).entries).toEqual([])
    // Non-object ledger body
    await writeFile(join(root, 'app-spawns.json'), '[]')
    expect((await readAppSpawnLedger(root)).entries).toEqual([])
    await writeFile(join(root, 'app-spawns.json'), JSON.stringify({ pids: [5, 5, 0] }))
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([5])
  })

  it('reclaims a leftover live process from a prior run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-reap-'))
    roots.push(root)
    const registry = createSpawnRegistry({ cwd: process.cwd(), runtimeRoot: root, appId: 'com.example.reap' })
    const child = await registry.spawnWebsite(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    const pid = child.pid
    expect(pid).toEqual(expect.any(Number))
    if (pid === undefined) throw new Error('pid missing')
    // Simulate crash: drop the in-memory registry without dispose, leave the ledger.
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toContain(pid)

    const reaped = await reclaimAppSpawns(root)
    expect(reaped.reaped).toContain(pid)
    expect((await readAppSpawnLedger(root)).entries.map(e => e.pid)).toEqual([])
    // Process should be gone (or going).
    await child.exited
  })
})
