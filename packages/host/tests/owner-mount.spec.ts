import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { HostEnv } from '../src/http/env.ts'
import { httpLayout } from '../src/http/layout.ts'
import { mountOwner } from '../src/http/owner.ts'
import type { LoopbackPorts } from '../src/http/ports.ts'

function basePorts(extra: Record<string, unknown> = {}): LoopbackPorts {
  return {
    list: async () => [],
    listTrash: async () => [],
    deleteApp: async () => undefined,
    undeleteApp: async () => ({}),
    open: async () => ({}),
    reload: async () => undefined,
    call: async () => undefined,
    readPolicy: () => ({
      runtimeRoot: '/tmp',
      hostPort: 9743,
      theme: 'light',
      palette: 'default',
      locale: 'en',
      chatLanguage: 'en',
      llm: null,
      runtimeProvider: { id: 'echo' },
    }),
    writePolicy: async (policy: unknown) => ({ policy: policy as never, restartRequired: false }),
    probe: async () => ({ healthy: true }),
    providers: [{
      id: 'echo',
      label: 'Echo',
      healthy: () => true,
      describe: () => [{ kind: 'secret', name: 'token' }],
      models: async () => [{ provider: 'echo', models: ['echo'] }],
      llm: async () => 'x',
      agent: async () => 'x',
      start: async () => undefined,
      stop: async () => undefined,
    }],
    listPalettes: async () => ({ palettes: [], ignored: [] }),
    readPin: async () => ({ kind: 'default' }),
    setPin: async (_appId: string, pin: unknown) => pin,
    appFile: async () => false,
    readAppTheme: async () => null,
    readHistory: async () => [],
    readCommit: async () => ({}),
    readStorage: async () => ({ bytes: 0, tables: [] }),
    readTable: async () => ({ rows: [] }),
    runnerDocument: async () => '',
    entryScript: async () => '',
    stylesheet: async () => '',
    assetFile: async () => ({ bytes: new Uint8Array(), type: 'application/octet-stream' }),
    restoreStorage: async () => undefined,
    readErrors: () => [],
    vendorFile: async () => '',
    authoringToken: 'token',
    authorized: () => true,
    subscribeHost: () => () => undefined,
    subscribeFrames: () => () => undefined,
    subscribeApp: () => () => undefined,
    checkUpdate: async () => ({ name: 'Mohou', current: '1.0.0', latest: '1.0.0', updateAvailable: false }),
    ackUpdate: async () => undefined,
    readMcp: async () => ({ servers: [], unresolved: [] }),
    writeMcp: async () => undefined,
    checkMcp: async () => ({ ok: true, tools: [] }),
    admitMcp: () => [],
    importMcp: async () => [],
    readCredentials: async () => ({ credentials: [], writable: true }),
    putCredential: async () => undefined,
    removeCredential: async () => undefined,
    ...extra,
  } as unknown as LoopbackPorts
}

async function request(app: Hono<HostEnv>, path: string, init?: RequestInit) {
  const response = await app.request(path, init)
  return { status: response.status, body: await response.text() }
}

describe('mountOwner', () => {
  it('lists, writes, and removes a credential, and refuses a half row', async () => {
    const app = new Hono<HostEnv>()
    const written: string[] = []
    const removed: string[] = []
    mountOwner(app, basePorts({
      readCredentials: async () => ({
        credentials: [{ name: 'github', description: '个人 GitHub' }],
        writable: true,
      }),
      putCredential: async (name: string, description: string, secret: string | undefined) => {
        written.push(`${name}:${description}:${secret === undefined ? 'kept' : secret.length}`)
      },
      removeCredential: async (name: string) => {
        removed.push(name)
      },
    }))
    const listed = await request(app, httpLayout.credentials)
    expect(listed.status).toBe(200)
    expect(JSON.parse(listed.body)).toMatchObject({
      ok: true,
      result: { writable: true, credentials: [{ name: 'github', description: '个人 GitHub' }] },
    })
    const put = await request(app, httpLayout.credentials, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'gitlab', description: 'GitLab', secret: 'glpat_test' }),
    })
    expect(put.status).toBe(200)
    expect(written).toEqual(['gitlab:GitLab:10'])
    // A body with no secret is a description-only save: the route passes the absence through, and
    // Host resolves the stored secret. Nothing is refused here for the missing field itself.
    const noSecret = await request(app, httpLayout.credentials, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'gitlab', description: 'GitLab again' }),
    })
    expect(noSecret.status).toBe(200)
    expect(written).toEqual(['gitlab:GitLab:10', 'gitlab:GitLab again:kept'])
    const noName = await request(app, httpLayout.credentials, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'who?' }),
    })
    expect(noName.status).toBe(400)
    expect(JSON.parse(noName.body)).toMatchObject({ error: { code: 'credential-invalid' } })
    const remove = await request(app, httpLayout.credentialRemove, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'gitlab' }),
    })
    expect(remove.status).toBe(200)
    expect(removed).toEqual(['gitlab'])
    const noRemoveName = await request(app, httpLayout.credentialRemove, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(noRemoveName.status).toBe(400)
    expect(JSON.parse(noRemoveName.body)).toMatchObject({ error: { code: 'credential-invalid' } })
  })

  it('acknowledges the launcher record by attempt time', async () => {
    const app = new Hono<HostEnv>()
    const acked: number[] = []
    mountOwner(app, basePorts({ ackUpdate: async (at: number) => { acked.push(at) } }))
    const body = { method: 'POST', headers: { 'content-type': 'application/json' } }
    const missing = await request(app, httpLayout.updateAck, { ...body, body: JSON.stringify({}) })
    expect(missing.status).toBe(400)
    expect(JSON.parse(missing.body)).toMatchObject({ error: { code: 'config-invalid' } })
    const answered = await request(app, httpLayout.updateAck, { ...body, body: JSON.stringify({ at: 7 }) })
    expect(answered.status).toBe(200)
    expect(acked).toEqual([7])
  })

  it('refuses every guarded route without the authoring token', async () => {
    const app = new Hono<HostEnv>()
    mountOwner(app, basePorts({ authorized: () => false }))
    const guarded = [
      [httpLayout.credentials, 'GET'],
      [httpLayout.credentials, 'POST'],
      [httpLayout.credentialRemove, 'POST'],
      [httpLayout.hostConfig, 'POST'],
      [httpLayout.restart, 'POST'],
      [httpLayout.mcpServers, 'POST'],
      [httpLayout.mcpCheck, 'POST'],
      [httpLayout.updateInstall, 'POST'],
      [httpLayout.activate, 'POST'],
      [httpLayout.probe, 'POST'],
      [httpLayout.authorSkill, 'POST'],
      [httpLayout.authorMcp, 'POST'],
    ] as const
    for (const [path, method] of guarded) {
      const answer = await request(app, path, method === 'GET' ? { method } : {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'github', secret: 'x' }),
      })
      expect(answer.status, path).toBe(401)
      expect(JSON.parse(answer.body), path).toMatchObject({ error: { code: 'authoring-token' } })
    }
  })

  it('reports an unwritable store, and its write failure keeps the code', async () => {
    const app = new Hono<HostEnv>()
    mountOwner(app, basePorts({
      readCredentials: async () => ({ credentials: [], writable: false }),
      putCredential: async () => {
        throw Object.assign(new Error('no credential source can be written'), { code: 'credential-write-unavailable' })
      },
    }))
    const listed = await request(app, httpLayout.credentials)
    expect(JSON.parse(listed.body)).toMatchObject({ result: { writable: false } })
    const put = await request(app, httpLayout.credentials, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'github', secret: 'ghp_test' }),
    })
    expect(put.status).toBe(400)
    expect(JSON.parse(put.body)).toMatchObject({ error: { code: 'credential-write-unavailable' } })
  })

  it('serves a plain panel, painted panel, provider fields, and optional port gaps', async () => {
    const plain = new Hono<HostEnv>()
    mountOwner(plain, basePorts({
      panel: { html: '<!doctype html><html><head></head><body>plain</body></html>', script: 'export {}' },
    }))
    const plainPanel = await request(plain, httpLayout.panel)
    expect(plainPanel.status).toBe(200)
    expect(plainPanel.body).toContain('plain')
    expect((await request(plain, httpLayout.panelScript)).body).toContain('export')

    const painted = new Hono<HostEnv>()
    mountOwner(painted, basePorts({
      panel: {
        html: '<!doctype html><html><head></head><body>paint</body></html>',
        script: 'export {}',
        paint: async () => ({ style: ':root{--x:1}', appearance: 'dark' }),
      },
    }))
    const paintedPanel = await request(painted, httpLayout.panel)
    expect(paintedPanel.body).toContain('data-mode="dark"')
    expect(paintedPanel.body).toContain('--x:1')

    const system = new Hono<HostEnv>()
    mountOwner(system, basePorts({
      panel: {
        html: '<!doctype html><html><head></head><body>sys</body></html>',
        script: 'export {}',
        paint: async () => ({ style: ':root{--y:2}', appearance: 'system' }),
      },
    }))
    expect((await request(system, httpLayout.panel)).body).toContain('prefers-color-scheme')

    const full = new Hono<HostEnv>()
    let restarted = 0
    mountOwner(full, basePorts({
      restart: async () => {
        restarted += 1
      },
      readAuthorSkill: async (dirs?: readonly string[]) => ({
        skillId: 'mohou-mini-app',
        version: '1.0.0',
        agents: [],
        customs: dirs ?? [],
      }),
      writeAuthorSkill: async (agents: readonly string[], dirs: readonly string[]) => ({
        skillId: 'mohou-mini-app',
        version: '1.0.0',
        agents,
        customs: dirs,
      }),
      revealAuthorSkill: async () => undefined,
      readAuthorMcp: async () => ({ agents: [], description: '' }),
      writeAuthorMcp: async (agents: readonly string[], description: string) => ({
        agents: agents.map(id => ({ id, path: `/tmp/${id}` })),
        description,
      }),
      revealAuthorMcp: async () => undefined,
      providers: [
        {
          id: 'bare',
          healthy: () => true,
          llm: async () => 'x',
          agent: async () => 'x',
          start: async () => undefined,
          stop: async () => undefined,
        },
        {
          id: 'echo',
          label: 'Echo',
          healthy: () => true,
          describe: () => [{ kind: 'secret', name: 'token' }],
          models: async () => [{ provider: 'echo', models: ['echo'] }],
          llm: async () => 'x',
          agent: async () => 'x',
          start: async () => undefined,
          stop: async () => undefined,
        },
      ],
    }))
    const providers = await request(full, httpLayout.providers)
    expect(providers.status).toBe(200)
    expect(providers.body).toContain('"id":"bare"')
    expect(providers.body).toContain('"label":"Echo"')
    expect((await request(full, `${httpLayout.authorSkill}?custom=`)).status).toBe(200)
    expect((await request(full, `${httpLayout.authorSkill}?custom=/a%0A/b`)).status).toBe(200)
    expect((await request(full, httpLayout.authorSkill, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentIds: ['pi'], customDirs: ['/x'] }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.authorSkillReveal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dest: '/tmp' }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.authorMcp)).status).toBe(200)
    expect((await request(full, httpLayout.authorMcp, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentIds: ['pi'], description: 'hello' }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.authorMcpReveal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dest: '/tmp' }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.restart, { method: 'POST' })).status).toBe(200)
    expect((await request(full, httpLayout.activate, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'echo', config: { model: 'echo' } }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.mcpServers, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [{
          id: 'remote',
          url: 'https://example.test/mcp',
          transport: 'sse',
          headers: { Authorization: 'Bearer x' },
        }],
      }),
    })).status).toBe(200)
    expect((await request(full, httpLayout.mcpCheck, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'remote', url: 'https://example.test/mcp', transport: 'streamable-http' }),
    })).status).toBe(200)
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(restarted).toBe(1)
  })
})
