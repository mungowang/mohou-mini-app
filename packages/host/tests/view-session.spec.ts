import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AppId } from '@mohou/contract'

import { createSpawnRegistry } from '../src/process/spawn.ts'
import { createViewSessions } from '../src/process/view-session.ts'

describe('view sessions', () => {
  it('refcounts views and ephemerals; leave no-ops; concurrent end is once', async () => {
    const ended: string[] = []
    const sessions = createViewSessions({
      onEnd: async (appId) => {
        ended.push(appId)
        await new Promise(r => setTimeout(r, 20))
      },
    })
    const id = 'com.example.app' as AppId

    await expect(sessions.leave(id)).resolves.toEqual({ ended: false })
    await expect(sessions.endEphemeral(id)).resolves.toEqual({ ended: false })
    expect(sessions.sessionKind(id)).toBe('ephemeral')

    expect(sessions.enter(id)).toEqual({ kind: 'view', created: true })
    expect(sessions.enter(id)).toEqual({ kind: 'view', created: false })
    expect(sessions.hasView(id)).toBe(true)
    expect(sessions.sessionKind(id)).toBe('view')
    expect(sessions.viewCount(id)).toBe(2)

    sessions.beginEphemeral(id)
    expect(sessions.ephemeralCount(id)).toBe(1)
    expect(sessions.held(id)).toBe(true)

    await expect(sessions.leave(id)).resolves.toEqual({ ended: false })
    await expect(sessions.leave(id)).resolves.toEqual({ ended: false }) // ephemeral still holds
    expect(sessions.hasView(id)).toBe(false)
    expect(sessions.held(id)).toBe(true)

    await expect(sessions.endEphemeral(id)).resolves.toEqual({ ended: true })
    expect(ended).toEqual([id])
    expect(sessions.held(id)).toBe(false)

    // concurrent end while already ending
    sessions.enter(id)
    const first = sessions.end(id)
    const second = sessions.end(id)
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ended: true },
      { ended: false },
    ])
    expect(ended.filter(item => item === id).length).toBe(2)

    sessions.enter(id)
    sessions.beginEphemeral(id)
    await sessions.endAll()
    expect(sessions.held(id)).toBe(false)
  })

  it('sessionKind and multi-ephemeral leave without ending view', async () => {
    const ended: string[] = []
    const sessions = createViewSessions({
      onEnd: async (id) => {
        ended.push(id)
      },
    })
    const id = 'com.example.mix' as AppId
    expect(sessions.sessionKind(id)).toBe('ephemeral')
    sessions.beginEphemeral(id)
    sessions.beginEphemeral(id)
    expect(sessions.ephemeralCount(id)).toBe(2)
    sessions.enter(id)
    expect(sessions.sessionKind(id)).toBe('view')
    await expect(sessions.endEphemeral(id)).resolves.toEqual({ ended: false })
    await expect(sessions.endEphemeral(id)).resolves.toEqual({ ended: false })
    expect(sessions.hasView(id)).toBe(true)
    await expect(sessions.leave(id)).resolves.toEqual({ ended: true })
    expect(ended).toEqual([id])
  })
})

describe('spawn tags', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
  })

  it('disposeAppTagged leaves website children', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-spawn-tag-'))
    roots.push(root)
    const registry = createSpawnRegistry({
      cwd: process.cwd(),
      runtimeRoot: root,
      appId: 'com.example.tags',
    })
    try {
      const appChild = await registry.spawnApp(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      const webChild = await registry.spawnWebsite(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      expect(appChild.pid).toBeTypeOf('number')
      expect(webChild.pid).toBeTypeOf('number')
      await registry.disposeAppTagged()
      await registry.disposeWebsiteTagged()
    } finally {
      await registry.disposeAll()
    }
  })

  it('empty spawn file fails; collectedOutput skips empty rings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-spawn-empty-'))
    roots.push(root)
    const registry = createSpawnRegistry({
      cwd: process.cwd(),
      runtimeRoot: root,
      appId: 'com.example.empty',
    })
    try {
      await expect(registry.spawnApp('')).rejects.toMatchObject({ code: 'spawn-failed' })
      expect(registry.collectedOutput()).toBe('')
      expect(registry.collectedOutput('website')).toBe('')
    } finally {
      await registry.disposeAll()
    }
  })
})
