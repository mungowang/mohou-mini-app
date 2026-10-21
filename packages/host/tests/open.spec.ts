import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials, createAppRegistry, createAuthorTools, type AuthorCallPorts, type HostEvent } from '../src/index.ts'

const files = {
  'manifest.json': JSON.stringify({
    id: 'com.example.app',
    name: 'Example',
    description: 'One line',
    version: '1',
    entry: 'ui.tsx',
  }),
  'ui.tsx': 'export {}',
  'main.api.ts': 'export {}\n',
}

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

describe('open and delete', () => {
  it('notifies a panel, keeps the error ring, and deletes only through the owner path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-open-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    await registerWithFiles(author, 'com.example.app', files)
    const closed = await author.invoke('mini_app_open', { appId: 'com.example.app' })
    expect(closed).toEqual({ panel: 'no-panel-connected' })
    const beforeOpen = await author.invoke('mini_app_errors', { appId: 'com.example.app' }) as { emptyHint?: string }
    expect(beforeOpen.emptyHint).toBeUndefined()
    author.errors.clearReload('com.example.app')
    const afterReload = await author.invoke('mini_app_errors', { appId: 'com.example.app' }) as { emptyHint?: string }
    expect(afterReload.emptyHint).toContain('open')
    const seen: HostEvent[] = []
    const stop = author.hostEvents.subscribe((event) => {
      seen.push(event)
    })
    expect(await author.invoke('mini_app_open', { appId: 'com.example.app', title: 'Example' })).toEqual({ panel: 'notified' })
    expect(seen[0]).toEqual({ type: 'app:open', appId: 'com.example.app', title: 'Example' })
    author.errors.record('com.example.app', { kind: 'render', message: 'boom', componentStack: 'at App' })
    author.errors.record('com.example.app', { kind: 'noise', message: 'drop' })
    author.errors.record('com.example.app', { kind: 'uncaught', message: '' })
    const listed = await author.invoke('mini_app_errors', { appId: 'com.example.app', since: 0 }) as { errors: Array<{ message: string }> }
    expect(listed.errors.map(item => item.message)).toEqual(['boom'])
    await expect(author.invoke('mini_app_open', { appId: 'com.example.app', title: 1 })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_errors', { appId: 'com.example.missing' })).rejects.toMatchObject({ code: 'app-not-registered' })
    await expect(author.invoke('mini_app_errors', { appId: 'com.example.app', since: -1 })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_errors', { appId: 'com.example.app', clear: 'yes' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_install', { appId: 'com.example.app', packages: 'no' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_install', { appId: 'com.example.app', remove: {} })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_install', {
      appId: 'com.example.app',
      packages: [{ name: 'left-pad', version: 1 }],
    })).rejects.toMatchObject({ code: 'tool-args' })
    expect(await author.invoke('mini_app_open', { appId: 'com.example.app', title: '' })).toMatchObject({ panel: 'notified' })
    await expect(author.invoke('mini_app_history_list', { appId: 'com.example.app', limit: '2' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_install', { appId: 'com.example.app', remove: [''] })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_install', { appId: 'com.example.app', packages: [{}] })).rejects.toMatchObject({ code: 'tool-args' })
    await author.deleteApp('com.example.app')
    expect((await author.invoke('mini_app_list', {}) as { apps: unknown[] }).apps).toHaveLength(0)
    await expect(author.deleteApp('com.example.app')).rejects.toMatchObject({ code: 'app-not-registered' })
    stop()
    await author.dispose()
  })
})
