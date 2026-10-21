import { request } from 'node:http'
import { connect } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it, vi } from 'vitest'

import {
  emptyCredentials, createAppRegistry, createAuthorTools, diagnosticUrl, startAuthorHttp, type AuthorCallPorts } from '../src/index.ts'

describe('diagnostic posts', () => {
  it('answers 204 for a bad body, a bad id, an oversized payload, and a real report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-diag-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    const http = await startAuthorHttp({
      author,
      token: 'secret',
      diagnostics: {
        recordError: (appId, raw) => {
          author.errors.record(appId, raw)
        },
        markAlive: (appId) => {
          author.views.markAlive(appId)
        },
        markAbsent: (appId) => {
          author.views.absent(appId)
        },
        answerView: (requestId, appId, raw) => author.views.answer(requestId, appId, raw),
        maxBodyBytes: 80,
      },
    })
    try {
      expect((await post(http.port, diagnosticUrl('com.example.app', 'errors'), '{')).status).toBe(204)
      expect((await post(http.port, diagnosticUrl('not-an-id', 'errors'), '{"kind":"render","message":"x"}')).status).toBe(204)
      expect((await post(http.port, diagnosticUrl('com.example.app', 'errors'), 'x'.repeat(64))).status).toBe(204)
      expect((await post(http.port, diagnosticUrl('com.example.app', 'errors'), '{"kind":"render","message":"boom"}')).status).toBe(204)
      expect((await post(http.port, diagnosticUrl('com.example.app', 'alive'), '{}')).status).toBe(204)
      expect(author.errors.read('com.example.app').errors.map(item => item.message)).toEqual(['boom'])
      const absent = vi.spyOn(author.views, 'absent')
      expect((await post(http.port, diagnosticUrl('com.example.app', 'absent'), '{}')).status).toBe(204)
      expect(absent).toHaveBeenCalledWith('com.example.app')
    } finally {
      await http.close()
      await author.dispose()
    }
  })

  it('closes while a client socket is still open', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-diag-close-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    const http = await startAuthorHttp({ author, token: 'secret' })
    const socket = connect(http.port, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => { resolve() })
      socket.once('error', reject)
    })
    const result = await Promise.race([
      http.close().then(() => 'closed'),
      new Promise((resolve) => { setTimeout(() => { resolve('hung') }, 1500) }),
    ])
    socket.destroy()
    await author.dispose()
    expect(result).toBe('closed')
  })
})

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: {
      theme: 'light',
      palette: 'default',
      locale: 'zh-CN',
      chatLanguage: 'zh-CN',
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

function post(port: number, path: string, body: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (response) => {
      response.resume()
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0 })
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}
