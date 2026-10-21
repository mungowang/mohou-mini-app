import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials,
  createAppRegistry,
  createAuthorTools,
  ensureAuthoringToken,
  hostAuthoringToken,
  readAuthoringToken,
  storageDatabase,
  type AuthorCallPorts,
} from '../src/index.ts'

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

const backend = `
  import { defineApp } from '@mohou/contract'
  export default defineApp({
    name: 'Example',
    description: 'One line',
    api: { ping() { return 'pong' } },
  })
`

describe('owner restore and authoring token', () => {
  it('closes the live handle, restores the backup, and creates a token only when missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-restore-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    await registerWithFiles(author, 'com.example.app', {
      'manifest.json': JSON.stringify({
        id: 'com.example.app',
        name: 'Example',
        description: 'One line',
        version: '1',
        entry: 'ui.tsx',
      }),
      'ui.tsx': 'export {}',
      'main.api.ts': backend,
    })
    const appDir = join(root, 'apps', 'com.example.app')
    await author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'schema/001_init.sql',
      content: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO notes (label) VALUES (\'kept\');',
      commit: false,
    })
    expect((await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as { ok: boolean }).ok).toBe(true)
    await expect(author.restoreStorage('com.example.missing')).rejects.toMatchObject({ code: 'app-not-registered' })
    await author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'schema/002_wipe.sql',
      content: 'DELETE FROM notes',
      commit: false,
    })
    expect((await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as { ok: boolean }).ok).toBe(true)
    await author.restoreStorage('com.example.app')
    const raw = new Database(storageDatabase(appDir))
    expect(raw.prepare('SELECT label FROM notes').all()).toEqual([{ label: 'kept' }])
    raw.close()
    ensureAuthoringToken(root)
    const token = await readAuthoringToken(root)
    expect(token.length).toBeGreaterThan(16)
    ensureAuthoringToken(root)
    expect(await readAuthoringToken(root)).toBe(token)
    await writeFile(hostAuthoringToken(root), '')
    await expect(readAuthoringToken(root)).rejects.toMatchObject({ code: 'authoring-token' })
    await author.dispose()
  })
})
