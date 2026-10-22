import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider, type RuntimeProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import { emptyCredentials, createAppRegistry, createAuthorTools, type AuthorCallPorts } from '../src/index.ts'

/** Later loaded hooks run after the first await, so their pushes and the failure log need a turn. */
function turn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

function source(hook?: string): string {
  return `
    import { defineApp } from '@mohou/contract'
    export default defineApp({
      name: 'Example',
      description: 'One line',
      ${hook === undefined ? '' : `${hook},`}
      api: { ping() { return 'ok' } },
    })
  `
}

function files(appId: string, hook?: string): Record<string, string> {
  return {
    'manifest.json': JSON.stringify({
      id: appId,
      name: 'Example',
      description: 'One line',
      version: '1',
      entry: 'ui.tsx',
    }),
    'ui.tsx': 'export {}',
    'main.api.ts': source(hook),
  }
}

function notice(data: unknown): { type?: string; appId?: string; change?: string; from?: string; to?: string } | undefined {
  if (typeof data !== 'object' || data === null || !('type' in data)) return undefined
  return data as { type?: string; appId?: string; change?: string; from?: string; to?: string }
}

describe('onHostEvents', () => {
  it('notifies loaded hooks, skips the rest, and continues after a throw', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-notice-hook-'))
    const logs: string[] = []
    let starts = 0
    const echo = createEchoProvider()
    const provider: RuntimeProvider = {
      ...echo,
      start: () => {
        starts += 1
        return echo.start()
      },
    }
    const ports: AuthorCallPorts = {
      credentials: emptyCredentials(),
      config: {
        theme: 'light',
        palette: 'default',
        locale: 'zh-CN',
        chatLanguage: 'zh-CN',
        hostPort: 0,
        llm: null,
      },
      log(appId, ...args) {
        logs.push([appId, ...args].map(item => String(item)).join(' '))
      },
      push() {
        throw new Error('ports.push must not be the author buffer')
      },
      http: () => Promise.reject(new Error('unused')),
      bash: () => Promise.reject(new Error('unused')),
      pwsh: () => Promise.reject(new Error('unused')),
      metrics: () => Promise.reject(new Error('unused')),
      processDirectory: tmpdir(),
      createTemp: () => tmpdir(),
      provider,
    }
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports,
    })
    const seen: Array<{ appId: string; data: unknown }> = []
    author.appEvents.observe((appId, event) => {
      if (event.name === 'desk') seen.push({ appId, data: event.data })
    })
    try {
      await registerWithFiles(author, 'com.example.boom', files(
        'com.example.boom',
        'onHostEvents() { throw new Error(\'hook broke\') }',
      ))
      await author.enterView('com.example.boom')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.boom', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      await registerWithFiles(author, 'com.example.quiet', files('com.example.quiet'))
      await author.enterView('com.example.quiet')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.quiet', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      await registerWithFiles(author, 'com.example.watch', files(
        'com.example.watch',
        'onHostEvents(ctx, event) { ctx.push(\'desk\', event) }',
      ))
      await author.enterView('com.example.watch')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.watch', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      const started = starts
      await registerWithFiles(author, 'com.example.new', files('com.example.new'))
      author.hostEvents.publish({
        type: 'app:eval',
        appId: 'com.example.watch',
        requestId: '1',
        code: '1',
        budgetMs: 1,
        maxBytes: 1,
        maxNodes: 1,
        maxDepth: 1,
      })
      author.hostEvents.publish({ type: 'app:open', appId: 'com.example.new' })
      author.hostEvents.publish({ type: 'app:rename', from: 'com.example.old', to: 'com.example.new' })
      author.hostEvents.publish({ type: 'workbench:default', appId: 'default' })
      author.hostEvents.publish({ type: 'app:reload', appId: 'com.example.new' })
      author.hostEvents.publish({ type: 'storage-size', appId: 'com.example.new', table: 'kv', keys: ['heavy'] })
      author.hostEvents.publish({ type: 'market:install', kind: 'theme', id: 'ink' })
      await turn()
      const watched = seen.filter(item => item.appId === 'com.example.watch').map(item => notice(item.data)?.type)
      expect(watched).toContain('app:changed')
      expect(seen.some(item => item.appId === 'com.example.watch' && notice(item.data)?.change === 'created' && notice(item.data)?.appId === 'com.example.new')).toBe(true)
      expect(watched).not.toContain('app:eval')
      expect(watched).toEqual(expect.arrayContaining([
        'app:open',
        'app:rename',
        'workbench:default',
        'app:reload',
        'storage-size',
        'market:install',
      ]))
      expect(seen.some(item => item.appId === 'com.example.boom' || item.appId === 'com.example.quiet' || item.appId === 'com.example.new')).toBe(false)
      expect(logs.some(line => line === 'com.example.boom onHostEvents failed: hook broke')).toBe(true)
      expect(starts).toBe(started)
    } finally {
      await author.dispose()
    }
  }, 60_000)

  it('uses the reloaded hook, and a trashed or renamed app does not hear its own notice', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-notice-reload-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: {
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
        push() {
          throw new Error('ports.push must not be the author buffer')
        },
        http: () => Promise.reject(new Error('unused')),
        bash: () => Promise.reject(new Error('unused')),
        pwsh: () => Promise.reject(new Error('unused')),
        metrics: () => Promise.reject(new Error('unused')),
        processDirectory: tmpdir(),
        createTemp: () => tmpdir(),
        provider: createEchoProvider(),
      },
    })
    const seen: Array<{ appId: string; data: unknown }> = []
    author.appEvents.observe((appId, event) => {
      if (event.name === 'desk') seen.push({ appId, data: event.data })
    })
    const push = (generation: string) => `onHostEvents(ctx, event) { ctx.push('desk', { generation: '${generation}', event }) }`
    try {
      await registerWithFiles(author, 'com.example.watch', files('com.example.watch', push('old')))
      await author.enterView('com.example.watch')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.watch', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      await registerWithFiles(author, 'com.example.victim', files('com.example.victim', push('victim')))
      await author.enterView('com.example.victim')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.victim', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      await author.invoke('mini_app_rename', { appId: 'com.example.victim', newAppId: 'com.example.renamed' })
      await registerWithFiles(author, 'com.example.quiet', files('com.example.quiet', push('quiet')))
      await author.enterView('com.example.quiet')
      expect(await author.invoke('mini_app_call', { appId: 'com.example.quiet', method: 'ping' })).toEqual({ ok: true, value: 'ok', session: 'view' })
      await author.deleteApp('com.example.quiet')
      await author.invoke('mini_app_write', {
        appId: 'com.example.watch',
        path: 'main.api.ts',
        content: source(push('next')),
        commit: false,
      })
      expect((await author.invoke('mini_app_reload', { appId: 'com.example.watch' }) as { ok: boolean }).ok).toBe(true)
      await turn()
      const wrapped = seen.filter(item => item.appId === 'com.example.watch').map(item => item.data)
      const generation = (data: unknown, type: string) => {
        if (typeof data !== 'object' || data === null || !('generation' in data) || !('event' in data)) return undefined
        const event = notice(data.event)
        return event?.type === type ? data.generation : undefined
      }
      expect(wrapped.some(data => generation(data, 'app:reload') === 'next')).toBe(true)
      expect(wrapped.some(data => generation(data, 'app:reload') === 'old')).toBe(false)
      expect(wrapped.some((data) => {
        if (typeof data !== 'object' || data === null || !('event' in data)) return false
        const event = notice(data.event)
        return event?.type === 'app:changed' && event.change === 'renamed' && event.from === 'com.example.victim' && event.appId === 'com.example.renamed'
      })).toBe(true)
      expect(wrapped.some((data) => {
        if (typeof data !== 'object' || data === null || !('event' in data)) return false
        const event = notice(data.event)
        return event?.type === 'app:changed' && event.change === 'deleted' && event.appId === 'com.example.quiet'
      })).toBe(true)
      expect(seen.some(item => item.appId === 'com.example.victim' || item.appId === 'com.example.renamed' || item.appId === 'com.example.quiet')).toBe(false)
      const reloads = () => wrapped.filter(data => generation(data, 'app:reload') === 'next').length
      const before = reloads()
      await author.invoke('mini_app_write', {
        appId: 'com.example.watch',
        path: 'ui.tsx',
        content: 'export const view = <Missing />\n',
        commit: false,
      })
      expect((await author.invoke('mini_app_reload', { appId: 'com.example.watch' }) as { ok: boolean }).ok).toBe(false)
      await turn()
      expect(reloads()).toBe(before)
    } finally {
      await author.dispose()
    }
  }, 60_000)
})
