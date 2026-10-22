import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AppId } from '@mohou/contract'

import { createAppEvents } from '../src/events/app-events.ts'
import type { CallCapabilities } from '../src/kernel/call.ts'
import { createWebsiteSessions } from '../src/website/session.ts'

describe('website sessions', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
  })

  it('refresh failure and dispose hook errors stay contained', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-rf-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)
    const appId = 'com.example.rf' as AppId
    const logs: string[] = []
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => fakeCapabilities(appDir),
      pushSnapshot: () => undefined,
      log: (_id, message) => {
        logs.push(message)
      },
    })
    try {
      await sessions.ensure({
        appId,
        defaultUrl: 'http://example.test/',
        appDir,
        driver: {
          async ensure() {
            return { url: 'http://example.test/' }
          },
          async refresh() {
            throw new Error('refresh blew')
          },
          async dispose() {
            throw new Error('dispose blew')
          },
          content: {
            async onLoad() {
              throw new Error('load blew')
            },
          },
        },
      })
      const failed = await sessions.refresh(appId)
      expect(failed.phase).toBe('failing')
      // retry from failing re-runs ensure
      const ok = await sessions.retry(appId)
      expect(ok.phase).toBe('ready')
      await sessions.content(appId, 'load')
      await sessions.dispose(appId)
      expect(logs.some(line => line.includes('refresh'))).toBe(true)
      expect(logs.some(line => line.includes('dispose') || line.includes('content'))).toBe(true)
    } finally {
      await sessions.disposeAll()
    }
  })

  it('refresh without a hook and content while ensuring are safe', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-plain-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)
    const appId = 'com.example.plain' as AppId
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => fakeCapabilities(appDir),
      pushSnapshot: () => undefined,
      log: () => undefined,
    })
    try {
      const snap = await sessions.ensure({
        appId,
        defaultUrl: 'http://example.test/',
        appDir,
        driver: {
          async ensure() {
            // pure remote url, no spawn
          },
        },
      })
      expect(snap).toMatchObject({ phase: 'ready', url: 'http://example.test/' })
      const refreshed = await sessions.refresh(appId)
      expect(refreshed.generation).toBeGreaterThan(snap.generation)
      await sessions.disposeAll()
      expect(await sessions.retry(appId)).toMatchObject({
        phase: 'failing',
        error: { code: 'website-no-session' },
      })
    } finally {
      await sessions.disposeAll()
    }
  })

  it('maps SpawnError and non-Error throws onto snapshot.error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-codes-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)
    const appId = 'com.example.codes' as AppId
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => fakeCapabilities(appDir),
      pushSnapshot: () => undefined,
      log: () => undefined,
    })
    try {
      const { SpawnError } = await import('../src/process/spawn.ts')
      const spawnFail = await sessions.ensure({
        appId,
        defaultUrl: 'http://example.test/',
        appDir,
        driver: {
          async ensure() {
            throw new SpawnError('spawn-failed', 'no bin')
          },
        },
      })
      expect(spawnFail.error).toMatchObject({ code: 'spawn-failed', message: 'no bin' })
      await sessions.dispose(appId)

      const plain = await sessions.ensure({
        appId,
        defaultUrl: 'http://example.test/',
        appDir,
        driver: {
          async ensure() {
            throw 'plain-string'
          },
        },
      })
      expect(plain.phase).toBe('failing')
      expect(plain.error?.message).toBe('failed')
      await sessions.dispose(appId)
    } finally {
      await sessions.disposeAll()
    }
  })

  it('ensure failure leaves a failing snapshot and retry recovers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-fail-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)
    const appId = 'com.example.fail' as AppId
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => fakeCapabilities(appDir),
      pushSnapshot: () => undefined,
      log: () => undefined,
    })
    try {
      let attempts = 0
      const snap = await sessions.ensure({
        appId,
        defaultUrl: 'http://127.0.0.1:9',
        appDir,
        driver: {
          async ensure() {
            attempts += 1
            if (attempts === 1) throw new Error('boot failed')
          },
        },
      })
      expect(snap.phase).toBe('failing')
      const recovered = await sessions.retry(appId)
      expect(recovered.phase).toBe('ready')
      expect(attempts).toBe(2)
      await sessions.dispose(appId)
    } finally {
      await sessions.disposeAll()
    }
  })

  it('ensure spawns, becomes ready, dispose ends session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)

    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const url = `http://127.0.0.1:${address.port}`

    const appEvents = createAppEvents({ tailLength: 20 })
    const appId = 'com.example.site' as AppId
    const { createSpawnRegistry } = await import('../src/process/spawn.ts')
    const registry = createSpawnRegistry({ cwd: appDir, runtimeRoot: root, appId })
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => ({
        ...fakeCapabilities(appDir),
        spawn: (file, args, options) => registry.spawnWebsite(file, args, options),
      }),
      disposeWebsiteSpawns: () => registry.disposeWebsiteTagged(),
      pushSnapshot: (_id, snapshot) => {
        appEvents.push(appId, sessions.snapshotEvent, snapshot)
      },
      log: () => undefined,
    })

    try {
      const snap = await sessions.ensure({
        appId,
        defaultUrl: url,
        appDir,
        driver: {
          async ensure(ctx) {
            if (ctx.spawn === undefined) throw new Error('spawn missing')
            const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
            await child.ready({ url, timeoutMs: 5_000 })
            return { url }
          },
          content: {
            async onLoad() {
              // path C hook
            },
          },
        },
      })
      expect(snap.phase).toBe('ready')
      expect(snap.url).toBe(url)
      expect(snap.generation).toBeGreaterThan(0)

      await sessions.content(appId, 'load')
      await sessions.content(appId, 'document-idle')
      await sessions.content(appId, 'load-failed', 'boom')

      const refreshed = await sessions.refresh(appId)
      expect(refreshed.phase).toBe('ready')
      expect(refreshed.generation).toBeGreaterThan(snap.generation)

      // Second ensure keeps the session and swaps the driver pointer.
      const again = await sessions.ensure({
        appId,
        defaultUrl: url,
        appDir,
        driver: {
          async ensure() {
            return { url }
          },
          async refresh(_ctx, current) {
            return { url: current.url }
          },
          async dispose() {
            // path C dispose
          },
        },
      })
      expect(again.phase).toBe('ready')

      await sessions.dispose(appId)
      await registry.disposeAll()
      expect(sessions.get(appId)).toBeUndefined()
      expect(await sessions.refresh(appId)).toMatchObject({
        phase: 'failing',
        error: { code: 'website-no-session' },
      })
    } finally {
      await sessions.disposeAll()
      await registry.disposeAll()
      appEvents.dispose()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  })
  it('attaches spawn output as error.detail on ensure failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-website-detail-'))
    roots.push(root)
    const appDir = join(root, 'app')
    await mkdir(appDir)
    const appId = 'com.example.detail' as AppId
    const { createSpawnRegistry } = await import('../src/process/spawn.ts')
    const registry = createSpawnRegistry({ cwd: appDir, runtimeRoot: root, appId })
    let lastOutput = ''
    const sessions = createWebsiteSessions({
      runtimeRoot: root,
      buildCapabilities: () => ({
        ...fakeCapabilities(appDir),
        spawn: async (file, args, options) => {
          const handle = await registry.spawnWebsite(file, args, options)
          return handle
        },
      }),
      disposeWebsiteSpawns: async () => {
        lastOutput = registry.collectedOutput('website')
        await registry.disposeWebsiteTagged()
      },
      websiteOutput: () => lastOutput || registry.collectedOutput('website'),
      pushSnapshot: () => undefined,
      log: () => undefined,
    })
    try {
      const snap = await sessions.ensure({
        appId,
        defaultUrl: 'http://127.0.0.1:9',
        appDir,
        driver: {
          async ensure(ctx) {
            const child = await ctx.spawn(process.execPath, [
              '-e',
              'process.stderr.write("pi-web blew up\\n"); setInterval(() => {}, 1000)',
            ])
            await new Promise(r => setTimeout(r, 80))
            await child.ready({ url: 'http://127.0.0.1:9', timeoutMs: 400 })
          },
        },
      })
      expect(snap.phase).toBe('failing')
      expect(snap.error?.code).toMatch(/spawn-ready-timeout|website-ensure-failed/)
      expect(snap.error?.detail ?? '').toMatch(/blew up|stderr/)
    } finally {
      await sessions.disposeAll()
      await registry.disposeAll()
    }
  })

})

function fakeCapabilities(appDir: string): CallCapabilities {
  return {
    appId: 'com.example.site' as AppId,
    appDir,
    state: {},
    storage: {
      kv: () => ({
        get: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
        clear: async () => undefined,
      }),
      query: async () => [],
      run: async () => ({ changes: 0, lastInsertRowid: 0 }),
      transaction: async work => work(fakeCapabilities(appDir).storage),
    },
    credentials: {
      get: async () => undefined,
      list: async () => [],
      put: async () => undefined,
      remove: async () => undefined,
      writable: true,
    },
    config: {
      theme: 'system',
      palette: 'default',
      locale: 'en',
      chatLanguage: 'en',
      hostPort: 1,
      llm: null,
    },
    log: () => undefined,
    push: () => undefined,
    http: async () => ({ ok: true, status: 200, headers: {}, text: '', json: null }),
    bash: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    pwsh: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    metrics: async () => ({
      platform: 'test',
      arch: 'x64',
      hostname: 'test',
      uptimeSec: 0,
      loadavg: null,
      memory: { total: 0, free: 0, used: 0, usedRatio: 0 },
      cpu: { count: 1, model: 'test', speedMHz: 0 },
      collectedAt: new Date().toISOString(),
    }),
    mcp: async () => undefined,
    brain: {
      llm: async () => '',
      agent: async () => '',
      stop: async () => undefined,
    },
    spawn: async () => ({
      pid: undefined,
      exited: Promise.resolve({ exitCode: null }),
      kill: async () => undefined,
      ready: async () => undefined,
      output: () => '',
    }),
  }
}
