import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseAppId, type AppStorage } from '@mohou/contract'
import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  CredentialError,
  bindBrain,
  createAppRegistry,
  createAuthorTools,
  createCredentials,
  emptyCredentials,
  homeCredentialsPath,
  homeLayout,
  runCall,
  type AuthorCallPorts,
} from '../src/index.ts'

const secret = 'ghp_test_secret'

describe('file credentials', () => {
  it('lists names and descriptions, and gets one secret', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mma-cred-'))
    const file = homeCredentialsPath(home)
    expect(file).toBe(join(home, homeLayout.dir, homeLayout.credentials))
    await mkdir(join(home, homeLayout.dir))
    await writeFile(file, JSON.stringify({
      github: { description: '个人 GitHub', secret },
      openai: { description: 'OpenAI', secret: 'sk_other' },
    }))
    const provider = jsonCredentials(file)
    expect(await provider.list()).toEqual([
      { name: 'github', description: '个人 GitHub' },
      { name: 'openai', description: 'OpenAI' },
    ])
    expect(JSON.stringify(await provider.list())).not.toContain(secret)
    expect(await provider.get('github')).toBe(secret)
    expect(await provider.get('missing')).toBeUndefined()
    await expect(provider.get('')).rejects.toMatchObject({ code: 'credential-invalid' })
  })

  it('treats a missing file as an empty source and a bad file as unreadable', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mma-cred-miss-'))
    const file = homeCredentialsPath(home)
    const missing = jsonCredentials(file)
    expect(await missing.list()).toEqual([])
    expect(await missing.get('github')).toBeUndefined()

    await mkdir(join(home, homeLayout.dir))
    await writeFile(file, `{ "github": { "secret": "${secret}"`)
    await expect(jsonCredentials(file).list()).rejects.toMatchObject({ code: 'credential-unreadable' })
    await writeFile(file, JSON.stringify({ github: { token: secret } }))
    const broken = jsonCredentials(file).list()
    await expect(broken).rejects.toBeInstanceOf(CredentialError)
    await expect(broken).rejects.toThrow('incomplete: github')
    await expect(broken).rejects.not.toThrow(secret)
    await expect(jsonCredentials(join(home, homeLayout.dir)).get('github')).rejects.toMatchObject({ code: 'credential-unreadable' })
  })

  it('exposes the list only to the author tool, and get only on ctx', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mma-cred-call-'))
    const file = homeCredentialsPath(home)
    await mkdir(join(home, homeLayout.dir))
    await writeFile(file, JSON.stringify({ github: { description: '个人 GitHub', secret } }))
    const provider = jsonCredentials(file)
    const root = await mkdtemp(join(tmpdir(), 'mma-cred-apps-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(provider),
    })
    const listed = await author.invoke('mini_app_credential_list', {})
    expect(listed).toEqual({ credentials: [{ name: 'github', description: '个人 GitHub' }] })
    expect(JSON.stringify(listed)).not.toContain(secret)
    await author.dispose()

    const brain = await bindBrain({
      provider: createEchoProvider(),
      appDir: '/apps/com.example.app',
      processDirectory: '/proc',
      createTemp: () => '/tmp/run',
      push: () => undefined,
    })
    const value = await runCall({
      appId: parseAppId('com.example.app'),
      appDir: '/apps/com.example.app',
      state: {},
      storage: stubStorage(),
      credentials: provider,
      config: { theme: 'light', palette: 'default', locale: 'en', chatLanguage: 'en', hostPort: 1, llm: null },
      log: () => undefined,
      push: () => undefined,
      http: () => Promise.reject(new Error('unused')),
      bash: () => Promise.reject(new Error('unused')),
      pwsh: () => Promise.reject(new Error('unused')),
      metrics: () => Promise.reject(new Error('unused')),
      mcp: () => Promise.reject(new Error('unused')),
      brain,
    }, {
      read: async ctx => ({
        secret: await ctx.credentials.get('github'),
        keys: Object.keys(ctx.credentials),
      }),
    }, 'read', {})
    expect(value).toEqual({ secret, keys: ['get'] })
    await expect(emptyCredentials().get('')).rejects.toMatchObject({ code: 'credential-invalid' })
    expect(await createCredentials([]).list()).toEqual([])
  })

  it('merges sources and refuses the same name twice', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mma-cred-many-'))
    await mkdir(join(home, homeLayout.dir))
    const first = join(home, homeLayout.dir, 'one.json')
    const second = join(home, homeLayout.dir, 'two.json')
    await writeFile(first, JSON.stringify({ github: { description: '个人 GitHub', secret } }))
    await writeFile(second, JSON.stringify({ openai: { description: 'OpenAI', secret: 'sk_other' } }))
    const merged = createCredentials([
      { kind: 'builtin-json', file: first },
      { kind: 'builtin-json', file: second },
    ])
    expect(await merged.list()).toEqual([
      { name: 'github', description: '个人 GitHub' },
      { name: 'openai', description: 'OpenAI' },
    ])
    expect(await merged.get('openai')).toBe('sk_other')
    await writeFile(second, JSON.stringify({ github: { description: '另一份', secret: 'ghp_other' } }))
    const clash = merged.list()
    await expect(clash).rejects.toMatchObject({ code: 'credential-duplicate' })
    await expect(clash).rejects.not.toThrow(secret)
    await expect(merged.get('github')).rejects.toMatchObject({ code: 'credential-duplicate' })
  })
})

function jsonCredentials(file: string) {
  return createCredentials([{ kind: 'builtin-json', file }])
}

function ports(credentials: ReturnType<typeof jsonCredentials>): AuthorCallPorts {
  return {
    credentials,
    config: { theme: 'light', palette: 'default', locale: 'en', chatLanguage: 'en', hostPort: 0, llm: null },
    log() {},
    push() {},
    http: () => Promise.reject(new Error('unused')),
    bash: () => Promise.reject(new Error('unused')),
    pwsh: () => Promise.reject(new Error('unused')),
    metrics: () => Promise.reject(new Error('unused')),
    processDirectory: '/proc',
    createTemp: () => '/tmp/run',
    provider: createEchoProvider(),
  }
}

function stubStorage(): AppStorage {
  const storage: AppStorage = {
    kv: () => ({
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    }),
    query: () => Promise.resolve([]),
    run: () => Promise.resolve({ changes: 0, lastInsertRowid: 0 }),
    transaction: work => work(storage),
  }
  return storage
}
