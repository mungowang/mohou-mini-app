import { describe, expect, it } from 'vitest'

import { parseAppId, type AppStorage } from '@mohou/contract'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials, HostError, bindBrain, runCall, type CallCapabilities } from '../src/index.ts'

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

async function capabilities(): Promise<CallCapabilities<{ count: number }>> {
  const brain = await bindBrain({
    provider: createEchoProvider(),
    appDir: '/apps/com.example.app',
    processDirectory: '/proc',
    createTemp: () => '/tmp/run',
    push: () => undefined,
  })
  return {
    appId: parseAppId('com.example.app'),
    appDir: '/apps/com.example.app',
    state: { count: 1 },
    storage: stubStorage(),
    credentials: emptyCredentials(),
    config: {
      theme: 'light',
      palette: 'default',
      locale: 'zh-CN',
      chatLanguage: 'zh-CN',
      hostPort: 1,
      llm: null,
    },
    log: () => undefined,
    push: () => undefined,
    http: () => Promise.resolve({ ok: true, status: 200, headers: {}, text: '', json: null }),
    bash: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    pwsh: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    metrics: () => Promise.resolve({
      platform: 'test',
      arch: 'test',
      hostname: 'test',
      uptimeSec: 1,
      loadavg: null,
      memory: { total: 1, free: 1, used: 0, usedRatio: 0 },
      cpu: { count: 1, model: 'test', speedMHz: 1 },
      collectedAt: '2026-09-16T00:00:00.000Z',
    }),
    mcp: () => Promise.resolve('tool'),
    mcpServers: () => Promise.resolve({ servers: [] }),
    spawn: async () => ({
      pid: undefined,
      exited: Promise.resolve({ exitCode: 0 }),
      kill: async () => undefined,
      ready: async () => undefined,
      output: () => '',
    }),
    brain,
  }
}

describe('runCall', () => {
  it('binds injected ports onto one call and aborts the signal when it settles', async () => {
    let seen = ''
    let signal: AbortSignal | undefined
    const result = await runCall(await capabilities(), {
      read(ctx) {
        signal = ctx.signal
        seen = ctx.appDir
        void ctx.llm('ping')
        const callSignal = ctx.signal
        return callSignal === undefined ? ctx.llm('ping') : ctx.llm('ping', { signal: callSignal })
      },
    }, 'read', {})
    expect(result).toBe('ping')
    expect(seen).toBe('/apps/com.example.app')
    expect(signal?.aborted).toBe(true)
  })

  it('rejects an unknown method by code', async () => {
    await expect(runCall(await capabilities(), {}, 'missing', {})).rejects.toBeInstanceOf(HostError)
  })

  it('lists mcp servers through ctx.mcpServers', async () => {
    const result = await runCall(await capabilities(), {
      async list(ctx, args: unknown) {
        return ctx.mcpServers(args === true)
      },
    }, 'list', [true])
    expect(result).toEqual({ servers: [] })
  })

  it('gives llm and agent the call signal when the app omits one', async () => {
    const seen: AbortSignal[] = []
    const caps = await capabilities()
    const result = await runCall({
      ...caps,
      brain: {
        llm: (_prompt, options) => {
          if (options?.signal !== undefined) seen.push(options.signal)
          return Promise.resolve('llm')
        },
        agent: (_goal, options) => {
          if (options?.signal !== undefined) seen.push(options.signal)
          return Promise.resolve('agent')
        },
        stop: () => Promise.resolve(),
      },
    }, {
      read(ctx) {
        return Promise.all([ctx.llm('ping'), ctx.agent('goal')]).then(() => 'ok')
      },
    }, 'read', {})
    expect(result).toBe('ok')
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
    expect(seen[0]?.aborted).toBe(true)
  })

  it('lets the method read a model stream and yields only what it yields', async () => {
    const yielded: unknown[] = []
    const caps = await capabilities()
    const result = await runCall({
      ...caps,
      brain: {
        llm: (prompt, options) => {
          if (options?.stream === true) {
            options.onEvent?.({ type: 'text-delta', text: prompt })
            options.onEvent?.({ type: 'done', text: prompt })
          }
          return Promise.resolve(prompt)
        },
        agent: (goal, options) => {
          if (options?.stream === true) options.onEvent?.({ type: 'done', text: goal })
          return Promise.resolve(goal)
        },
        stop: () => Promise.resolve(),
      },
    }, {
      async *read(ctx) {
        const quiet = await ctx.llm('quiet')
        yield quiet
        let full = ''
        for await (const event of ctx.llm('loud', { stream: true })) {
          if (event.type === 'text-delta') {
            full += event.text
            yield event.text
          }
        }
        for await (const event of ctx.agent('goal', { stream: true })) {
          if (event.type === 'done') yield event.text
        }
        return { quiet, full }
      },
    }, 'read', {}, (value) => {
      yielded.push(value)
    })
    expect(yielded).toEqual(['quiet', 'loud', 'goal'])
    expect(result).toEqual({ quiet: 'quiet', full: 'loud' })
  })
})
