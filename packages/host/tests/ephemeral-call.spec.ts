import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { afterEach, describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import {
  createAppRegistry,
  createAuthorTools,
  emptyCredentials,
  type AuthorCallPorts,
} from '../src/index.ts'

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: {
      theme: 'light',
      palette: 'default',
      locale: 'en',
      chatLanguage: 'en',
      hostPort: 0,
      llm: null,
    },
    log() {},
    push() {},
    http: () => Promise.reject(new Error('unused')),
    bash: () => Promise.reject(new Error('unused')),
    pwsh: () => Promise.reject(new Error('unused')),
    metrics: () => Promise.reject(new Error('unused')),
    processDirectory: tmpdir(),
    createTemp: () => tmpdir(),
    provider: createEchoProvider(),
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('mini_app_call ephemeral session', () => {
  const authors: Array<ReturnType<typeof createAuthorTools>> = []

  afterEach(async () => {
    await Promise.all(authors.splice(0).map(item => item.dispose()))
  })

  async function seed(author: ReturnType<typeof createAuthorTools>, appId = 'com.example.ephemeral') {
    await registerWithFiles(author, appId, {
      'manifest.json': JSON.stringify({
        id: appId,
        name: 'E',
        description: 'e',
        version: '1',
        entry: 'ui.tsx',
      }),
      'ui.tsx': 'export default function App() { return null }\n',
      'main.api.ts': `import { defineApp } from '@mohou/contract'
export default defineApp({
  name: 'E',
  description: 'e',
  api: {
    async ping() { return 'pong' },
    async boom() { throw new Error('nope') },
    async spawnOnce(ctx) {
      const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      return { pid: child.pid }
    },
    async *stream() {
      yield 1
      return 'done'
    },
  },
})
`,
    })
    await author.invoke('mini_app_reload', { appId })
  }

  it('returns session ephemeral without a view; spawn dies when the call ends', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-call-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author)

    const ping = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'ping',
    }) as { ok: true; value: string; session: string }
    expect(ping).toEqual({ ok: true, value: 'pong', session: 'ephemeral' })

    const spawned = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'spawnOnce',
    }) as { ok: true; value: { pid: number }; session: string }
    expect(spawned.ok).toBe(true)
    expect(spawned.session).toBe('ephemeral')
    const pid = spawned.value.pid
    expect(typeof pid).toBe('number')

    // No grace: after the call returns, session teardown has killed app spawns.
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && alive(pid)) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(alive(pid)).toBe(false)
  })

  it('failed call still reports session ephemeral', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-fail-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author)

    const failed = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'boom',
    }) as { ok: false; error: { message: string }; session: string }
    expect(failed.ok).toBe(false)
    expect(failed.session).toBe('ephemeral')
    expect(failed.error.message).toContain('nope')
  })

  it('batch calls share ephemeral session field on each result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-batch-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author)

    const batch = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      calls: [{ method: 'ping' }, { method: 'boom' }, { method: 'ping' }],
    }) as { results: Array<{ ok: boolean; session: string }> }
    expect(batch.results).toHaveLength(3)
    expect(batch.results.map(r => r.session)).toEqual(['ephemeral', 'ephemeral', 'ephemeral'])
    expect(batch.results.map(r => r.ok)).toEqual([true, false, true])
  })

  it('with enterView the same call reports session view and keeps spawn until leave', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-view-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author, 'com.example.viewed')

    await author.enterView('com.example.viewed')
    const spawned = await author.invoke('mini_app_call', {
      appId: 'com.example.viewed',
      method: 'spawnOnce',
    }) as { ok: true; value: { pid: number }; session: string }
    expect(spawned.session).toBe('view')
    const pid = spawned.value.pid
    expect(alive(pid)).toBe(true)

    // Still held by view — process stays until releaseView.
    await new Promise(r => setTimeout(r, 200))
    expect(alive(pid)).toBe(true)

    await author.releaseView('com.example.viewed')
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && alive(pid)) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(alive(pid)).toBe(false)
  })

  it('two overlapping ephemeral calls both report ephemeral', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-parallel-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author, 'com.example.parallel')

    const pair = await Promise.all([
      author.invoke('mini_app_call', { appId: 'com.example.parallel', method: 'ping' }),
      author.invoke('mini_app_call', { appId: 'com.example.parallel', method: 'ping' }),
    ]) as [{ ok: true; session: string }, { ok: true; session: string }]
    expect(pair[0].session).toBe('ephemeral')
    expect(pair[1].session).toBe('ephemeral')
    expect(pair[0].ok && pair[1].ok).toBe(true)
  })

  it('callObserved ephemeral path also tears down spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-eph-obs-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await seed(author, 'com.example.obs')

    const result = await author.callObserved('com.example.obs', 'spawnOnce', {}, () => undefined) as {
      ok: true
      value: { pid: number }
      session: string
    }
    expect(result.session).toBe('ephemeral')
    const pid = result.value.pid
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && alive(pid)) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(alive(pid)).toBe(false)
  })
})
