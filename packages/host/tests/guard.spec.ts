import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appEntries } from '@mohou/contract'
import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import {
  emptyCredentials, createAppRegistry, createAuthorTools, type AuthorCallPorts } from '../src/index.ts'

describe('agent file writes', () => {
  it('keeps a file the agent wrote with its own tools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-guard-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    await registerWithFiles(author, 'com.example.app', {
      [appEntries.manifest]: JSON.stringify({
        id: 'com.example.app',
        name: 'Example',
        description: 'One line',
        version: '1',
        entry: appEntries.ui,
      }),
      [appEntries.ui]: 'export const n = 1\n',
      [appEntries.backend]: 'export {}\n',
    })
    const app = await author.invoke('mini_app_get', { appId: 'com.example.app' }) as { directory: string }
    await writeFile(join(app.directory, appEntries.ui), 'export const n = 2\n')
    await author.invoke('mini_app_list_files', { appId: 'com.example.app' })
    expect(await readFile(join(app.directory, appEntries.ui), 'utf8')).toBe('export const n = 2\n')
    await author.dispose()
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
