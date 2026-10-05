import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { createHost } from '../src/host/session.ts'

import { freePort } from './free-port.ts'
import { hostAuthoringToken } from '../src/index.ts'
import { httpLayout } from '../src/http/layout.ts'

describe('author skill and mcp owner routes', () => {
  it('reads and writes dests when Shell injected the tables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-author-http-'))
    const source = join(root, 'mohou-mini-app')
    const skillsDir = join(root, '.pi', 'agent', 'skills')
    const mcpFile = join(root, '.pi', 'agent', 'mcp.json')
    await mkdir(source)
    await mkdir(join(root, '.pi', 'agent'), { recursive: true })
    await writeFile(join(source, 'SKILL.md'), '---\nversion: 1.0.2\n---\n# skill\n', 'utf8')
    await writeFile(mcpFile, '{}\n', 'utf8')
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      authorSkill: {
        source,
        agents: [{ id: 'pi', label: 'Pi', skillsDir, detectDir: join(root, '.pi', 'agent') }],
      },
      authorMcp: {
        agents: [{ id: 'pi', label: 'Pi', file: mcpFile, detectDir: join(root, '.pi', 'agent'), format: 'mcpServers' }],
      },
    })
    const started = await host.start()
    const token = readFileSync(hostAuthoringToken(root), 'utf8').trim()
    try {
      const skill = objectBody((await get(started.port, httpLayout.authorSkill)).body)
      expect(skill).toMatchObject({ ok: true, result: { skillId: 'mohou-mini-app', version: '1.0.2' } })
      const wroteSkill = objectBody((await post(started.port, httpLayout.authorSkill, JSON.stringify({ agentIds: ['pi'], customDirs: [] }), token)).body)
      expect(wroteSkill).toMatchObject({ ok: true, result: { agents: [{ installed: true }] } })
      const mcp = objectBody((await get(started.port, httpLayout.authorMcp)).body)
      expect(mcp).toMatchObject({ ok: true, result: { agents: [{ id: 'pi', installed: false }] } })
      const wroteMcp = objectBody((await post(started.port, httpLayout.authorMcp, JSON.stringify({ agentIds: ['pi'], description: 'Create and edit mini-apps on this machine.' }), token)).body)
      expect(wroteMcp).toMatchObject({ ok: true, result: { agents: [{ installed: true, updateAvailable: false }] } })
      const listed = objectBody((await get(started.port, httpLayout.mcpServers)).body)
      expect(listed).toMatchObject({ ok: true, result: { servers: [] } })
      const saved = await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: [{ id: 'echo', command: 'echo', args: ['hi'] }] }), token)
      expect(objectBody(saved.body).ok).toBe(true)
      // A panel save is live: the client holds the row, so no restart is needed to see it.
      const liveServers = await host.author.invoke('mini_app_mcp_list', {}) as { servers: Array<{ id: string }> }
      expect(liveServers.servers.map(server => server.id)).toEqual(['echo'])
      const check = await post(started.port, httpLayout.mcpCheck, JSON.stringify({ id: 'missing', command: 'mini-app-no-such-mcp-bin' }), token)
      expect(objectBody(check.body)).toMatchObject({ ok: true, result: { ok: false, code: 'mcp-start-failed' } })
      const admitted = await post(started.port, httpLayout.mcpAdmit, JSON.stringify({ text: '{"from":{"command":"npx"}}' }))
      expect(objectBody(admitted.body)).toMatchObject({ ok: true, result: { servers: [{ id: 'from' }] } })
      expect((await post(started.port, httpLayout.mcpAdmit, '{')).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: [{ id: 'bad', args: [1] }] }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: [{ id: 'bad', env: { K: 1 } }] }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: 'nope' }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpCheck, JSON.stringify({ command: 'echo' }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpCheck, 'null', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.hostConfig, 'null', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.activate, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.probe, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorSkillReveal, JSON.stringify({ dest: join(skillsDir, 'nope') }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorMcpReveal, JSON.stringify({ dest: join(root, 'nope.json') }), token)).status).toBe(400)
    } finally {
      await host.dispose()
    }
  }, 120_000)

  it('rejects author dest routes when Shell did not inject them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-author-http-off-'))
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
    })
    const started = await host.start()
    const token = readFileSync(hostAuthoringToken(root), 'utf8').trim()
    try {
      expect((await get(started.port, httpLayout.authorSkill)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorSkill, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorSkillReveal, '{}', token)).status).toBe(400)
      expect((await get(started.port, httpLayout.authorMcp)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorMcp, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorMcpReveal, '{}', token)).status).toBe(400)
      expect((await get(started.port, `${httpLayout.mcpImport}/pi`)).status).toBe(400)
    } finally {
      await host.dispose()
    }
  }, 120_000)
})

function objectBody(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'GET')
}

function post(port: number, path: string, body: string, token?: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'POST', body, token)
}

function call(port: number, path: string, method: string, body?: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (token !== undefined) headers.authorization = `Bearer ${token}`
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (response) => {
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
