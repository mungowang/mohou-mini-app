import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import {
  emptyCredentials, createAppRegistry, createAuthorTools, type AuthorCallPorts } from '../src/index.ts'

describe('author settle', () => {
  it('waits for the in-flight call, then refuses new work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-settle-'))
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
      'main.api.ts': `
        import { existsSync } from 'node:fs'
        import { join } from 'node:path'
        import { defineApp } from '@mohou/contract'
        export default defineApp({
          name: 'Example',
          description: 'One line',
          api: {
            wait(ctx) {
              return new Promise((resolve) => {
                const timer = setInterval(() => {
                  if (existsSync(join(ctx.appDir, 'go'))) {
                    clearInterval(timer)
                    resolve('done')
                  }
                }, 10)
              })
            },
          },
        })
      `,
    })
    await author.invoke('mini_app_reload', { appId: 'com.example.app' })
    const pending = author.invoke('mini_app_call', { appId: 'com.example.app', method: 'wait' })
    await new Promise(resolve => setTimeout(resolve, 20))
    const settled = author.settle()
    await writeFile(join(root, 'apps', 'com.example.app', 'go'), '1')
    await settled
    await expect(pending).resolves.toEqual({ ok: true, value: 'done' })
    await expect(author.invoke('mini_app_list', {})).rejects.toMatchObject({ code: 'cancelled' })
    expect(existsSync(join(root, 'apps', 'com.example.app', 'go'))).toBe(true)
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
