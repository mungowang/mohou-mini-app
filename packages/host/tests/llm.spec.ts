import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { RuntimeProvider } from '@mohou/runtime-provider'

import { bindBrain, type ModelPolicy } from '../src/index.ts'

const policy: ModelPolicy = {
  maxTokens: 8,
  maxTokensLimit: 16,
  retryTimes: 2,
  retryTimesLimit: 3,
  maxIterations: 2,
  maxIterationsLimit: 4,
  maxImages: 2,
  maxImageBytes: 8,
}

function brain(llm: RuntimeProvider['llm']): RuntimeProvider {
  return {
    id: 'fake',
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    healthy: () => true,
    llm,
    agent: () => Promise.resolve('goal'),
  }
}

describe('ctx.llm policy', () => {
  it('strips a schema fence, retries, and does not retry a cancel', async () => {
    let calls = 0
    const bound = await bindBrain({
      provider: brain(() => {
        calls += 1
        return Promise.resolve(calls === 1 ? '' : '```json\n{"ok":true}\n```')
      }),
      appDir: '/app',
      processDirectory: '/proc',
      createTemp: () => '/tmp',
      push: () => undefined,
    }, policy)
    expect(await bound.llm('ping')).toBe('```json\n{"ok":true}\n```')
    expect(calls).toBe(2)
    expect(await bound.llm('ping', { schema: {} })).toBe('{"ok":true}')
    expect(calls).toBe(3)
    const signal = new AbortController()
    signal.abort()
    await expect(bound.llm('ping', { signal: signal.signal })).rejects.toMatchObject({ code: 'cancelled' })
    await expect(bound.llm('ping', { maxTokens: 100 })).rejects.toMatchObject({ code: 'model-policy' })
    const empty = await bindBrain({
      provider: brain(() => Promise.resolve('')),
      appDir: '/app',
      processDirectory: '/proc',
      createTemp: () => '/tmp',
      push: () => undefined,
    }, { ...policy, retryTimes: 1 })
    await expect(empty.llm('ping')).rejects.toMatchObject({ code: 'retry-exhausted' })
    await bound.stop()
    await empty.stop()
    let agentCalls = 0
    const agent = await bindBrain({
      provider: {
        ...brain(() => Promise.resolve('unused')),
        agent: () => {
          agentCalls += 1
          return agentCalls === 1 ? Promise.resolve('') : Promise.resolve('done')
        },
      },
      appDir: '/app',
      processDirectory: '/proc',
      createTemp: () => '/tmp',
      push: () => undefined,
    }, policy)
    expect(await agent.agent('goal')).toBe('done')
    expect(agentCalls).toBe(2)
    await expect(agent.agent('goal', { maxIterations: 0 })).rejects.toMatchObject({ code: 'model-policy' })
    const stopped = new AbortController()
    stopped.abort()
    await expect(agent.agent('goal', { signal: stopped.signal })).rejects.toMatchObject({ code: 'cancelled' })
    await agent.stop()
  })

  it('reads a file image once and passes bytes, and rejects a web URI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-image-'))
    const file = join(dir, 'shot.png')
    await writeFile(file, Buffer.from('hi'))
    let seen: unknown
    const bound = await bindBrain({
      provider: brain((prompt, options) => {
        seen = options?.images
        return Promise.resolve(prompt)
      }),
      appDir: '/app',
      processDirectory: '/proc',
      createTemp: () => '/tmp',
      push: () => undefined,
    }, policy)
    expect(await bound.llm('look', { images: [{ path: file }] })).toBe('look')
    expect(seen).toEqual([{ mimeType: 'image/png', data: Buffer.from('hi').toString('base64') }])
    expect(await bound.llm('look', { images: [{ path: pathToFileURL(file).href }] })).toBe('look')
    await expect(bound.llm('look', { images: [{ path: 'https://example.test/a.png' }] })).rejects.toMatchObject({
      code: 'model-policy',
    })
    await expect(bound.llm('look', { images: [{ mimeType: 'image/png', data: 'aGk=' }] })).resolves.toBe('look')
    await expect(bound.llm('look', {
      images: [{ mimeType: 'image/png', data: 'aGk=' }, { mimeType: 'image/png', data: 'aGk=' }, { mimeType: 'image/png', data: 'aGk=' }],
    })).rejects.toMatchObject({ code: 'model-policy' })
    await bound.stop()
  })
})
