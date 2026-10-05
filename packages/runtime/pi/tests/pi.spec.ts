import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPiProvider } from '../src/pi.ts'

const piSession = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  completions: [] as Array<Record<string, unknown>>,
  serviceOptions: [] as Array<Record<string, unknown>>,
  serviceCalls: [] as Array<Record<string, unknown>>,
  disposed: 0,
  completion: { stopReason: 'stop', content: [{ type: 'text', text: ' hi ' }] } as { stopReason: string; content: unknown },
  failComplete: false,
  beforeComplete: undefined as (() => void) | undefined,
  messages: [{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] }] as Array<{ role: string; content?: unknown }>,
  prompt: async (_goal: string, _listen: Array<(event: Record<string, unknown>) => void>) => {},
  failCreate: false,
  defaultProvider: 'rocket' as string | undefined,
  defaultModel: 'grok-4.5' as string | undefined,
  listed: [{ provider: 'rocket', id: 'grok-4.5' }] as Array<{ provider: string; id: string }>,
  /** What a provider an extension registered adds to the same runtime. */
  listedWithExtensions: [] as Array<{ provider: string; id: string }>,
  streamDeltas: ['hi'] as string[],
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SessionManager: {
    inMemory: (cwd: string) => ({ memory: true, cwd }),
  },
  SettingsManager: {
    create: () => ({
      getDefaultProvider: () => piSession.defaultProvider,
      getDefaultModel: () => piSession.defaultModel,
    }),
  },
  getAgentDir: () => '/pi/agent',
  createAgentSessionServices: async (options: Record<string, unknown>) => {
    piSession.serviceOptions.push(options)
    if (piSession.failCreate) throw new Error('services')
    return {
      cwd: options.cwd,
      agentDir: '/pi/agent',
      diagnostics: [],
      // A real runtime lists the built-ins and whatever the user's extensions registered into it.
      modelRuntime: {
        getModel: (provider: string, id: string) => {
          if (id === 'missing') return undefined
          if (id === 'reasoner') return { provider, id, reasoning: true }
          if (id === 'named-off') return { provider, id, reasoning: true, thinkingLevelMap: { off: 'none' } }
          if (id === 'quiet') return { provider, id, reasoning: true, thinkingLevelMap: { off: null, minimal: null, low: 'light' } }
          return { provider, id }
        },
        getModels: () => [...piSession.listed, ...piSession.listedWithExtensions],
        completeSimple: async (model: unknown, context: unknown, options: unknown) => {
          piSession.completions.push({ model, context, options })
          piSession.beforeComplete?.()
          if (piSession.failComplete) throw new Error('down')
          return piSession.completion
        },
        streamSimple: (model: unknown, context: unknown, options: unknown) => {
          piSession.completions.push({ model, context, options, streamed: true })
          const deltas = piSession.streamDeltas
          return {
            async *[Symbol.asyncIterator]() {
              for (const delta of deltas) yield { type: 'text_delta', delta }
              yield { type: 'thinking_delta', delta: 'hidden' }
            },
            result: async () => piSession.completion,
          }
        },
      },
      settingsManager: {
        getDefaultProvider: () => piSession.defaultProvider,
        getDefaultModel: () => piSession.defaultModel,
      },
      resourceLoader: { reload: () => Promise.resolve() },
    }
  },
  createAgentSessionFromServices: async (options: Record<string, unknown>) => {
    piSession.serviceCalls.push(options)
    return mockAgentSession()
  },
  createAgentSession: async (options: Record<string, unknown>) => {
    piSession.calls.push(options)
    return mockAgentSession()
  },
}))

function mockAgentSession() {
  const listeners: Array<(event: Record<string, unknown>) => void> = []
  return {
    session: {
      get messages() {
        return piSession.messages
      },
      subscribe(listener: (event: Record<string, unknown>) => void) {
        listeners.push(listener)
        return () => {}
      },
      prompt: (goal: string) => piSession.prompt(goal, listeners),
      abort: () => Promise.resolve(),
      dispose: () => {
        piSession.disposed += 1
      },
    },
  }
}

/** Configure the provider for the extension model, the way a saved policy would. */
function piConfiguration(pi: ReturnType<typeof createPiProvider>): void {
  pi.configure?.({ provider: 'kiro-proxy', model: 'kiro-sonnet' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  piSession.calls.length = 0
  piSession.completions.length = 0
  piSession.serviceOptions.length = 0
  piSession.serviceCalls.length = 0
  piSession.disposed = 0
  piSession.failCreate = false
  piSession.failComplete = false
  piSession.beforeComplete = undefined
  piSession.completion = { stopReason: 'stop', content: [{ type: 'text', text: ' hi ' }] }
  piSession.defaultProvider = 'rocket'
  piSession.defaultModel = 'grok-4.5'
  piSession.listed = [{ provider: 'rocket', id: 'grok-4.5' }]
  piSession.listedWithExtensions = []
  piSession.streamDeltas = ['hi']
  piSession.messages = [
    { role: 'user', content: 'goal' },
    { role: 'assistant', content: [{ type: 'thinking' }, { type: 'text', text: ' ok ' }] },
  ]
  piSession.prompt = async (_goal, listeners) => {
    for (const listen of listeners) {
      listen({ type: 'turn_start' })
      listen({ type: 'tool_execution_start', toolName: 'jira', args: { q: 's' } })
      listen({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'h' } })
      listen({ type: 'tool_execution_end', toolName: 'jira', result: { ok: true } })
      listen({ type: 'turn_end', toolResults: [{}] })
      listen({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ok' } })
      listen({ type: 'turn_end', toolResults: [] })
    }
  }
})

describe('createPiProvider', () => {
  it('lists models from Pi and completes through Pi', async () => {
    const pi = createPiProvider()
    piSession.listed = [
      { provider: 'rocket', id: 'grok-4.5' },
      { provider: 'rocket', id: 'grok-4.6' },
      { provider: 'other', id: 'm' },
    ]
    expect(await pi.models?.()).toEqual([
      { provider: 'rocket', models: ['grok-4.5', 'grok-4.6'] },
      { provider: 'other', models: ['m'] },
    ])
    expect(piSession.serviceOptions).toHaveLength(1)
    await pi.start()
    expect(await pi.llm('hello', { provider: 'rocket', model: 'grok-4.5' })).toBe('hi')
    expect(piSession.completions[0]?.model).toEqual({ provider: 'rocket', id: 'grok-4.5' })
    expect(piSession.completions[0]?.context).toMatchObject({
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(piSession.completions[0]?.context).not.toHaveProperty('tools')
    await pi.stop()
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'provider-unhealthy' })
  })

  it('lists and selects a model that one of the user\'s extensions registered', async () => {
    const pi = createPiProvider()
    // Pi's built-ins come from the bare runtime; the services add what the extensions registered.
    piSession.listedWithExtensions = [{ provider: 'kiro-proxy', id: 'kiro-sonnet' }]
    expect(await pi.models?.()).toEqual([
      { provider: 'rocket', models: ['grok-4.5'] },
      { provider: 'kiro-proxy', models: ['kiro-sonnet'] },
    ])
    await pi.start()
    expect(await pi.llm('hello', { provider: 'kiro-proxy', model: 'kiro-sonnet' })).toBe('hi')
    expect(piSession.completions[0]?.model).toEqual({ provider: 'kiro-proxy', id: 'kiro-sonnet' })
    // The agent path resolves the same way, so a listed model is one a run can select.
    piConfiguration(pi)
    expect(await pi.agent?.('goal')).toBe('ok')
    expect(piSession.serviceCalls[0]?.model).toEqual({ provider: 'kiro-proxy', id: 'kiro-sonnet' })
  })

  it('emits text deltas only when stream is true', async () => {
    const pi = createPiProvider()
    await pi.start()
    piSession.streamDeltas = ['hi', ' there']
    piSession.completion = { stopReason: 'stop', content: [{ type: 'text', text: 'hi there' }] }
    const seen: string[] = []
    expect(await pi.llm('hello', {
      provider: 'rocket',
      model: 'grok-4.5',
      stream: true,
      onEvent(event) {
        seen.push(event.type === 'text-delta' ? event.text : event.type)
        if (event.type === 'status') throw new Error('observer failed')
      },
    })).toBe('hi there')
    expect(seen).toEqual(['status', 'hi', ' there', 'done'])
    expect(piSession.completions.at(-1)).toMatchObject({ streamed: true })
  })

  it('fails on an empty prompt, cancel, and a runtime that will not open', async () => {
    const pi = createPiProvider()
    await pi.start()
    await expect(pi.llm('')).rejects.toMatchObject({ code: 'empty-completion' })
    const signal = new AbortController()
    signal.abort()
    await expect(pi.llm('hello', { signal: signal.signal })).rejects.toMatchObject({ code: 'cancelled' })
    expect(piSession.completions).toHaveLength(0)
    piSession.failCreate = true
    expect(await pi.models?.()).toEqual([])
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'provider-unhealthy' })
  })

  it('rejects an empty completion, a Pi error, and an unknown model', async () => {
    const pi = createPiProvider()
    await pi.start()
    piSession.completion = { stopReason: 'stop', content: [] }
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'empty-completion' })
    piSession.completion = { stopReason: 'error', content: [{ type: 'text', text: 'no' }] }
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'provider-unhealthy' })
    piSession.completion = { stopReason: 'aborted', content: [] }
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'cancelled' })
    piSession.failComplete = true
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'provider-unhealthy' })
    piSession.failComplete = false
    await expect(pi.llm('hello', { provider: 'rocket' })).rejects.toMatchObject({ code: 'unknown-model' })
    await expect(pi.llm('hello', { provider: 'rocket', model: 'missing' })).rejects.toMatchObject({ code: 'unknown-model' })
  })

  it('passes the configured model to Pi and keeps a throwing observer', async () => {
    const pi = createPiProvider()
    await expect(pi.agent?.('goal')).rejects.toMatchObject({ code: 'provider-unhealthy' })
    await pi.start()
    pi.configure?.({ provider: 'rocket', model: 'grok-4.5' })
    piSession.completion = { stopReason: 'stop', content: [{ type: 'text', text: '  plain  ' }] }
    expect(await pi.llm('hello', { system: 'sys', maxTokens: 8 })).toBe('plain')
    expect(piSession.completions[0]?.context).toMatchObject({ systemPrompt: 'sys' })
    expect(piSession.completions[0]?.options).toMatchObject({ maxTokens: 8 })
    expect(piSession.completions[0]?.options).not.toHaveProperty('reasoning')
    piSession.completions.length = 0
    await pi.llm('hello', { provider: 'rocket', model: 'reasoner' })
    expect(piSession.completions[0]?.options).not.toHaveProperty('reasoning')
    piSession.completions.length = 0
    await pi.llm('hello', { provider: 'rocket', model: 'named-off' })
    expect(piSession.completions[0]?.options).not.toHaveProperty('reasoning')
    piSession.completions.length = 0
    await pi.llm('hello', { provider: 'rocket', model: 'quiet' })
    expect(piSession.completions[0]?.options).toMatchObject({ reasoning: 'low' })
    await expect(pi.agent?.('goal', {
      onEvent() {
        throw new Error('observer')
      },
    })).resolves.toBe('ok')
    const signal = new AbortController()
    piSession.failComplete = true
    piSession.beforeComplete = () => {
      signal.abort()
    }
    await expect(pi.llm('hello', { signal: signal.signal })).rejects.toMatchObject({ code: 'cancelled' })
    pi.configure?.({})
    piSession.defaultProvider = undefined
    piSession.defaultModel = undefined
    piSession.failComplete = false
    await expect(pi.llm('hello')).rejects.toMatchObject({ code: 'unknown-model' })
  })

  it('opens an in-memory session and does not pass a tool allowlist', async () => {
    const pi = createPiProvider()
    await pi.start()
    pi.configure?.({ provider: 'rocket', model: 'grok-4.5' })
    const seen: string[] = []
    expect(await pi.agent('goal', {
      cwd: '/tmp/app',
      system: 'extra',
      onEvent(event) {
        if (event.type === 'tool') seen.push(`${event.phase}:${event.name}`)
        else if (event.type === 'turn') seen.push(event.phase === 'end' ? `${event.phase}:${event.reason?.kind ?? ''}` : event.phase)
        else seen.push(event.type)
      },
    })).toBe('ok')
    expect(piSession.serviceCalls[0]).not.toHaveProperty('tools')
    expect(piSession.serviceCalls[0]?.sessionManager).toEqual({ memory: true, cwd: '/tmp/app' })
    // The appended system prompt rides the services, which is what loads the user's extensions.
    expect(piSession.serviceOptions[0]).toMatchObject({ cwd: '/tmp/app', agentDir: '/pi/agent', resourceLoaderOptions: { appendSystemPrompt: ['extra'] } })
    expect(piSession.serviceCalls[0]?.model).toEqual({ provider: 'rocket', id: 'grok-4.5' })
    expect(seen).toContain('start:jira')
    expect(seen).toContain('end:jira')
    expect(seen).toContain('text-delta')
    expect(seen.filter(item => item.startsWith('end:'))).toContain('end:completed')
    expect(piSession.disposed).toBe(1)
  })

  it('uses the Pi settings default when the caller names neither side', async () => {
    const pi = createPiProvider()
    await pi.start()
    await pi.agent('goal')
    expect(piSession.serviceCalls[0]?.model).toEqual({ provider: 'rocket', id: 'grok-4.5' })
    expect(piSession.serviceOptions[0]).not.toHaveProperty('resourceLoaderOptions')
    piSession.defaultProvider = undefined
    piSession.defaultModel = undefined
    await pi.agent('goal')
    expect(piSession.serviceCalls[1]).not.toHaveProperty('model')
  })

  it('rejects an incomplete or unknown model and an empty result', async () => {
    const pi = createPiProvider()
    await pi.start()
    await expect(pi.agent('')).rejects.toMatchObject({ code: 'empty-completion' })
    pi.configure?.({ provider: 'rocket' })
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'unknown-model' })
    pi.configure?.({ model: 'grok-4.5' })
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'unknown-model' })
    pi.configure?.({ provider: 'rocket', model: 'missing' })
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'unknown-model' })
    pi.configure?.({ provider: 'rocket', model: 'grok-4.5' })
    piSession.messages = []
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'empty-completion' })
    expect(piSession.disposed).toBe(1)
    piSession.failCreate = true
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'provider-unhealthy' })
  })

  it('cancels when the signal aborts and reports other session failures', async () => {
    const pi = createPiProvider()
    await pi.start()
    const signal = new AbortController()
    signal.abort()
    await expect(pi.agent('goal', { signal: signal.signal })).rejects.toMatchObject({ code: 'cancelled' })
    const live = new AbortController()
    piSession.prompt = async (_goal, listeners) => {
      live.abort()
      for (const listen of listeners) listen({ type: 'turn_end' })
      throw new Error('aborted')
    }
    await expect(pi.agent('goal', { signal: live.signal })).rejects.toMatchObject({ code: 'cancelled' })
    expect(piSession.disposed).toBe(1)
    piSession.prompt = async () => {
      throw new Error('down')
    }
    await expect(pi.agent('goal')).rejects.toMatchObject({ code: 'provider-unhealthy' })
    expect(piSession.disposed).toBe(2)
  })
})
