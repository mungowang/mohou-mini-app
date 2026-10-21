import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials,
  DEFAULT_VIEW_CODE,
  createAppRegistry,
  createAuthorTools,
  type AuthorCallPorts,
  type HostEvent,
} from '../src/index.ts'

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

describe('mini_app_view_eval', () => {
  it('returns a view state and does not hang', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-view-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      viewTimeoutMs: 30,
    })
    await registerWithFiles(author, 'com.example.app', files)
    const closed = await author.invoke('mini_app_view_eval', { appId: 'com.example.app' }) as { view: string; tookMs: number }
    expect(closed.view).toBe('not-open')
    expect(closed.tookMs).toBe(0)
    const stopAbsent = author.hostEvents.subscribe((event) => {
      if (event.type === 'app:eval') author.views.absent(event.appId)
    })
    const missing = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 5_000 }) as { view: string; hint?: string; tookMs: number }
    stopAbsent()
    expect(missing.view).toBe('not-open')
    expect(missing.hint).toContain('no frame')
    expect(missing.tookMs).toBeLessThan(1_000)
    const seen: HostEvent[] = []
    author.hostEvents.subscribe((event) => {
      seen.push(event)
    })
    const booting = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 20 }) as { view: string; hint?: string }
    expect(booting.view).toBe('runner-not-booted')
    expect(booting.hint).toContain('open or reload')
    expect(seen[0]).toMatchObject({ type: 'app:eval', code: DEFAULT_VIEW_CODE, appId: 'com.example.app' })
    author.views.markAlive('com.example.app')
    const blocked = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 20 }) as { view: string; hint?: string }
    expect(blocked.view).toBe('stuck')
    expect(blocked.hint).toContain('reload')
    // A panel that reports no frame takes the stale alive flag with it.
    author.views.absent('com.example.app')
    const gone = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 20 }) as { view: string }
    expect(gone.view).toBe('runner-not-booted')
    const evalEvent = seen.find(event => event.type === 'app:eval')
    expect(author.views.answer('missing', 'com.example.app', { result: 1 })).toBe(false)
    if (evalEvent?.type === 'app:eval') {
      expect(author.views.answer(evalEvent.requestId, 'com.example.other', { result: 1 })).toBe(false)
    }
    const pending = author.invoke('mini_app_view_eval', {
      appId: 'com.example.app',
      code: 'return 1',
      timeoutMs: 200,
    })
    const sent = await vi.waitFor(() => {
      const latest = seen.findLast(event => event.type === 'app:eval' && event.code === 'return 1')
      expect(latest).toBeDefined()
      return latest
    })
    if (sent?.type === 'app:eval') {
      expect(author.views.answer(sent.requestId, 'com.example.app', {
        result: { text: 'ok' },
        visited: 2,
        stoppedBy: 'bytes',
        error: 'partial',
      })).toBe(true)
      expect(author.views.answer(sent.requestId, 'com.example.app', { result: 2 })).toBe(false)
    }
    const live = await pending as { view: string; result: unknown; truncated: boolean }
    expect(live.view).toBe('live')
    expect(live.result).toEqual({ text: 'ok' })
    expect(live.truncated).toBe(true)
    await expect(author.invoke('mini_app_view_eval', { appId: 'com.example.missing' })).rejects.toMatchObject({ code: 'app-not-registered' })
    await expect(author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 0 })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_view_eval', { appId: 'com.example.app', code: 1 })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_view_eval', { appId: 'com.example.app', maxBytes: 0 })).rejects.toMatchObject({ code: 'tool-args' })
    const scalar = author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 200 })
    const scalarEvent = await vi.waitFor(() => {
      const latest = seen.findLast(event => event.type === 'app:eval' && event.code === DEFAULT_VIEW_CODE && event.budgetMs === 200)
      expect(latest).toBeDefined()
      return latest
    })
    if (scalarEvent?.type === 'app:eval') {
      expect(author.views.answer(scalarEvent.requestId, 'com.example.app', 'plain')).toBe(true)
    }
    expect(await scalar).toMatchObject({ view: 'live', result: 'plain' })
    const rich = author.invoke('mini_app_view_eval', { appId: 'com.example.app', code: '', timeoutMs: 200 })
    const richEvent = await vi.waitFor(() => {
      const latest = seen.findLast(event => event.type === 'app:eval' && event.budgetMs === 200 && event.code === DEFAULT_VIEW_CODE && event !== scalarEvent)
      expect(latest).toBeDefined()
      return latest
    })
    if (richEvent?.type === 'app:eval') {
      expect(author.views.answer(richEvent.requestId, 'com.example.app', {
        view: 'pending',
        dropped: 1,
        hint: 'wait',
        stoppedBy: 'nodes',
      })).toBe(true)
    }
    expect(await rich).toMatchObject({ view: 'pending', dropped: 1, hint: 'wait', stoppedBy: 'nodes' })
    author.views.forgetAlive('com.example.app')
    const afterReload = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 20 }) as { view: string }
    expect(afterReload.view).toBe('runner-not-booted')
    await author.dispose()
  })

  it('returns pending when a live view is already answering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-view-pending-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      viewTimeoutMs: 200,
    })
    await registerWithFiles(author, 'com.example.app', files)
    author.views.markAlive('com.example.app')
    const seen: HostEvent[] = []
    author.hostEvents.subscribe((event) => {
      seen.push(event)
    })
    const first = author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 200 })
    await vi.waitFor(() => {
      expect(seen.some(event => event.type === 'app:eval')).toBe(true)
    })
    const second = await author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 200 }) as { view: string; hint?: string }
    expect(second.view).toBe('pending')
    expect(second.hint).toContain('still running')
    const event = seen.find(item => item.type === 'app:eval')
    if (event?.type === 'app:eval') author.views.answer(event.requestId, 'com.example.app', { result: 1 })
    await first
    await author.dispose()
  })
})
