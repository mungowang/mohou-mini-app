import { request } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials,
  AuthorError,
  authoringTokenMatches,
  createAppRegistry,
  createAuthorTools,
  createLoopbackApp,
  isLoopbackAddress,
  readAuthoringToken,
  startAuthorHttp,
  type AuthorCallPorts,
} from '../src/index.ts'

const manifest = JSON.stringify({
  id: 'com.example.app',
  name: 'Example',
  description: 'One line',
  version: '1',
  entry: 'ui.tsx',
})

const backend = `
  import { defineApp } from '@mohou/contract'
  export default defineApp({
    name: 'Example',
    description: 'One line',
    api: {
      ping() { return 'pong' },
      fail() { throw new Error('nope') },
    },
  })
`

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

const mcpAccept = { accept: 'application/json, text/event-stream' }

function post(
  port: number,
  path: string,
  token: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...token === undefined ? {} : { authorization: `Bearer ${token}` },
        ...headers,
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: response.statusCode ?? 0, json: text.length === 0 ? null : JSON.parse(text) as unknown })
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
}

describe('author tools', () => {
  it('registers, edits, reloads, and calls through one implementation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-author-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    expect(await author.invoke('mini_app_list', {})).toEqual({ apps: [], runtimeRoot: root })
    const created = await registerWithFiles(author, 'com.example.app', { 'manifest.json': manifest, 'ui.tsx': 'export {}', 'main.api.ts': backend }) as { needed: string[] }
    expect(created.needed.some(item => item.endsWith('ui.tsx'))).toBe(true)
    expect((await author.invoke('mini_app_get', { appId: 'com.example.app' }) as { name: string }).name).toBe('Example')
    const listed = await author.invoke('mini_app_list_files', { appId: 'com.example.app' }) as { files: unknown[] }
    expect(listed.files.length).toBeGreaterThan(0)
    const written = await author.invoke('mini_app_write', { appId: 'com.example.app', path: 'note.txt', content: 'one', commit: false })
    expect(written).toMatchObject({ commit: { status: 'skipped' } })
    await author.invoke('mini_app_edit', {
      appId: 'com.example.app',
      path: 'note.txt',
      edits: [{ oldText: 'one', newText: 'two' }],
      commit: false,
    })
    const read = await author.invoke('mini_app_read', { appId: 'com.example.app', path: 'note.txt', numbered: true, start: 1, end: 1 }) as { content: string }
    expect(read.content).toContain('two')
    await author.invoke('mini_app_delete', { appId: 'com.example.app', path: 'note.txt', commit: false })
    const reloaded = await author.invoke('mini_app_reload', { appId: 'com.example.app' })
    expect(reloaded).toMatchObject({ ok: true, compiled: { backend: true }, caches: { views: 'not-open', cleanCaches: true } })
    const history = await author.invoke('mini_app_history_list', { appId: 'com.example.app' }) as { nodes: Array<{ message: string }> }
    expect(history.nodes[0]?.message).toBe('Compile and reload a mini-app.')
    const kept = await author.invoke('mini_app_reload', { appId: 'com.example.app', cleanCaches: false })
    expect(kept).toMatchObject({ ok: true, caches: { cleanCaches: false } })
    await expect(author.invoke('mini_app_reload', { appId: 'com.example.app', cleanCaches: 'yes' })).rejects.toMatchObject({ code: 'tool-args' })
    const stop = author.hostEvents.subscribe(() => undefined)
    const watched = await author.invoke('mini_app_reload', { appId: 'com.example.app' })
    stop()
    expect(watched).toMatchObject({ ok: true, caches: { views: 'refetch' } })
    // Hold a view so a failed reload keeps the last good live module (ephemeral alone unloads).
    await author.enterView('com.example.app')
    expect(await author.invoke('mini_app_call', { appId: 'com.example.app', method: 'ping' })).toEqual({ ok: true, value: 'pong', session: 'view' })
    const batch = await author.invoke('mini_app_call', {
      appId: 'com.example.app',
      calls: [{ method: 'ping' }, { method: 'missing' }],
    }) as { results: Array<{ ok: boolean; session?: string }> }
    expect(batch.results.map(item => item.ok)).toEqual([true, false])
    expect(batch.results.every(item => item.session === 'view')).toBe(true)
    expect(await author.invoke('mini_app_mcp_list', {})).toEqual({ servers: [] })
    await expect(author.invoke('mini_app_mcp_tools', {})).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_mcp_add', { id: 'x' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_mcp_remove', {})).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_nope', {})).rejects.toMatchObject({ code: 'unknown-tool' })
    await expect(author.invoke('mini_app_call', { appId: 'com.example.app', calls: Array.from({ length: 21 }, () => ({ method: 'ping' })) })).rejects.toMatchObject({ code: 'call-batch' })
    await author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'main.api.ts',
      content: 'export default {}\n',
      commit: false,
    })
    const failed = await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as { ok: boolean; errors: Array<{ message: string }> }
    expect(failed.ok).toBe(false)
    expect(failed.errors[0]?.message).toContain('defineApp')
    expect(await author.invoke('mini_app_call', { appId: 'com.example.app', method: 'ping' })).toEqual({ ok: true, value: 'pong', session: 'view' })
    await author.dispose()
  })

  it('keeps the esbuild text in a reload failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-author-text-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    await registerWithFiles(author, 'com.example.app', {
      'manifest.json': manifest,
      'main.api.ts': backend,
      'shared/mcp.ts': 'export const OTHER = 1\n',
      'ui.tsx': "import { MCP_PRESETS } from './shared/mcp.ts'\nexport default function App() { return <div>{MCP_PRESETS}</div> }\n",
    })
    const failed = await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as {
      ok: boolean
      errors: Array<{ code: string; message: string }>
    }
    expect(failed.ok).toBe(false)
    expect(failed.errors[0]?.code).toBe('ui-invalid')
    expect(failed.errors[0]?.message).toContain('No matching export in "shared/mcp.ts" for import "MCP_PRESETS"')
    await author.dispose()
  })

  it('refuses a missing token file and a non-loopback caller', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-token-'))
    await expect(readAuthoringToken(root)).rejects.toBeInstanceOf(AuthorError)
    expect(isLoopbackAddress('8.8.8.8')).toBe(false)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(authoringTokenMatches('secret', 'nope')).toBe(false)
    expect(authoringTokenMatches('secret', undefined)).toBe(false)
    await writeFile(join(root, 'authoring.token'), 'secret\n')
    expect(await readAuthoringToken(root)).toBe('secret')
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    const http = await startAuthorHttp({ author, token: 'secret' })
    expect((await post(http.port, '/api/tools/invoke', undefined, { name: 'mini_app_list' })).status).toBe(401)
    const ok = await post(http.port, '/api/tools/invoke', 'secret', { name: 'mini_app_list', arguments: {} })
    expect(ok.status).toBe(200)
    const mcp = await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, mcpAccept)
    expect(mcp.status).toBe(200)
    const listed = mcp.json as { result?: { tools?: Array<{ name: string; inputSchema?: { required?: string[] } }> } }
    const names = listed.result?.tools?.map(tool => tool.name) ?? []
    expect(names).toContain('mini_app_register')
    expect(names).toContain('mini_app_mcp_list')
    expect(names).toContain('mini_app_mcp_tools')
    expect(names).toContain('mini_app_mcp_add')
    expect(names).toContain('mini_app_mcp_remove')
    expect(names).not.toContain('mini_app_write')
    expect(names).not.toContain('mini_app_edit')
    expect(names).not.toContain('mini_app_delete')
    const get = listed.result?.tools?.find(tool => tool.name === 'mini_app_get')
    expect(get?.inputSchema?.required).toEqual(['appId'])
    const register = listed.result?.tools?.find(tool => tool.name === 'mini_app_register')
    expect(register?.inputSchema?.required).toEqual(['appId', 'name', 'description', 'version'])
    const mcpTools = listed.result?.tools?.find(tool => tool.name === 'mini_app_mcp_tools')
    expect(mcpTools?.inputSchema?.required).toEqual(['serverId'])
    const hidden = await post(http.port, '/mcp', 'secret', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'mini_app_write', arguments: { appId: 'com.example.app', path: 'a.ts', content: 'x' } },
    }, mcpAccept)
    expect(hidden.status).toBe(200)
    const hiddenBody = hidden.json as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }
    expect(hiddenBody.result?.isError).toBe(true)
    expect(hiddenBody.result?.content?.[0]?.text).toContain('unknown-tool')
    const initialized = await post(http.port, '/mcp', 'secret', {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, mcpAccept)
    expect(initialized.status).not.toBe(400)
    await http.close()
    await author.dispose()
  })

  it('rejects bad arguments and projects the same catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-author-bad-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    await expect(author.invoke('mini_app_get', [])).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_get', {})).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_register', { appId: 'com.example.app', files: {} })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_register', { appId: 'com.example.app' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_edit', { appId: 'com.example.app', path: 'a', edits: [] })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_call', { appId: 'com.example.app', calls: [] })).rejects.toMatchObject({ code: 'tool-args' })
    const missing = await author.invoke('mini_app_reload', { appId: 'com.example.missing' }) as { ok: boolean; errors: Array<{ code: string }> }
    expect(missing.ok).toBe(false)
    expect(missing.errors[0]?.code).toBe('app-not-registered')
    expect(isLoopbackAddress('')).toBe(false)
    const app = createLoopbackApp({ author, token: 'secret' })
    const refused = await app.request('http://127.0.0.1/api/tools', {}, {
      incoming: { socket: { remoteAddress: '8.8.8.8' } },
    })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'authoring-loopback' } })
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('localhost')).toBe(true)
    expect(authoringTokenMatches('secret', 'secret')).toBe(true)
    const http = await startAuthorHttp({ author, token: 'secret' })
    const listed = await new Promise<{ status: number }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: http.port, path: '/api/tools', headers: { authorization: 'Bearer secret' } }, (response) => {
        response.resume()
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0 })
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(listed.status).toBe(200)
    expect((await post(http.port, '/api/tools/invoke', 'wrong', { name: 'mini_app_list' })).status).toBe(401)
    const basic = await new Promise<number>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1',
        port: http.port,
        path: '/api/tools',
        headers: { authorization: 'Bearer' },
      }, (response) => {
        response.resume()
        response.on('end', () => {
          resolve(response.statusCode ?? 0)
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(basic).toBe(401)
    expect((await post(http.port, '/api/tools/invoke', 'secret', { name: 1 })).status).toBe(400)
    expect((await post(http.port, '/nope', 'secret', {})).status).toBe(404)
    expect((await post(http.port, '/api/tools/invoke', 'secret', '{')).status).toBe(400)
    expect((await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }, mcpAccept)).status).toBe(200)
    expect((await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mini_app_list', arguments: {} } }, mcpAccept)).status).toBe(200)
    expect((await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 3, method: 'nope' }, mcpAccept)).status).toBe(200)
    const failed = await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'mini_app_nope', arguments: {} } }, mcpAccept)
    expect(JSON.stringify(failed.json)).toContain('unknown-tool')
    const stream = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: http.port, path: '/mcp', method: 'GET', headers: { authorization: 'Bearer secret' } }, (response) => {
        response.resume()
        response.on('end', () => {
          resolve(response.statusCode ?? 0)
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(stream).toBe(404)
    expect((await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 9, method: 'tools/list' }, { ...mcpAccept, 'mcp-session-id': 'missing' })).status).toBe(404)
    const put = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: http.port, path: '/mcp', method: 'PUT', headers: { authorization: 'Bearer secret' } }, (response) => {
        response.resume()
        response.on('end', () => {
          resolve(response.statusCode ?? 0)
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(put).toBe(405)
    const removed = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: http.port, path: '/mcp', method: 'DELETE', headers: { authorization: 'Bearer secret' } }, (response) => {
        response.resume()
        response.on('end', () => {
          resolve(response.statusCode ?? 0)
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(removed).toBe(404)
    await http.close()
    await author.dispose()
  })

  it('reuses an SSE session id and 404s after delete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-session-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    const http = await startAuthorHttp({ author, token: 'secret' })
    const opened = await mcpStream(http.port, {
      method: 'POST',
      accept: 'text/event-stream',
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
    })
    expect(opened.status).toBe(200)
    expect(opened.session).toEqual(expect.any(String))
    const id = opened.session ?? ''
    expect((await mcpStream(http.port, {
      method: 'POST',
      session: id,
      accept: 'application/json, text/event-stream',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    })).status).toBe(200)
    expect((await mcpStream(http.port, { method: 'GET', session: id, accept: 'text/event-stream' })).status).toBe(200)
    expect((await mcpStream(http.port, { method: 'DELETE', session: id })).status).toBe(200)
    expect((await post(http.port, '/mcp', 'secret', { jsonrpc: '2.0', id: 9, method: 'tools/list' }, { ...mcpAccept, 'mcp-session-id': id })).status).toBe(404)
    await http.close()
    await author.dispose()
  })
})

function mcpStream(port: number, options: {
  readonly method: string
  readonly accept?: string
  readonly session?: string
  readonly body?: unknown
}): Promise<{ status: number; session?: string }> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
    const headers: Record<string, string> = { authorization: 'Bearer secret' }
    if (options.accept !== undefined) headers.accept = options.accept
    if (options.session !== undefined) headers['mcp-session-id'] = options.session
    if (payload !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(payload))
    }
    const req = request({ host: '127.0.0.1', port, path: '/mcp', method: options.method, headers }, (response) => {
      const header = response.headers['mcp-session-id']
      resolve({
        status: response.statusCode ?? 0,
        ...typeof header === 'string' && header.length > 0 ? { session: header } : {},
      })
      response.destroy()
      req.destroy()
    })
    req.on('error', reject)
    if (payload !== undefined) req.end(payload)
    else req.end()
  })
}
