import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createCredentials, createHost } from '@mohou/host'
import { createEchoProvider } from '@mohou/runtime-provider'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerWithFiles } from '../../host/tests/author-seed.ts'
import { httpPanelClients } from '../src/http-client.ts'

describe('httpPanelClients', () => {
  it('reads the gallery and policy from the loopback listener', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-panel-http-'))
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: 0, theme: 'dark', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      credentials: createCredentials([{ kind: 'builtin-json', file: join(root, 'credentials.json') }]),
    })
    const started = await host.start()
    const client = httpPanelClients(`http://127.0.0.1:${started.port}`)
    try {
      expect(await client.list()).toEqual([])
      if (client.listTrash === undefined) throw new Error('trash client is missing')
      expect(await client.listTrash()).toEqual([])
      const policy = await client.readPolicy()
      expect(policy.theme).toBe('dark')
      const written = await client.writePolicy({ ...policy, hostPort: 9743, locale: 'en', chatLanguage: 'en' })
      expect(written.policy.locale).toBe('en')
      expect((await client.probe('echo')).healthy).toBe(true)
      if (client.checkUpdate === undefined) throw new Error('update client is missing')
      await client.checkUpdate()
      expect((await client.listPalettes()).palettes.length).toBeGreaterThan(0)
      await registerWithFiles(host.author, 'com.example.app', {
        'manifest.json': JSON.stringify({
          id: 'com.example.app',
          name: 'Example',
          description: 'One line',
          version: '1',
          entry: 'ui.tsx',
          tags: ['desk', 'desk'],
        }),
        'ui.tsx': 'export default function View() { return null }\n',
        'main.api.ts': 'export {}\n',
      })
      expect((await client.list())[0]?.tags).toEqual(['desk'])
      expect((await client.list())[0]?.activity).toBeUndefined()
      await client.open('com.example.app')
      expect((await client.list())[0]?.activity?.openCount).toBe(1)
      expect(Array.isArray(await client.readHistory('com.example.app'))).toBe(true)
      expect((await client.readStorage('com.example.app')).bytes).toBeGreaterThanOrEqual(0)
      expect((await client.readPin?.('com.example.app'))?.kind).toBe('default')
      expect(await client.setPin('com.example.app', { kind: 'follow-host' })).toEqual({ kind: 'follow-host' })
      expect(await client.appFile?.('com.example.app')).toBe(false)
      await expect(client.open('com.example.missing')).rejects.toMatchObject({ code: 'failed' })
      // The credential routes require the panel's own token, which the client reads from the about block.
      expect(await client.readCredentials?.()).toEqual({ credentials: [], writable: true })
      await client.putCredential?.('github', 'GitHub', 'ghp_test')
      expect(await client.readCredentials?.()).toEqual({ credentials: [{ name: 'github', description: 'GitHub' }], writable: true })
      // A save that omits the secret keeps the stored one: Host resolves it, and the secret still reads back.
      await client.putCredential?.('github', 'Work GitHub')
      expect(await client.readCredentials?.()).toEqual({ credentials: [{ name: 'github', description: 'Work GitHub' }], writable: true })
      expect(JSON.parse(readFileSync(join(root, 'credentials.json'), 'utf8'))).toEqual({ github: { description: 'Work GitHub', secret: 'ghp_test' } })
      // An empty secret means the same thing, and a name with nothing stored has none to keep.
      await client.putCredential?.('github', 'Personal GitHub', '')
      expect((await client.readCredentials?.())?.credentials).toEqual([{ name: 'github', description: 'Personal GitHub' }])
      // The adapter normalizes a panel error to `failed`; the host's own sentence survives in it.
      await expect(client.putCredential?.('gitlab', 'GitLab')).rejects.toMatchObject({
        code: 'failed',
        message: expect.stringContaining('credential has no secret to keep: gitlab'),
      })
      await client.removeCredential?.('github')
      expect((await client.readCredentials?.())?.credentials).toEqual([])
      await expect(httpPanelClients('http://127.0.0.1:1').list()).rejects.toMatchObject({ code: 'unreachable' })
    } finally {
      await host.dispose()
    }
  }, 120_000)

  it('reads a well-formed wire body', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: true,
      json: async () => wire(String(input)),
    })))
    const client = httpPanelClients('http://127.0.0.1')
    expect((await client.list())[0]).toMatchObject({
      name: 'Example',
      tags: ['desk'],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect((await client.readHistory('com.example.app'))[0]?.id).toBe('abc')
    expect((await client.readCommit('com.example.app', 'abc')).files[0]?.path).toBe('ui.tsx')
    expect((await client.readStorage('com.example.app')).tables).toEqual(['kv'])
    expect((await client.readTable('com.example.app', 'kv')).rows).toEqual([{ k: 1 }])
    expect((await client.listPalettes()).ignored[0]?.file).toBe('nope.css')
    expect((await client.readPin?.('com.example.app'))?.kind).toBe('palette')
    expect(await client.readAppTheme?.('com.example.app')).toBeNull()
    const policy = await client.readPolicy()
    expect(policy.llm?.model).toBe('echo')
    expect(policy.theme).toBe('dark')
    await client.deleteApp('com.example.app')
    await client.reload?.('com.example.app')
    expect((await client.readSkill?.())?.skillId).toBe('mohou-mini-app')
    expect((await client.readAuthorMcp?.())?.agents[0]?.id).toBe('pi')
    expect((await client.listMcp?.())?.servers[0]?.env?.K).toBe('v')
    expect((await client.checkMcp?.({ id: 'echo', command: 'echo' }))?.ok).toBe(true)
    expect((await client.admitMcp?.('{}'))?.[0]?.id).toBe('from')
    expect((await client.importMcp?.('pi'))?.[0]?.id).toBe('from')
    await client.installSkill?.(['pi'], [])
    await client.installAuthorMcp?.(['pi'], 'blurb')
    expect((await client.readSkill?.(['/tmp/skills']))?.agents).toEqual([])
    expect((await client.readAuthorMcp?.())?.agents).toHaveLength(1)
    expect((await client.listRuntimes?.())?.[0]?.models).toEqual([])
    expect((await client.listMcp?.())?.servers[0]?.enabled).toBe(false)
  })

  it('reads the remaining wire shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: true,
      json: async () => dense(String(input)),
    })))
    const client = httpPanelClients('http://127.0.0.1')
    const servers = await client.listMcp?.()
    expect(servers?.servers[0]).toMatchObject({ id: 'sse', transport: 'sse', description: 'd', args: ['a'] })
    expect(servers?.unresolved[0]).toMatchObject({ id: 'git', code: 'mcp-reference-unknown' })
    expect((await client.checkMcp?.({ id: 'sse' }))).toMatchObject({ ok: false, code: 'mcp-start-failed', message: 'down' })
    expect((await client.checkMcp?.({ id: 'sse' }))?.tools).toEqual([
      { name: 'ping', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } },
      { name: 'bare' },
    ])
    expect((await client.readAbout?.())?.authoring.tools[0]?.name).toBe('mini_app_register')
    expect((await client.readAbout?.())?.source).toEqual({ channel: 'registry', registry: 'https://registry.npmmirror.com' })
    expect((await client.readSkill?.())?.customs[0]?.dir).toBe('/tmp/skills')
    expect((await client.readAuthorMcp?.())?.agents[0]?.id).toBe('pi')
    expect((await client.listRuntimes?.())?.[0]?.label).toBe('Echo')
    const update = await client.checkUpdate?.()
    expect(update?.latest).toBeNull()
    expect(update?.lastAttempt).toEqual({ state: 'failed', code: 'exit', from: '1.0.0', to: '1.1.0', rolledBack: true, exitCode: 2, at: 7 })
    expect((await client.listPalettes?.())?.palettes).toEqual([])
    // Every guarded route presents the panel token, which the client reads from the about block,
    // and a read route presents nothing.
    await client.readCredentials?.()
    await client.putCredential?.('github', 'GitHub', 'ghp_test')
    await client.removeCredential?.('github')
    await client.probe('echo')
    const written = await client.writeMcp?.([{ id: 'git', command: 'npx', env: { TOKEN: '${credential:DEMO}' } }])
    expect(written?.unresolved).toEqual([{ id: 'git', code: 'mcp-reference-unknown', message: 'git env.TOKEN names an unknown credential: nope' }])
    await client.checkMcp?.({ id: 'echo' })
    await client.installSkill?.([], [])
    await client.installAuthorMcp?.([], 'd')
    await client.installUpdate?.('1.0.0')
    await client.restartHost?.()
    const guardedPosts = ['/api/credentials', '/api/credentials/remove', '/api/runtime-providers/probe', '/api/mcp-servers', '/api/author-skill', '/api/author-mcp', '/api/updates/install', '/api/restart']
    const calls = vi.mocked(fetch).mock.calls as unknown as Array<[string, { method?: string; headers?: Record<string, string> }]>
    const writes = calls.filter(([url, init]) => init.method !== 'GET' && guardedPosts.some(part => String(url).includes(part)))
    expect(writes.length).toBeGreaterThanOrEqual(guardedPosts.length)
    expect(new Set(writes.map(([, init]) => init.headers?.authorization))).toEqual(new Set(['Bearer t']))
    const credentialRead = calls.find(([url, init]) => init.method === 'GET' && String(url).endsWith('/api/credentials'))
    expect(credentialRead?.[1].headers?.authorization).toBe('Bearer t')
    const readMcp = calls.find(([url, init]) => String(url).endsWith('/api/mcp-servers') && init.method === 'GET')
    expect(readMcp?.[1].headers?.authorization).toBeUndefined()
  })

  it('drops an update source that names an incomplete one', async () => {
    const answer = (source: unknown) => vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, name: 'h', current: '1', platform: 'd', source, authoring: { url: 'u', token: 't', tools: [] } }),
    }))
    vi.stubGlobal('fetch', answer({ channel: 'registry' }))
    expect((await httpPanelClients('http://127.0.0.1').readAbout?.())?.source).toBeUndefined()
    vi.stubGlobal('fetch', answer({ channel: 'tarball', tarballDir: '' }))
    expect((await httpPanelClients('http://127.0.0.1').readAbout?.())?.source).toBeUndefined()
    vi.stubGlobal('fetch', answer({ channel: 'npm' }))
    expect((await httpPanelClients('http://127.0.0.1').readAbout?.())?.source).toBeUndefined()
    vi.stubGlobal('fetch', answer({ channel: 'none' }))
    expect((await httpPanelClients('http://127.0.0.1').readAbout?.())?.source).toEqual({ channel: 'none' })
  })

  it('drops a recorded attempt this panel does not understand', async () => {
    const answer = (lastAttempt: unknown) => vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, name: 'h', current: '1', latest: null, updateAvailable: false, lastAttempt }),
    }))
    vi.stubGlobal('fetch', answer({ state: 'failed', code: 'melted', at: 1 }))
    expect((await httpPanelClients('http://127.0.0.1').checkUpdate?.())?.lastAttempt).toBeUndefined()
    vi.stubGlobal('fetch', answer({ state: 'failed', at: 1 }))
    expect((await httpPanelClients('http://127.0.0.1').checkUpdate?.())?.lastAttempt).toBeUndefined()
    vi.stubGlobal('fetch', answer({ state: 'done', code: 'exit', to: '1.1.0', at: 2 }))
    expect((await httpPanelClients('http://127.0.0.1').checkUpdate?.())?.lastAttempt).toEqual({ state: 'done', to: '1.1.0', at: 2 })
  })

  it('rejects a wire body that is not the panel shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ commits: [{ id: 1 }], result: { healthy: 'no' }, apps: [{ id: 1 }] }),
    })))
    const client = httpPanelClients('')
    await expect(client.list()).rejects.toMatchObject({ code: 'failed' })
    await expect(client.readHistory('com.example.app')).rejects.toMatchObject({ code: 'failed' })
    await expect(client.probe('echo')).rejects.toMatchObject({ code: 'failed' })
    await expect(client.readCommit('com.example.app', 'abc')).rejects.toMatchObject({ code: 'failed' })
    await expect(client.readStorage('com.example.app')).rejects.toMatchObject({ code: 'failed' })
    await expect(client.setPin('com.example.app', { kind: 'default' })).rejects.toMatchObject({ code: 'failed' })
    await expect(client.listPalettes()).rejects.toMatchObject({ code: 'failed' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'down' }) })))
    await expect(client.list()).rejects.toMatchObject({ message: 'down' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'closed' } }) })))
    await expect(client.open('com.example.app')).rejects.toMatchObject({ message: 'closed' })
  })

  it('parses dense gallery and policy fields, and rejects more bad shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: true,
      json: async () => rich(String(input)),
    })))
    const client = httpPanelClients('http://127.0.0.1')
    const listed = await client.list()
    expect(listed[0]).toMatchObject({
      kind: 'workbench',
      activity: { openCount: 2 },
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect((await client.listPalettes()).palettes[0]).toMatchObject({ swatch: '#111', style: ':root{}', origin: 'custom' })
    expect((await client.readPin?.('com.example.app'))?.kind).toBe('app-file')
    expect(await client.readAppTheme?.('com.example.app')).toEqual({ name: 'Moss', nameZh: '苔', swatch: '#111', style: ':root{}' })
    const policy = await client.readPolicy()
    expect(policy.defaultWorkbenchId).toBe('com.example.desk')
    expect(policy.theme).toBe('light')
    expect(policy.llm).toBeNull()
    const written = await client.writePolicy(policy)
    expect(written.restartRequired).toBe(true)
    expect(written.policy.theme).toBe('system')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { appTheme: null } }),
    })))
    expect(await client.readAppTheme?.('com.example.app')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { appTheme: { name: '', swatch: 1, style: ':root{}' } } }),
    })))
    expect(await client.readAppTheme?.('com.example.app')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { appTheme: { swatch: '#111', style: ':root{}' } } }),
    })))
    expect(await client.readAppTheme?.('com.example.app')).toEqual({ swatch: '#111', style: ':root{}' })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { appTheme: { name: 'Moss', nameZh: '', swatch: '#111', style: ':root{}' } } }),
    })))
    expect(await client.readAppTheme?.('com.example.app')).toEqual({ name: 'Moss', swatch: '#111', style: ':root{}' })

    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: true,
      json: async () => bad(String(input)),
    })))
    const broken = httpPanelClients('http://127.0.0.1')
    await expect(broken.list()).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readHistory('com.example.app')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readCommit('com.example.app', 'x')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readStorage('com.example.app')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readTable('com.example.app', 'kv')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.listPalettes()).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readPin?.('com.example.app')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.probe('echo')).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.listMcp?.()).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.checkUpdate?.()).rejects.toMatchObject({ code: 'failed' })
    await expect(broken.readSkill?.()).rejects.toMatchObject({ code: 'failed' })
    expect((await broken.readAuthorMcp?.())?.agents).toEqual([])
    await expect(broken.listRuntimes?.()).rejects.toMatchObject({ code: 'failed' })
  })
})

function dense(url: string): unknown {
  if (url.includes('/probe')) return { ok: true, result: { healthy: true } }
  if (url.includes('/api/credentials')) return { ok: true, result: { credentials: [{ name: 'github', description: 'GitHub' }], writable: true } }
  if (url.includes('/check')) {
    return {
      ok: true,
      result: {
        ok: false,
        tools: [
          { name: 'ping', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } },
          { nope: true },
          { name: 'bare', inputSchema: 'text', outputSchema: [1] },
        ],
        code: 'mcp-start-failed',
        message: 'down',
      },
    }
  }
  if (url.includes('/about')) {
    return {
      ok: true,
      name: 'host',
      current: '1',
      platform: 'darwin',
      source: { channel: 'registry', registry: 'https://registry.npmmirror.com' },
      authoring: { url: 'http://x', token: 't', tools: [{ name: 'mini_app_register', description: 'create' }, { description: 'skip' }] },
    }
  }
  if (url.includes('/author-skill')) return { ok: true, result: { skillId: 's', version: '', agents: [{ id: 'pi', label: 'Pi', dest: '/tmp/x', skillsDir: '/tmp', homePresent: false, installed: false }], customs: [{ dir: '/tmp/skills', dest: '/tmp/skills/s', installed: true, version: '1.0.0', updateAvailable: true }] } }
  if (url.includes('/author-mcp')) return { ok: true, result: { agents: [{ id: 'pi', label: 'Pi', dest: '/tmp/mcp.json', homePresent: false, installed: false, updateAvailable: false }, { id: 'skip' }] } }
  if (url.includes('/runtime-providers')) return { providers: [{ id: 'echo', label: 'Echo', models: [{ provider: 'echo', models: ['m'] }] }] }
  if (url.endsWith('/api/updates')) {
    return {
      ok: true,
      name: 'h',
      current: '1',
      latest: null,
      updateAvailable: false,
      error: 'x',
      lastAttempt: { state: 'failed', code: 'exit', from: '1.0.0', to: '1.1.0', rolledBack: true, exitCode: 2, at: 7 },
    }
  }
  if (url.endsWith('/api/palettes')) return { palettes: [], ignored: [] }
  return { ok: true, result: { servers: [{ id: 'sse', description: 'd', url: 'https://x', transport: 'sse', args: ['a', 1], env: {}, headers: { A: 'b' } }], unresolved: [{ id: 'git', code: 'mcp-reference-unknown', message: 'git env.TOKEN names an unknown credential: nope' }] } }
}

function wire(url: string): unknown {
  if (url.endsWith('/api/about')) return { ok: true, name: 'h', current: '1', platform: 'd', authoring: { url: 'u', token: 't', tools: [] } }
  if (url.includes('/api/author-skill')) {
    if (url.includes('custom=')) {
      return { ok: true, result: { skillId: 'mohou-mini-app', agents: [{ id: 'pi' }], customs: [{ dest: '/tmp/x' }] } }
    }
    return { ok: true, result: { skillId: 'mohou-mini-app', version: '1.0.2', agents: [{ id: 'pi', label: 'Pi', dest: '/tmp/skills/x', skillsDir: '/tmp/skills', homePresent: true, installed: true, version: '1.0.2', updateAvailable: false }], customs: [] } }
  }
  if (url.includes('/api/author-mcp')) {
    return { ok: true, result: { agents: [{ id: 'pi', label: 'Pi', dest: '/tmp/mcp.json', homePresent: true, installed: true, updateAvailable: false }, { dest: '/tmp/x' }] } }
  }
  if (url.endsWith('/api/runtime-providers')) {
    return { providers: [{ id: 'echo', label: 'Echo', models: [{ provider: 'echo', models: [''] }, { provider: '', models: ['x'] }] }] }
  }
  if (url.includes('/api/mcp-servers/check')) return { ok: true, result: { ok: true, tools: [{ name: 'ping' }] } }
  if (url.includes('/api/mcp-servers/admit') || url.includes('/api/mcp-servers/import')) {
    return { ok: true, result: { servers: [{ id: 'from', command: 'npx' }] } }
  }
  if (url.endsWith('/api/mcp-servers')) {
    return { ok: true, result: { servers: [{ id: 'echo', command: 'echo', env: { K: 'v' }, headers: { A: 'b' }, disabled: true }], unresolved: [{ id: 'git', code: 'mcp-reference-unknown', message: 'git env.TOKEN names an unknown credential: nope' }] } }
  }
  if (url.endsWith('/history/abc')) {
    return { ok: true, result: { message: 'm', time: 't', parentIds: [], files: [{ path: 'ui.tsx', add: 1, del: 0, preview: '+' }] } }
  }
  if (url.includes('/history')) return { commits: [{ id: 'abc', message: 'm', time: 't', parentIds: [] }] }
  if (url.includes('/storage/kv')) return { ok: true, result: { rows: [{ k: 1 }] } }
  if (url.includes('/storage')) return { ok: true, result: { bytes: 3, tables: ['kv'] } }
  if (url.includes('/theme')) return { ok: true, result: { pin: { kind: 'palette', id: 'slate' }, appFile: false } }
  if (url.endsWith('/api/palettes')) return { palettes: [{ id: 'slate', name: 'Slate' }], ignored: [{ file: 'nope.css', reason: 'name' }] }
  if (url.endsWith('/api/host-config')) {
    return {
      ok: true,
      policy: {
        theme: 'dark',
        palette: 'slate',
        locale: 'en',
        chatLanguage: 'en',
        hostPort: 9743,
        llm: { provider: 'echo', model: 'echo' },
        runtimeProvider: { id: 'echo' },
      },
    }
  }
  return {
    apps: [{
      id: 'com.example.app',
      name: 'Example',
      description: 'd',
      version: '1',
      acronym: 'EX',
      tags: ['desk'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }
}

function rich(url: string): unknown {
  if (url.includes('/theme')) return { ok: true, result: { pin: { kind: 'app-file' }, appFile: true, appTheme: { name: 'Moss', nameZh: '苔', swatch: '#111', style: ':root{}' } } }
  if (url.endsWith('/api/palettes')) {
    return {
      palettes: [{ id: 'slate', name: 'Slate', swatch: '#111', style: ':root{}', origin: 'custom' }],
      ignored: [],
    }
  }
  if (url.endsWith('/api/host-config')) {
    return {
      ok: true,
      policy: {
        theme: 'neon',
        palette: 1,
        locale: 1,
        chatLanguage: 1,
        hostPort: 'x',
        llm: null,
        runtimeProvider: { id: 'echo' },
        defaultWorkbenchId: 'com.example.desk',
      },
      result: {
        policy: {
          theme: 'system',
          palette: 'slate',
          locale: 'en',
          chatLanguage: 'en',
          hostPort: 9743,
          llm: null,
          runtimeProvider: { id: 'echo' },
        },
        restartRequired: true,
      },
    }
  }
  return {
    apps: [{
      id: 'com.example.desk',
      name: 'Desk',
      description: 'home',
      version: '1',
      acronym: 'DE',
      kind: 'workbench',
      updatedAt: '2026-01-02T00:00:00.000Z',
      activity: { openCount: 2, lastOpenedAt: '2026-01-02T00:00:00.000Z' },
    }],
  }
}

function bad(url: string): unknown {
  if (url.includes('/history/')) {
    return {
      ok: true,
      result: {
        message: 'm',
        time: 't',
        parentIds: [],
        files: [{ path: 'ui.tsx', add: 'x', del: 0, preview: '+' }],
      },
    }
  }
  if (url.includes('/history')) return { commits: [{ id: 1, message: 'm', time: 't', parentIds: [] }] }
  if (url.includes('/storage/')) return { ok: true, result: { rows: 'nope' } }
  if (url.includes('/storage')) return { ok: true, result: { bytes: 'x', tables: [] } }
  if (url.includes('/theme')) return { ok: true, result: { pin: { kind: 'palette' } } }
  if (url.endsWith('/api/palettes')) return { palettes: [{ id: 1, name: 'x' }], ignored: [{ file: 1, reason: 'r' }] }
  if (url.includes('/probe')) return { ok: true, result: { healthy: 'yes' } }
  if (url.includes('/mcp-servers')) return { ok: true, result: { servers: [{ id: 1 }] } }
  if (url.endsWith('/api/updates')) return { ok: true, name: 1, current: '1', latest: null, updateAvailable: false }
  if (url.includes('/author-skill')) return { ok: true, result: { skillId: 1, version: '1', agents: [], customs: [] } }
  if (url.includes('/author-mcp')) return { ok: true, result: { agents: [{ id: 'pi', dest: 1 }] } }
  if (url.includes('/runtime-providers')) return { providers: [{ id: 1 }] }
  if (url.endsWith('/api/about')) return { ok: true, name: 'h', current: '1', platform: 'd', authoring: { url: 'u', token: 't', tools: [] } }
  return { apps: [{ id: 'a', name: 'n', description: 'd', version: '1', acronym: 'EX', tags: [1], activity: { openCount: 'x', lastOpenedAt: 't' } }] }
}

afterEach(() => {
  vi.unstubAllGlobals()
})
