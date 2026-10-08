import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { describe, expect, it } from 'vitest'

import { HttpError, createHttp, type HttpPolicy } from '../src/index.ts'

const policy: HttpPolicy = {
  timeoutMs: { min: 20, max: 500, default: 200 },
  maxBodyBytes: 32,
}

async function withServer(handler: (body: string) => { status: number; type: string; body: string }, run: (url: string) => Promise<void>) {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const result = handler(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(result.status, { 'content-type': result.type })
      res.end(result.body)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}/item`)
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  }
}

async function withHeaderServer(run: (url: string, seen: () => string | undefined) => Promise<void>): Promise<void> {
  let type: string | undefined
  const server = createServer((req, res) => {
    type = req.headers['content-type']
    res.writeHead(204)
    res.end()
    req.resume()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}/item`, () => type)
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  }
}

describe('createHttp', () => {
  it('returns a json body and keeps an error status', async () => {
    const http = createHttp(policy)
    await withServer(() => ({ status: 200, type: 'application/json', body: '{"n":1}' }), async (url) => {
      const result = await http(url, { query: { q: 1, skip: undefined } })
      expect(result.ok).toBe(true)
      expect(result.json).toEqual({ n: 1 })
    })
    await withServer(() => ({ status: 404, type: 'text/plain', body: 'missing' }), async (url) => {
      const result = await http({ url })
      expect(result.ok).toBe(false)
      expect(result.status).toBe(404)
      expect(result.json).toBeNull()
    })
    await withServer(() => ({ status: 200, type: 'application/json', body: '{' }), async (url) => {
      const result = await http(url, { method: 'POST', body: 'plain', headers: { 'content-type': 'text/plain' } })
      expect(result.json).toBeNull()
      expect(result.text).toBe('{')
    })
    await withHeaderServer(async (url, seen) => {
      await http(url, { method: 'POST', body: { n: 1 }, headers: { 'Content-Type': 'application/merge-patch+json' } })
      expect(seen()).toBe('application/merge-patch+json')
      await http(url, { method: 'POST', body: { n: 1 } })
      expect(seen()).toBe('application/json')
    })
  })

  it('rejects scheme, policy, size, timeout, and network failures by code', async () => {
    const http = createHttp(policy)
    await expect(http('file:///tmp/x')).rejects.toMatchObject({ code: 'http-scheme' })
    await expect(http('http://127.0.0.1/x', { timeout: 1 })).rejects.toMatchObject({ code: 'http-policy' })
    await expect(http('http://127.0.0.1/x', { body: { value: 'x'.repeat(40) } })).rejects.toBeInstanceOf(HttpError)
    await expect(http('http://127.0.0.1:9/x')).rejects.toMatchObject({ code: 'http-network' })
    const hanging = createServer(() => undefined)
    await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve))
    const hangAddress = hanging.address() as AddressInfo
    await expect(http(`http://127.0.0.1:${hangAddress.port}/`, { timeout: 20 })).rejects.toMatchObject({ code: 'http-timeout' })
    await new Promise<void>((resolve) => {
      hanging.close(() => {
        resolve()
      })
    })
  })

  it('cancels when the call signal aborts', async () => {
    const controller = new AbortController()
    const http = createHttp(policy, controller.signal)
    const pending = http('http://127.0.0.1:9/x')
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  })
})
