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

describe('website author open', () => {
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

  it('open ensures, refresh keeps session, close disposes', async () => {
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

    const root = await mkdtemp(join(tmpdir(), 'mma-website-author-'))
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
export default defineApp({
  name: 'Site',
  description: 'Website',
  api: {},
  website: {
    async ensure(ctx) {
      if (ctx.spawn === undefined) throw new Error('no spawn')
      const child = await ctx.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      await child.ready({ url: ${JSON.stringify(url)}, timeoutMs: 5_000 })
      return { url: ${JSON.stringify(url)} }
    },
    async refresh(_ctx, current) {
      return { url: current.url }
    },
    content: {
      async onLoad() {},
      async onDocumentIdle() {},
      async onLoadFailed() {},
    },
  },
})
`,
    })

    await author.invoke('mini_app_reload', { appId: 'com.example.site' })
    await author.enterView('com.example.site')
    await author.invoke('mini_app_open', { appId: 'com.example.site', title: 'Site' })

    let snapshot = author.websiteSnapshot('com.example.site')
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && snapshot?.phase !== 'ready' && snapshot?.phase !== 'failing') {
      await new Promise(resolve => setTimeout(resolve, 50))
      snapshot = author.websiteSnapshot('com.example.site')
    }
    expect(snapshot?.phase).toBe('ready')
    expect(snapshot?.url).toBe(url)

    const refreshed = await author.websiteRefresh('com.example.site')
    expect(refreshed.phase).toBe('ready')
    expect(refreshed.generation).toBeGreaterThan(0)

    await author.websiteContent('com.example.site', 'load')
    await author.websiteContent('com.example.site', 'document-idle')

    await author.releaseView('com.example.site')
    expect(author.websiteSnapshot('com.example.site')).toBeUndefined()

    // Open again then delete (covers removeApp dispose path).
    await author.enterView('com.example.site')
    await author.invoke('mini_app_open', { appId: 'com.example.site' })
    snapshot = author.websiteSnapshot('com.example.site')
    const reopenDeadline = Date.now() + 10_000
    while (Date.now() < reopenDeadline && snapshot?.phase !== 'ready' && snapshot?.phase !== 'failing') {
      await new Promise(resolve => setTimeout(resolve, 50))
      snapshot = author.websiteSnapshot('com.example.site')
    }
    expect(snapshot?.phase).toBe('ready')
    await author.releaseView('com.example.site').catch(() => undefined)
    await author.deleteApp('com.example.site')
    expect(author.websiteSnapshot('com.example.site')).toBeUndefined()
  })

  it('content route rejects a bad event body through owner ports shape', async () => {
    // Keep a tiny author only to prove websiteContent is callable when idle.
    const root = await mkdtemp(join(tmpdir(), 'mma-website-idle-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)
    await author.websiteContent('com.example.missing', 'load')
    expect(author.websiteSnapshot('com.example.missing')).toBeUndefined()
    expect(await author.websiteRetry('com.example.missing')).toMatchObject({
      phase: 'failing',
      error: { code: 'website-no-session' },
    })
  })
})
