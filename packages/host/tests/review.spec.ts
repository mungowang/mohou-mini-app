import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import {
  emptyCredentials, createAppRegistry, createAuthorTools, reviewApp, type AuthorCallPorts } from '../src/index.ts'

const manifest = JSON.stringify({
  id: 'com.example.app',
  name: 'Example',
  description: 'One line',
  version: '1',
  entry: 'ui.tsx',
})

const backend = `
import { defineApp } from '@mohou/contract'
export default defineApp({
  name: 'Example',
  description: 'One line',
  api: { ping: () => 'pong' },
})
`

describe('reviewApp', () => {
  it('notices a duplicate or reserved keyframe and still allows reload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-review-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: emptyPorts(),
      reservedKeyframes: ['boot-fade'],
    })
    await registerWithFiles(author, 'com.example.app', {
      'manifest.json': manifest,
      'ui.tsx': 'export function Card() { return null }\n',
      'main.api.ts': backend,
      'ui/motion.css': '@keyframes spin {}\n@keyframes spin {}\n@keyframes boot-fade {}',
    })
    const reloaded = await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as {
      ok: boolean
      notices: Array<{ code: string; name?: string }>
    }
    expect(reloaded.ok).toBe(true)
    expect(reloaded.notices.map(item => item.code).sort()).toEqual(['keyframe-collision', 'keyframe-duplicate'])
    author.dispose()
  })

  it('rejects an unbound component and keeps the previous backend', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-review-bad-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: emptyPorts(),
    })
    await registerWithFiles(author, 'com.example.app', { 'manifest.json': manifest, 'ui.tsx': 'export {}', 'main.api.ts': backend })
    expect((await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as { ok: boolean }).ok).toBe(true)
    await author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'ui.tsx',
      content: [
        'export function greet() { return null }',
        'export const view = <Missing />',
        'export const again = greetx()',
        "export const net = fetch('/')",
      ].join('\n'),
      commit: false,
    })
    const failed = await author.invoke('mini_app_reload', { appId: 'com.example.app' }) as {
      ok: boolean
      errors: Array<{ code: string; message: string }>
    }
    expect(failed.ok).toBe(false)
    expect(failed.errors.map(item => item.message)).toEqual([
      'ui.tsx uses Missing, which is not declared',
      'ui.tsx uses greetx, which is not declared',
    ])
    expect(await author.invoke('mini_app_call', { appId: 'com.example.app', method: 'ping' })).toEqual({
      ok: true,
      value: 'pong',
    })
    author.dispose()
  })

  it('rejects React, DOM, ctx, and Node names in shared', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-review-shared-'))
    await mkdir(join(dir, 'shared'), { recursive: true })
    await writeFile(join(dir, 'shared', 'leak.ts'), 'export const title = document.title\nexport const id = ctx.appId\n')
    await writeFile(join(dir, 'shared', 'view.tsx'), 'export const view = <div />\n')
    const review = await reviewApp(dir)
    expect(review.errors.every(item => item.code === 'shared-invalid')).toBe(true)
    expect(review.errors.map(item => item.message).sort()).toEqual([
      'shared/leak.ts cannot use ctx',
      'shared/leak.ts cannot use document',
      'shared/view.tsx cannot contain JSX',
    ])
  })

  it('rejects a bare UI import and a bare shared import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-review-import-'))
    await mkdir(join(dir, 'shared'), { recursive: true })
    await writeFile(join(dir, 'ui.tsx'), "import 'node:fs'\nexport {}\n")
    await writeFile(join(dir, 'shared', 'util.ts'), "import 'react'\nexport const n = 1\n")
    const review = await reviewApp(dir)
    expect(review.errors.map(item => item.code)).toEqual(['import-forbidden', 'import-forbidden'])
  })

  it('requires a shared event name when both sides use the same literal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-review-event-'))
    await mkdir(join(dir, 'shared'), { recursive: true })
    await writeFile(join(dir, 'ui.tsx'), "export const view = useApp().on('tick', () => undefined)\nexport const all = useApp().on('*', () => undefined)\n")
    await writeFile(join(dir, 'main.api.ts'), "export const send = (ctx: { push: (name: string) => void }) => { ctx.push('tick'); ctx.push('only-backend') }\n")
    await writeFile(join(dir, 'shared', 'events.ts'), 'export const tick = \'tick\'\n')
    const duplicated = await reviewApp(dir)
    expect(duplicated.errors.map(item => item.code)).toEqual(['event-undeclared'])
    await writeFile(join(dir, 'ui.tsx'), "import { tick } from './shared/events'\nexport const view = useApp().on(tick, () => undefined)\n")
    await writeFile(join(dir, 'main.api.ts'), "import { tick } from './shared/events'\nexport const send = (ctx: { push: (name: string) => void }) => ctx.push(tick)\n")
    expect(await reviewApp(dir)).toMatchObject({ errors: [] })
  })

  it('records a notice when the parser cannot load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-review-parser-'))
    await mkdir(join(dir, 'ui'), { recursive: true })
    await writeFile(join(dir, 'ui.tsx'), 'export {}\n')
    const review = await reviewApp(dir, {
      loadParser: () => Promise.reject(new Error('missing')),
    })
    expect(review.errors).toEqual([])
    expect(review.notices[0]?.code).toBe('identifier-skipped')
  })

  it('fails UI-looking source outside ui.tsx and ui/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-review-place-'))
    await mkdir(join(dir, 'components'), { recursive: true })
    await writeFile(join(dir, 'ui.tsx'), 'export {}\n')
    await writeFile(join(dir, 'main.api.ts'), 'export {}\n')
    await writeFile(join(dir, 'view-row-actions.tsx'), "import { Button } from '@mohou/ui'\nexport const Row = () => <Button />\n")
    await writeFile(join(dir, 'components', 'chip.tsx'), 'export const Chip = () => <span />\n')
    await writeFile(join(dir, 'plain.ts'), 'export const n = 1\n')
    const review = await reviewApp(dir)
    expect(review.errors.filter(item => item.code === 'ui-placement').map(item => item.message).sort()).toEqual([
      'components/chip.tsx looks like UI; keep UI modules in ui.tsx or under ui/',
      'view-row-actions.tsx looks like UI; keep UI modules in ui.tsx or under ui/',
    ])
    expect(review.notices).toEqual([])
  })
})

function emptyPorts(): AuthorCallPorts {
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
