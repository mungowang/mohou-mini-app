import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { createHost } from '../src/host/session.ts'
import { appsResource, httpLayout, runnerPath } from '../src/http/layout.ts'
import { hostAuthoringToken, platformRuntimePath, platformSdkPath, platformVendorPath } from '../src/index.ts'

import { freePort } from './free-port.ts'

const files = {
  'manifest.json': JSON.stringify({
    id: 'com.example.app',
    name: 'Example',
    description: 'One line',
    version: '1',
    entry: 'ui.tsx',
  }),
  'ui.tsx': 'export default function View() { return null }\n',
  'main.api.ts': [
    'import { defineApp } from \'@mohou/contract\'',
    'export default defineApp({ name: \'Example\', description: \'One line\', api: { ping: async () => \'pong\', wrapped: async () => ({ ok: true, value: \'x\' }), failObj: async () => ({ ok: false, error: { message: \'nope\' } }), failStr: async () => ({ ok: false, error: \'nope\' }), failBare: async () => ({ ok: false, error: 1 }) } })',
    '',
  ].join('\n'),
}

describe('loopback', () => {
  it('serves the panel, iframe, and authoring catalog on one listener', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-loop-'))
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      panel: { html: '<!doctype html><title>panel</title>', script: 'export {}' },
    })
    const started = await host.start()
    try {
      const listed = await get(started.port, httpLayout.apps)
      expect(listed.status).toBe(200)
      expect(objectBody(listed.body)).toEqual({ apps: [] })
      const panel = await get(started.port, httpLayout.panel)
      expect(panel.body).toContain('panel')
      expect((await get(started.port, httpLayout.panelScript)).body).toContain('export')
      expect((await get(started.port, httpLayout.updates)).status).toBe(200)
      expect((await get(started.port, httpLayout.about)).status).toBe(200)
      expect((await get(started.port, httpLayout.palettes)).status).toBe(200)
      const runtime = await get(started.port, platformRuntimePath())
      expect(runtime.status).toBe(200)
      expect(runtime.body).toContain('createRoot')
      const sdk = await get(started.port, platformSdkPath())
      expect(sdk.status).toBe(200)
      expect(sdk.body).toContain('useApp')
      expect(sdk.body).toContain('Button')
      const vendor = await get(started.port, platformVendorPath('lodash'))
      expect(vendor.status).toBe(200)
      const missing = await get(started.port, platformVendorPath('nope'))
      expect(missing.status).toBe(404)
      const call = await post(started.port, httpLayout.call, '{')
      expect(objectBody(call.body)).toEqual({ ok: false, error: 'invalid json' })
      const absent = await get(started.port, runnerPath('com.example.missing'))
      expect(absent.status).toBe(400)
      const config = await get(started.port, httpLayout.hostConfig)
      expect(objectBody(config.body)).toMatchObject({ ok: true })
      const providers = await get(started.port, httpLayout.providers)
      expect(objectBody(providers.body)).toMatchObject({ providers: [{ id: 'echo' }] })
      const imported = await get(started.port, `${httpLayout.mcpImport}/pi`)
      expect(objectBody(imported.body)).toMatchObject({
        ok: false,
        error: { code: 'config-invalid' },
      })
    } finally {
      await host.dispose()
    }
  }, 120_000)

  it('calls an app and reads owner routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-loop-app-'))
    const provider = createEchoProvider()
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider,
    })
    await registerWithFiles(host.author, 'com.example.app', files)
    const started = await host.start()
    const token = readFileSync(hostAuthoringToken(root), 'utf8').trim()
    const guarded = (path: string, body: string) => post(started.port, path, body, token)
    expect(provider.healthy()).toBe(true)
    try {
      const live = await guarded(httpLayout.probe, JSON.stringify({ id: 'echo' }))
      expect(objectBody(live.body)).toMatchObject({ result: { healthy: true } })
      const opened = await post(started.port, appsResource('com.example.app', httpLayout.open), '{}')
      expect(opened.status).toBe(200)
      const called = await post(started.port, httpLayout.call, JSON.stringify({
        appId: 'com.example.app',
        method: 'ping',
      }))
      expect(objectBody(called.body)).toMatchObject({ ok: true })
      const history = await get(started.port, appsResource('com.example.app', httpLayout.history))
      expect(history.status).toBe(200)
      const storage = await get(started.port, appsResource('com.example.app', httpLayout.storage))
      expect(storage.status).toBe(200)
      const theme = await post(started.port, appsResource('com.example.app', httpLayout.theme), '{')
      expect(theme.status).toBe(400)
      const sheet = await get(started.port, '/api/app/com.example.app/ui/ui.css')
      expect(sheet.status).toBe(200)
      expect(sheet.body).toContain('tailwindcss')
      const entry = await get(started.port, '/api/app/com.example.app/ui/entry.js')
      expect(entry.status).toBe(200)
      const runner = await get(started.port, runnerPath('com.example.app'))
      expect(runner.status).toBe(200)
      expect(runner.body).toContain('com.example.app')
      const reloaded = await post(started.port, appsResource('com.example.app', httpLayout.reload), '{}')
      expect(reloaded.status).toBe(200)
      const pin = await get(started.port, appsResource('com.example.app', httpLayout.theme))
      expect(objectBody(pin.body)).toMatchObject({ result: { pin: { kind: 'default' } } })
      const saved = await post(started.port, appsResource('com.example.app', httpLayout.theme), JSON.stringify({ kind: 'follow-host' }))
      expect(objectBody(saved.body)).toMatchObject({ result: { kind: 'follow-host' } })
      const badPalette = await post(started.port, appsResource('com.example.app', httpLayout.theme), JSON.stringify({ kind: 'palette', id: 'missing' }))
      expect(badPalette.status).toBe(400)
      const table = await get(started.port, appsResource('com.example.app', httpLayout.storage, 'kv'))
      expect(table.status).toBe(200)
      const denied = await get(started.port, '/api/app/com.example.app/errors')
      expect(denied.status).toBe(401)
      const errors = await get(started.port, '/api/app/com.example.app/errors', token)
      expect(errors.status).toBe(200)
      expect((await post(started.port, '/api/app/com.example.app/alive', '1')).status).toBe(204)
      expect((await post(started.port, '/api/app/com.example.app/errors', JSON.stringify({ kind: 'render', message: 'boom' }))).status).toBe(204)
      expect((await post(started.port, '/api/app/not-an-id/errors', 'x')).status).toBe(204)
      expect((await post(started.port, httpLayout.call, JSON.stringify({ appId: 'com.example.app' }))).status).toBe(400)
      const absentCall = await post(started.port, httpLayout.call, JSON.stringify({ appId: 'com.example.missing', method: 'ping' }))
      expect(objectBody(absentCall.body).ok).toBe(false)
      expect((await post(started.port, '/api/app/com.example.app/errors', 'x'.repeat(70_000))).status).toBe(204)
      expect((await get(started.port, `${appsResource('com.example.app', httpLayout.history)}?limit=0`)).status).toBe(200)
      expect((await get(started.port, `${appsResource('com.example.app', httpLayout.history)}?limit=9999`)).status).toBe(200)
      expect((await get(started.port, platformVendorPath('motion'))).status).toBe(200)
      const probe = await guarded(httpLayout.probe, JSON.stringify({ id: 'nope' }))
      expect(objectBody(probe.body)).toMatchObject({ result: { healthy: false } })
      const badProbe = await guarded(httpLayout.probe, '{}')
      expect(badProbe.status).toBe(400)
      const config = await get(started.port, httpLayout.hostConfig)
      const policy = objectBody(config.body).policy
      const written = await guarded(httpLayout.hostConfig, JSON.stringify({
        ...objectBody(JSON.stringify(policy)),
        hostPort: 9743,
        locale: 'en',
        chatLanguage: 'en',
      }))
      expect(written.status).toBe(200)
      const badConfig = await guarded(httpLayout.hostConfig, '{')
      expect(badConfig.status).toBe(400)
      const activated = await guarded(httpLayout.activate, JSON.stringify({ id: 'echo' }))
      expect(activated.status).toBe(200)
      const badActivate = await guarded(httpLayout.activate, '{}')
      expect(badActivate.status).toBe(400)
      const events = await headers(started.port, httpLayout.events)
      expect(events).toBe(200)
      expect(await headers(started.port, '/api/app/com.example.app/events?since=2')).toBe(200)
      expect(events).toBe(200)
      const removed = await call(started.port, '/api/app/com.example.app', 'DELETE')
      expect(removed.status).toBe(200)
      const trash = await get(started.port, httpLayout.trash)
      const trashed = objectBody(trash.body).apps
      expect(Array.isArray(trashed) ? trashed.length : 0).toBeGreaterThan(0)
      const restored = await post(started.port, `${httpLayout.trash}/com.example.app/${httpLayout.restore}`, '{}')
      expect(restored.status).toBe(200)
      const missing = await post(started.port, httpLayout.call, '{}')
      expect(objectBody(missing.body).error).toBe('missing appId or method')
      expect(objectBody((await get(started.port, '/no-such')).body).error).toMatchObject({ code: 'not-found' })
      expect((await get(started.port, httpLayout.authorSkill)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorSkill, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorSkillReveal, '{}', token)).status).toBe(400)
      expect((await get(started.port, httpLayout.authorMcp)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorMcp, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.authorMcpReveal, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.restart, '{}', token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: 'nope' }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpServers, JSON.stringify({ servers: [{ id: '' }] }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpCheck, JSON.stringify({ id: '' }), token)).status).toBe(400)
      expect((await post(started.port, httpLayout.mcpAdmit, '{}')).status).toBe(400)
      const admitted = await post(started.port, httpLayout.mcpAdmit, JSON.stringify({ text: '[]' }))
      expect(admitted.status).toBe(200)
      const writtenMcp = await post(started.port, httpLayout.mcpServers, JSON.stringify({
        servers: [{
          id: 'demo',
          description: ' Demo ',
          command: 'node',
          args: ['-e', 'process.exit(0)'],
          env: { A: '1' },
          enabled: false,
          disabled: true,
        }],
      }), token)
      expect(writtenMcp.status).toBe(200)
      expect((await get(started.port, httpLayout.mcpServers)).status).toBe(200)
      const openTitled = await post(started.port, appsResource('com.example.app', httpLayout.open), JSON.stringify({ title: 'Title' }))
      expect(openTitled.status).toBe(200)
      expect((await post(started.port, appsResource('com.example.app', httpLayout.storage, httpLayout.restoreStorage), '{}')).status).toBe(400)
    } finally {
      await host.dispose()
    }
  }, 180_000)
})

function headers(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (response) => {
      resolve(response.statusCode ?? 0)
      response.destroy()
      req.destroy()
    })
    req.on('error', reject)
    req.end()
  })
}

function objectBody(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('response is not an object')
  }
  return parsed as Record<string, unknown>
}

function get(port: number, path: string, token?: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'GET', undefined, token)
}

function post(port: number, path: string, body: string, token?: string): Promise<{ status: number; body: string }> {
  return call(port, path, 'POST', body, token)
}

function call(port: number, path: string, method: string, body?: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    if (token !== undefined) headers.authorization = `Bearer ${token}`
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
