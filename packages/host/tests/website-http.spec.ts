import { createServer, request } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createEchoProvider } from '@mohou/runtime-provider'
import { afterEach, describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import { freePort } from './free-port.ts'
import { createHost } from '../src/host/session.ts'
import { appResource, websiteResource } from '../src/http/layout.ts'

describe('website http routes', () => {
  const closers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (closers.length > 0) await closers.pop()?.()
  })

  it('exposes snapshot/refresh/retry/close/content', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(204)
      res.end()
    })
    await listen(server)
    closers.push(() => closeServer(server))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const siteUrl = `http://127.0.0.1:${address.port}`

    const root = await mkdtemp(join(tmpdir(), 'mma-website-http-'))
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      seedStartup: false,
    })
    const started = await host.start()
    closers.push(() => host.dispose())

    await registerWithFiles(host.author, 'com.example.http-site', {
      'manifest.json': JSON.stringify({
        id: 'com.example.http-site',
        name: 'Http Site',
        description: 'Website over HTTP',
        version: '1',
        entry: 'ui.tsx',
        kind: 'website',
        url: siteUrl,
      }),
      'ui.tsx': 'export default function App() { return null }\n',
      'main.api.ts': `import { defineApp } from '@mohou/contract'
export default defineApp({
  name: 'Http Site',
  description: 'Website over HTTP',
  api: {},
  website: {
    async ensure() { return { url: ${JSON.stringify(siteUrl)} } },
    async refresh(_ctx, current) { return { url: current.url } },
  },
})
`,
    })
    await host.author.invoke('mini_app_reload', { appId: 'com.example.http-site' })
    await host.owner.open('com.example.http-site')

    // appResource encodes each segment; a single 'website/close' segment becomes website%2Fclose and 404s.
    expect(websiteResource('com.example.http-site', 'close')).toBe('/api/app/com.example.http-site/website/close')
    expect(appResource('com.example.http-site', 'website/close')).toContain('website%2Fclose')

    const base = websiteResource('com.example.http-site')
    const snap = await get(started.port, base)
    expect(snap.status).toBe(200)
    expect(JSON.parse(snap.body)).toMatchObject({ ok: true })

    expect((await post(started.port, websiteResource('com.example.http-site', 'refresh'), '{}')).status).toBe(200)
    expect((await post(started.port, websiteResource('com.example.http-site', 'retry'), '{}')).status).toBe(200)
    expect((await post(
      started.port,
      websiteResource('com.example.http-site', 'content'),
      JSON.stringify({ event: 'load' }),
    )).status).toBe(200)
    expect((await post(
      started.port,
      websiteResource('com.example.http-site', 'content'),
      JSON.stringify({ event: 'nope' }),
    )).status).toBe(400)
    expect((await post(started.port, websiteResource('com.example.http-site', 'close'), '{}')).status).toBe(200)
  })
})

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'GET')
}

function post(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'POST', body)
}

function call(port: number, path: string, method: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}
