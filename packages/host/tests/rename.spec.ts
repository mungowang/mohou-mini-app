import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createAppRegistry } from '../src/apps/registry.ts'
import { recordOpen } from '../src/host/activity.ts'
import { hostActivityPath, hostConfigPath } from '../src/host/layout.ts'
import { createAuthorTools, type AuthorCallPorts } from '../src/index.ts'
import { emptyCredentials } from '../src/credentials/provider.ts'
import { McpClient } from '@mohou/mcp-client'
import { registerWithFiles } from './author-seed.ts'

const manifest = JSON.stringify({
  id: 'com.example.app',
  name: 'Example',
  description: 'One line',
  version: '1',
  entry: 'ui.tsx',
})

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: { theme: 'system', palette: 'default', locale: 'en', chatLanguage: 'en', hostPort: 9741, llm: null },
    log: () => undefined,
    push: () => undefined,
    http: { request: () => Promise.reject(new Error('unused')) },
    bash: () => Promise.reject(new Error('unused')),
    pwsh: () => Promise.reject(new Error('unused')),
    metrics: () => Promise.resolve({ cpu: 0, memory: 0 }),
    processDirectory: tmpdir(),
    createTemp: () => tmpdir(),
    provider: { id: 'echo', start: () => Promise.resolve(), stop: () => Promise.resolve(), healthy: () => true, llm: () => Promise.resolve(''), agent: () => Promise.resolve('') },
    workbench: {
      listApps: () => Promise.resolve([]),
      openApp: () => Promise.resolve(),
      listTrash: () => Promise.resolve([]),
      restoreApp: () => Promise.resolve(),
      readDefault: () => undefined,
      writeDefault: () => Promise.resolve(),
      locale: () => 'en',
    },
  } as unknown as AuthorCallPorts
}

describe('mini_app_rename', () => {
  it('moves the directory, manifest, usage, homepage pin, and trash copies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-rename-'))
    const registry = createAppRegistry(root)
    const author = createAuthorTools({ registry, mcp: new McpClient({}), ports: ports() })
    await registerWithFiles(author, 'com.example.app', {
      'manifest.json': manifest,
      'ui.tsx': 'export {}\n',
      'main.api.ts': 'export default function () { return {} }\n',
    })
    recordOpen(root, 'com.example.app', '2026-10-09T00:00:00.000Z')
    await writeFile(hostConfigPath(root), `${JSON.stringify({
      runtimeRoot: root,
      hostPort: 9741,
      theme: 'system',
      palette: 'default',
      locale: 'en',
      chatLanguage: 'en',
      llm: null,
      runtimeProvider: { id: 'echo' },
      defaultWorkbenchId: 'com.example.old',
    }, null, 2)}\n`)
    await author.invoke('mini_app_delete', { appId: 'com.example.app' }).catch(() => undefined)
    // delete is not the trash path the panel uses; trash through the registry after a fresh register
    await registerWithFiles(author, 'com.example.old', {
      'manifest.json': manifest.replace('com.example.app', 'com.example.old'),
      'ui.tsx': 'export {}\n',
      'main.api.ts': 'export {}\n',
    })
    await registry.trash('com.example.old')
    await registerWithFiles(author, 'com.example.old', {
      'manifest.json': manifest.replaceAll('com.example.app', 'com.example.old'),
      'ui.tsx': 'export {}\n',
      'main.api.ts': 'export {}\n',
    })
    recordOpen(root, 'com.example.old', '2026-10-09T01:00:00.000Z')
    const renamed = await author.invoke('mini_app_rename', { appId: 'com.example.old', newAppId: 'com.example.new' }) as { id: string; directory: string; commit: { status: string } }
    expect(renamed.id).toBe('com.example.new')
    expect(renamed.commit.status).toBe('committed')
    expect(renamed.directory.endsWith('com.example.new')).toBe(true)
    const text = await readFile(join(renamed.directory, 'manifest.json'), 'utf8')
    const parsed = JSON.parse(text) as { id: string }
    expect(parsed.id).toBe('com.example.new')
    const activity = JSON.parse(await readFile(hostActivityPath(root), 'utf8')) as { apps: Record<string, unknown> }
    expect(activity.apps['com.example.old']).toBeUndefined()
    expect(activity.apps['com.example.new']).toMatchObject({ openCount: 1 })
    const trash = await registry.listTrash()
    expect(trash.map(app => app.id)).toContain('com.example.new')
    expect(trash.map(app => app.id)).not.toContain('com.example.old')
    const config = JSON.parse(await readFile(hostConfigPath(root), 'utf8')) as { defaultWorkbenchId: string }
    expect(config.defaultWorkbenchId).toBe('com.example.new')
    await expect(author.invoke('mini_app_rename', {
      appId: 'com.example.new',
      newAppId: 'com.example.new',
    })).rejects.toMatchObject({ code: 'app-id-invalid' })
    await expect(author.invoke('mini_app_rename', {
      appId: 'com.missing.app',
      newAppId: 'com.example.other',
    })).rejects.toMatchObject({ code: 'app-not-registered' })
    await expect(author.invoke('mini_app_rename', { appId: 'com.example.new', newAppId: 'com.example.app' })).rejects.toMatchObject({ code: 'app-duplicate' })
  })
})
