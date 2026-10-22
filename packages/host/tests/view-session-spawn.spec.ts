import { createServer } from 'node:http'
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

describe('view session and spawn tags', () => {
  const servers: Array<ReturnType<typeof createServer>> = []
  const authors: Array<ReturnType<typeof createAuthorTools>> = []

  afterEach(async () => {
    await Promise.all(authors.splice(0).map(item => item.dispose()))
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })))
  })

  it('mini_app_call without a view is ephemeral and tears down', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ephemeral-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)

    await registerWithFiles(author, 'com.example.ephemeral', {
      'manifest.json': JSON.stringify({
        id: 'com.example.ephemeral',
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
    async spawnOnce(ctx) {
      const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      return { pid: child.pid }
    },
  },
})
`,
    })
    await author.invoke('mini_app_reload', { appId: 'com.example.ephemeral' })

    const ping = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'ping',
    }) as { ok: true; value: string; session: string }
    expect(ping).toMatchObject({ ok: true, value: 'pong', session: 'ephemeral' })

    const spawned = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'spawnOnce',
    }) as { ok: true; value: { pid: number }; session: string }
    expect(spawned.ok).toBe(true)
    expect(spawned.session).toBe('ephemeral')
    expect(typeof spawned.value.pid).toBe('number')
    // After ephemeral end, a second call should still work (fresh live).
    const again = await author.invoke('mini_app_call', {
      appId: 'com.example.ephemeral',
      method: 'ping',
    }) as { session: string }
    expect(again.session).toBe('ephemeral')
  })

  it('view call reports session view; leave ends website and kills children', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    servers.push(server)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const url = `http://127.0.0.1:${address.port}`

    const root = await mkdtemp(join(tmpdir(), 'mma-view-spawn-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)

    await registerWithFiles(author, 'com.example.site', {
      'manifest.json': JSON.stringify({
        id: 'com.example.site',
        name: 'Site',
        description: 'Website',
        version: '1',
        entry: 'ui.tsx',
        kind: 'website',
        url,
      }),
      'ui.tsx': 'export default function App() { return null }\n',
      'main.api.ts': `import { defineApp } from '@mohou/contract'
const pids = { website: 0, app: 0 }
export default defineApp({
  name: 'Site',
  description: 'Website',
  api: {
    async spawnWorker(ctx) {
      const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      pids.app = child.pid ?? 0
      return { pid: child.pid }
    },
    async pids() { return pids },
  },
  website: {
    async ensure(ctx) {
      const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      pids.website = child.pid ?? 0
      await child.ready({ url: ${JSON.stringify(url)}, timeoutMs: 5_000 })
      return { url: ${JSON.stringify(url)} }
    },
    async refresh(_ctx, current) {
      return { url: current.url }
    },
  },
})
`,
    })

    await author.invoke('mini_app_reload', { appId: 'com.example.site' })
    await author.enterView('com.example.site')
    await author.invoke('mini_app_open', { appId: 'com.example.site' })

    let snapshot = author.websiteSnapshot('com.example.site')
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && snapshot?.phase !== 'ready' && snapshot?.phase !== 'failing') {
      await new Promise(r => setTimeout(r, 50))
      snapshot = author.websiteSnapshot('com.example.site')
    }
    expect(snapshot?.phase).toBe('ready')

    const call = await author.invoke('mini_app_call', {
      appId: 'com.example.site',
      method: 'spawnWorker',
    }) as { ok: true; value: { pid: number }; session: string }
    expect(call).toMatchObject({ ok: true, session: 'view' })
    expect(typeof call.value.pid).toBe('number')

    const before = await author.invoke('mini_app_call', {
      appId: 'com.example.site',
      method: 'pids',
    }) as { ok: true; value: { website: number; app: number } }
    expect(before.value.website).toBeGreaterThan(0)
    expect(before.value.app).toBeGreaterThan(0)

    // Reload keeps view; kills app-tagged; website refresh keeps website-tagged by default.
    await author.invoke('mini_app_reload', { appId: 'com.example.site' })
    snapshot = author.websiteSnapshot('com.example.site')
    const afterReload = Date.now() + 5_000
    while (Date.now() < afterReload && snapshot?.phase === 'refreshing') {
      await new Promise(r => setTimeout(r, 50))
      snapshot = author.websiteSnapshot('com.example.site')
    }
    expect(snapshot?.phase).toBe('ready')

    await author.releaseView('com.example.site')
    expect(author.websiteSnapshot('com.example.site')).toBeUndefined()
  })
})
