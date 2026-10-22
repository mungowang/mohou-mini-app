import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  forceKillTree,
  readWebsiteSpawnLedger,
  reclaimWebsiteSpawns,
  trackWebsiteSpawn,
  untrackWebsiteSpawn,
} from '../src/website/spawn-ledger.ts'
import { createSpawnRegistry } from '../src/website/spawn.ts'

describe('website spawn ledger', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('tracks and untracks pids on disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ledger-'))
    roots.push(root)
    await trackWebsiteSpawn(root, 4242)
    await trackWebsiteSpawn(root, 4242)
    await trackWebsiteSpawn(root, 0)
    await trackWebsiteSpawn(root, -1)
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([4242])
    await untrackWebsiteSpawn(root, 4242)
    await untrackWebsiteSpawn(root, 99999)
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([])
    expect((await reclaimWebsiteSpawns(root)).reaped).toEqual([])
  })

  it('forceKillTree no-ops on invalid pids and tolerates a dead pid', () => {
    expect(forceKillTree(0)).toBe(false)
    expect(forceKillTree(-3)).toBe(false)
    expect(forceKillTree(999_999_999)).toBe(true)
  })

  it('treats a missing or corrupt ledger as empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ledger-bad-'))
    roots.push(root)
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([])
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'website-spawns.json'), '{not-json')
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([])
    await writeFile(join(root, 'website-spawns.json'), '{"pids":["x",0,12.5,7]}')
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([7])
  })

  it('reclaims a leftover live process from a prior run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-reap-'))
    roots.push(root)
    const registry = createSpawnRegistry({ cwd: process.cwd(), runtimeRoot: root })
    const child = await registry.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    const pid = child.pid
    expect(pid).toEqual(expect.any(Number))
    if (pid === undefined) throw new Error('pid missing')
    // Simulate crash: drop the in-memory registry without dispose, leave the ledger.
    expect((await readWebsiteSpawnLedger(root)).pids).toContain(pid)

    const reaped = await reclaimWebsiteSpawns(root)
    expect(reaped.reaped).toContain(pid)
    expect((await readWebsiteSpawnLedger(root)).pids).toEqual([])
    // Process should be gone (or going).
    await child.exited
  })
})
