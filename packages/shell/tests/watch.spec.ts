import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { emptyCredentials } from '@mohou/host'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from '../../host/tests/author-seed.ts'
import { createFrameBridge, type PanelBridge } from '../src/bridge.ts'
import { bootHost } from '../src/boot.ts'
import { watchHost } from '../src/watch.ts'

describe('watchHost', () => {
  it('tells the panel when an app is opened and stops when unsubscribed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-watch-'))
    const host = await bootHost({ runtimeRoot: root, hostPort: await freePort(), credentials: emptyCredentials() })
    const panel = recorder()
    const stop = watchHost(host, panel)
    await registerWithFiles(host.author, 'com.example.app', {
      'manifest.json': JSON.stringify({
        id: 'com.example.app',
        name: 'Example',
        description: 'One line',
        version: '1',
        entry: 'ui.tsx',
      }),
      'ui.tsx': 'export {}\n',
      'main.api.ts': 'export {}\n',
    })
    await host.author.invoke('mini_app_open', { appId: 'com.example.app', title: 'Example' })
    expect(panel.shown).toEqual([{ appId: 'com.example.app', title: 'Example' }])
    stop()
    await host.author.invoke('mini_app_open', { appId: 'com.example.app' })
    expect(panel.shown).toHaveLength(1)
    const again = recorder()
    watchHost(host, again)
    const missing = await host.author.invoke('mini_app_view_eval', { appId: 'com.example.app', timeoutMs: 5_000 })
    expect(missing).toMatchObject({ view: 'not-open' })
    expect(again.missing).toEqual(['com.example.app'])
    await host.dispose()
  })

  it('posts one reload through the frame after the theme message', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-watch-frame-'))
    const host = await bootHost({ runtimeRoot: root, hostPort: await freePort(), credentials: emptyCredentials() })
    const posted: unknown[] = []
    const frame = createFrameBridge({
      post: message => posted.push(message),
    }, 'http://127.0.0.1')
    frame.postTheme({ '--background': 'black' })
    const stop = watchHost(host, recorder(), frame)
    await registerWithFiles(host.author, 'com.example.app', {
      'manifest.json': JSON.stringify({
        id: 'com.example.app',
        name: 'Example',
        description: 'One line',
        version: '1',
        entry: 'ui.tsx',
      }),
      'ui.tsx': 'export {}\n',
      'main.api.ts': 'export {}\n',
    })
    await host.author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'note.txt',
      content: 'one\n',
      commit: true,
    })
    const reloads = posted.filter((message) => {
      return typeof message === 'object' && message !== null && 'type' in message && message.type === 'app:reload'
    })
    expect(reloads).toHaveLength(1)
    stop()
    await host.dispose()
  })
})

function recorder(): PanelBridge & { shown: Array<{ appId: string; title?: string }>; missing: string[] } {
  const shown: Array<{ appId: string; title?: string }> = []
  const missing: string[] = []
  return {
    shown,
    missing,
    showApp: (appId, title) => shown.push(title === undefined ? { appId } : { appId, title }),
    showNotice: () => undefined,
    unavailable: appId => missing.push(appId),
    setWorkbench: () => undefined,
    renameApp: () => undefined,
    marketInstalled: () => undefined,
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
