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

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  const port = address.port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return port
}

async function waitReady(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300) })
      void response.body?.cancel()
      return
    } catch {
      await new Promise(r => setTimeout(r, 50))
    }
  }
  throw new Error(`not ready: ${url}`)
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300) })
    void response.body?.cancel()
    return true
  } catch {
    return false
  }
}

describe('website spawn teardown on releaseView', () => {
  const authors: Array<ReturnType<typeof createAuthorTools>> = []

  afterEach(async () => {
    await Promise.all(authors.splice(0).map(item => item.dispose()))
  })

  it('kills the child when the view is released after ready', async () => {
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    const root = await mkdtemp(join(tmpdir(), 'mma-teardown-'))
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
      const child = await ctx.spawn(process.execPath, [
        '-e',
        ${JSON.stringify(`
const http = require('http')
http.createServer((_, res) => { res.writeHead(200); res.end('ok') }).listen(${port}, '127.0.0.1')
`)},
      ])
      await child.ready({ url: ${JSON.stringify(url)}, timeoutMs: 10_000 })
      return { url: ${JSON.stringify(url)} }
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
    await waitReady(url, 5_000)
    expect(await isUp(url)).toBe(true)

    await author.releaseView('com.example.site')
    expect(author.websiteSnapshot('com.example.site')).toBeUndefined()

    const downDeadline = Date.now() + 5_000
    while (Date.now() < downDeadline && await isUp(url)) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(await isUp(url)).toBe(false)
  })

  it('reaps ensure that finishes after the view already left', async () => {
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    const root = await mkdtemp(join(tmpdir(), 'mma-race-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    authors.push(author)

    await registerWithFiles(author, 'com.example.race', {
      'manifest.json': JSON.stringify({
        id: 'com.example.race',
        name: 'Race',
        description: 'Website',
        version: '1',
        entry: 'ui.tsx',
        kind: 'website',
        url,
      }),
      'ui.tsx': 'export default function App() { return null }\n',
      'main.api.ts': `import { defineApp } from '@mohou/contract'
export default defineApp({
  name: 'Race',
  description: 'Website',
  api: {},
  website: {
    async ensure(ctx) {
      await new Promise(r => setTimeout(r, 400))
      const child = await ctx.spawn(process.execPath, [
        '-e',
        ${JSON.stringify(`
const http = require('http')
http.createServer((_, res) => { res.writeHead(200); res.end('ok') }).listen(${port}, '127.0.0.1')
`)},
      ])
      await child.ready({ url: ${JSON.stringify(url)}, timeoutMs: 10_000 })
      return { url: ${JSON.stringify(url)} }
    },
  },
})
`,
    })

    await author.invoke('mini_app_reload', { appId: 'com.example.race' })
    await author.enterView('com.example.race')
    await author.invoke('mini_app_open', { appId: 'com.example.race' })
    // Close before ensure finishes.
    await author.releaseView('com.example.race')

    // Give late ensure time to finish and be reaped.
    await new Promise(r => setTimeout(r, 1_500))
    expect(author.websiteSnapshot('com.example.race')).toBeUndefined()
    expect(await isUp(url)).toBe(false)
  })
})
