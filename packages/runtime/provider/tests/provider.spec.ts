import { describe, expect, it } from 'vitest'

import { ProviderError, assertKnownModel, createEchoProvider, createProviderRegistry, type RuntimeProvider } from '../src/index.ts'

describe('registry', () => {
  it('registers echo and removes it on dispose', () => {
    const registry = createProviderRegistry()
    const dispose = registry.register(createEchoProvider())
    expect(registry.get('echo').id).toBe('echo')
    expect(registry.ids()).toEqual(['echo'])
    dispose()
    expect(() => registry.get('echo')).toThrow(ProviderError)
  })

  it('rejects a second registration of the same id', () => {
    const registry = createProviderRegistry()
    registry.register(createEchoProvider())
    expect(() => registry.register(createEchoProvider())).toThrow(ProviderError)
  })
})

describe('echo', () => {
  it('returns the prompt and the goal after start, and keeps an empty tool set', async () => {
    const echo = createEchoProvider()
    echo.configure?.({ model: 'ignored' })
    await echo.start()
    expect(await echo.llm('hello')).toBe('hello')
    const quiet: string[] = []
    expect(await echo.llm('hello', { onEvent(event) { quiet.push(event.type) } })).toBe('hello')
    expect(quiet).toEqual([])
    const streamed: string[] = []
    expect(await echo.llm('hello', {
      stream: true,
      onEvent(event) {
        streamed.push(event.type)
        if (event.type === 'text-delta') throw new Error('observer failed')
      },
    })).toBe('hello')
    expect(streamed).toEqual(['status', 'text-delta', 'done'])
    const seen: string[] = []
    expect(await echo.agent('goal', {
      model: 'still-ignored',
      onEvent(event) {
        seen.push(event.type)
        if (event.type === 'status') throw new Error('observer failed')
      },
    })).toBe('goal')
    expect(seen).toEqual(['status', 'done'])
    expect(echo.describe?.()).toEqual([{ name: 'model', kind: 'string' }])
  })

  it('fails before start, on cancel, and on an empty prompt', async () => {
    const echo = createEchoProvider()
    await expect(echo.llm('hello')).rejects.toMatchObject({ code: 'provider-unhealthy' })
    await echo.start()
    const signal = AbortSignal.abort()
    await expect(echo.llm('hello', { signal })).rejects.toMatchObject({ code: 'cancelled' })
    await expect(echo.llm('')).rejects.toMatchObject({ code: 'empty-completion' })
    await expect(echo.agent('')).rejects.toMatchObject({ code: 'empty-completion' })
    await expect(echo.llm('hello', { images: [{ mimeType: 'image/png', data: 'aGk=' }] })).rejects.toMatchObject({
      code: 'image-unsupported',
    })
    await expect(echo.agent('goal', { images: [{ mimeType: 'image/png', data: 'aGk=' }] })).rejects.toMatchObject({
      code: 'image-unsupported',
    })
    await echo.stop()
    expect(echo.healthy()).toBe(false)
  })
})

describe('assertKnownModel', () => {
  const catalog = {
    id: 'catalog',
    models: () => Promise.resolve([
      { provider: 'alpha', models: ['small', 'large'] },
      { provider: 'beta', models: ['small'] },
    ]),
  } as Pick<RuntimeProvider, 'id' | 'models'> as RuntimeProvider

  it('accepts a listed pair and an omitted choice', async () => {
    await expect(assertKnownModel(catalog, { provider: 'alpha', model: 'large' })).resolves.toBeUndefined()
    await expect(assertKnownModel(catalog, {})).resolves.toBeUndefined()
    await expect(assertKnownModel(createEchoProvider(), { provider: 'other', model: 'x' })).resolves.toBeUndefined()
  })

  it('rejects an unknown vendor, an unknown model, and an ambiguous model', async () => {
    await expect(assertKnownModel(catalog, { provider: 'missing' })).rejects.toBeInstanceOf(ProviderError)
    await expect(assertKnownModel(catalog, { provider: 'alpha', model: 'tiny' })).rejects.toBeInstanceOf(ProviderError)
    await expect(assertKnownModel(catalog, { model: 'small' })).rejects.toBeInstanceOf(ProviderError)
  })
})
