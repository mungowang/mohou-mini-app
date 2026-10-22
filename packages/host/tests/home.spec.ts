import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appEntries } from '@mohou/contract'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { createHost, defaultRuntimeRoot, homeCredentialsPath, homeLayout, homeThemesDir } from '../src/index.ts'

const seed = {
  hostPort: 0,
  theme: 'light' as const,
  palette: 'default',
  locale: 'zh-CN',
}

describe('home layout', () => {
  it('keeps themes beside the runtime root', () => {
    const home = join('users', 'owner')
    expect(defaultRuntimeRoot(home)).toBe(join(home, homeLayout.dir, homeLayout.runtime))
    expect(homeThemesDir(home)).toBe(join(home, homeLayout.dir, homeLayout.themes))
    expect(homeCredentialsPath(home)).toBe(join(home, homeLayout.dir, homeLayout.credentials))
  })

  it('bakes the app theme into the runner document and records ctx.log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-home-'))
    const themes = await mkdtemp(join(tmpdir(), 'mma-themes-'))
    const host = await createHost({
      runtimeRoot: root,
      themesDir: themes,
      seed,
      provider: createEchoProvider(),
    })
    try {
      await registerWithFiles(host.author, 'com.example.app', {
        [appEntries.manifest]: JSON.stringify({
          id: 'com.example.app',
          name: 'Example',
          description: 'One line',
          version: '1',
          entry: appEntries.ui,
        }),
        [appEntries.ui]: 'export default function Card() { return null }\n',
        [appEntries.backend]: `
          import { defineApp } from '@mohou/contract'
          export default defineApp({
            name: 'Example',
            description: 'One line',
            api: { note(ctx) { ctx.log('kept', { n: 1 }); return 'ok' } },
          })
        `,
      })
      await host.author.invoke('mini_app_write', {
        appId: 'com.example.app',
        path: 'theme.css',
        content: [
          ':root[data-mode="light"] { --background: white; --foreground: black; --primary: blue; }',
          ':root[data-mode="dark"] { --background: black; --foreground: white; --primary: blue; }',
        ].join('\n'),
        commit: false,
      })
      const html = await host.owner.runnerDocument('com.example.app')
      expect(html).toContain('--background:white')
      expect(html).toContain('/api/app/com.example.app/ui/entry.js')
      expect(html).not.toContain('function%20Card')
      await host.author.invoke('mini_app_reload', { appId: 'com.example.app' })
      const compiled = await host.owner.runnerDocument('com.example.app')
      expect(compiled).toContain('/api/app/com.example.app/ui/entry.js')
      expect(compiled).not.toContain('function%20Card')
      expect(await host.author.invoke('mini_app_call', { appId: 'com.example.app', method: 'note' })).toEqual({ ok: true, value: 'ok', session: 'ephemeral' })
      expect(host.log.read('com.example.app')).toEqual(['kept {"n":1}'])
    } finally {
      await host.dispose()
    }
  })
})
