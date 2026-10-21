import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials, createAppRegistry, createAuthorTools, type AuthorCallPorts } from '../src/index.ts'

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
  }
}

describe('ctx.push', () => {
  it('writes the author buffer and does not fail the call when the payload is not JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-push-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      eventTailLength: 2,
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
      'main.api.ts': `
        import { defineApp } from '@mohou/contract'
        export default defineApp({
          name: 'Example',
          description: 'One line',
          api: {
            tick(ctx) {
              ctx.push('tick', { n: 1 })
              ctx.push('bad', () => 1)
              return 'ok'
            },
          },
        })
      `,
    })
    const seen: string[] = []
    author.appEvents.subscribe('com.example.app', 0, (item) => {
      if ('seq' in item) seen.push(item.name)
    })
    expect(await author.invoke('mini_app_call', { appId: 'com.example.app', method: 'tick' })).toEqual({ ok: true, value: 'ok' })
    expect(seen).toEqual(['tick'])
    await author.dispose()
  })
})
