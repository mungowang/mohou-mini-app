import { cp, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createEchoProvider } from '@mohou/runtime-provider'

import { createHost } from '../src/host/session.ts'

/**
 * Live smoke: copy com.mohou.pi-web into a temp runtime and ensure pi-web --no-open.
 * Skips when the source app or pi-web binary is missing.
 */
describe('pi-web website app', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('opens ensure, reaches ready, and closes the session', async () => {
    const source = join(homedir(), '.mini-app', 'runtime', 'apps', 'com.mohou.pi-web')
    try {
      await cp(source, join(tmpdir(), 'probe-pi-web-src'), { recursive: true })
      await rm(join(tmpdir(), 'probe-pi-web-src'), { recursive: true, force: true })
    } catch {
      return
    }
    // pi-web must be on PATH
    const { spawnSync } = await import('node:child_process')
    if (spawnSync('pi-web', ['--help'], { encoding: 'utf8' }).status !== 0) return

    const runtimeRoot = await mkdtemp(join(tmpdir(), 'mma-pi-web-'))
    roots.push(runtimeRoot)
    await cp(source, join(runtimeRoot, 'apps', 'com.mohou.pi-web'), { recursive: true })

    const host = await createHost({
      runtimeRoot,
      seed: {
        hostPort: 0,
        theme: 'system',
        palette: 'default',
        locale: 'en',
      },
      provider: createEchoProvider(),
      seedStartup: false,
    })
    try {
      await host.start()
      await host.owner.open('com.mohou.pi-web', 'Pi Web')
      let snapshot = host.author.websiteSnapshot('com.mohou.pi-web')
      const deadline = Date.now() + 45_000
      while (Date.now() < deadline && snapshot?.phase !== 'ready' && snapshot?.phase !== 'failing') {
        await new Promise(resolve => setTimeout(resolve, 250))
        snapshot = host.author.websiteSnapshot('com.mohou.pi-web')
      }
      if (snapshot?.phase === 'failing') {
        throw new Error(snapshot.error?.message ?? 'website ensure failed')
      }
      expect(snapshot?.phase).toBe('ready')
      expect(snapshot?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+/)
      await host.author.websiteContent('com.mohou.pi-web', 'load')
      await host.owner.websiteClose('com.mohou.pi-web')
      expect(host.author.websiteSnapshot('com.mohou.pi-web')).toBeUndefined()
    } finally {
      await host.dispose()
    }
  }, 60_000)
})
