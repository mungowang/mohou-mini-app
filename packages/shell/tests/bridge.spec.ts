import { describe, expect, it } from 'vitest'

import { applyHostEvent, createFrameBridge, type PanelBridge } from '../src/bridge.ts'

describe('frame bridge', () => {
  it('posts the theme message before a reload and tells the panel when no frame is mounted', () => {
    const posted: unknown[] = []
    const panel = recorder()
    const frame = createFrameBridge({
      post: (message, origin) => posted.push({ message, origin }),
    }, 'http://127.0.0.1:9743')
    expect(() => frame.post({ type: 'app:reload', appId: 'com.example.app' })).toThrow(/theme message must be first/)
    frame.postTheme({ '--background': 'black' })
    applyHostEvent({ type: 'app:open', appId: 'com.example.app', title: 'Example' }, panel, frame)
    applyHostEvent({ type: 'app:reload', appId: 'com.example.app' }, panel, frame)
    applyHostEvent({ type: 'storage-size', appId: 'com.example.app', table: 'kv', keys: ['a'] }, panel, frame)
    applyHostEvent({ type: 'market:install', kind: 'theme', id: 'forest' }, panel, frame)
    applyHostEvent({ type: 'market:install', kind: 'app', id: 'com.example.app' }, panel, frame)
    applyHostEvent({ type: 'app:changed', appId: 'com.example.app', change: 'renamed', from: 'com.example.old' }, panel, frame)
    applyHostEvent({
      type: 'app:eval',
      appId: 'com.example.app',
      requestId: '1',
      code: 'return 1',
      budgetMs: 1,
      maxBytes: 1,
      maxNodes: 1,
      maxDepth: 1,
    }, panel)
    expect(panel.shown).toEqual([{ appId: 'com.example.app', title: 'Example' }])
    expect(panel.notices).toEqual([{ appId: 'com.example.app', table: 'kv' }])
    expect(panel.market).toEqual([
      { kind: 'theme', id: 'forest' },
      { kind: 'app', id: 'com.example.app' },
    ])
    expect(panel.changed).toEqual([{ appId: 'com.example.app', change: 'renamed', from: 'com.example.old' }])
    expect(panel.missing).toEqual(['com.example.app'])
    expect(posted[0]).toEqual({ message: { type: 'theme', variables: { '--background': 'black' } }, origin: 'http://127.0.0.1:9743' })
    expect(posted[1]).toMatchObject({ message: { type: 'app:reload', appId: 'com.example.app' } })
  })
})

function recorder(): PanelBridge & { shown: unknown[]; notices: unknown[]; market: unknown[]; changed: unknown[]; missing: string[] } {
  const shown: unknown[] = []
  const notices: unknown[] = []
  const market: unknown[] = []
  const changed: unknown[] = []
  const missing: string[] = []
  return {
    shown,
    notices,
    market,
    changed,
    missing,
    showApp: (appId, title) => shown.push({ appId, title }),
    showNotice: (appId, table) => notices.push({ appId, table }),
    unavailable: appId => missing.push(appId),
    setWorkbench: () => undefined,
    renameApp: () => undefined,
    marketInstalled: (kind, id) => market.push({ kind, id }),
    appChanged: event => changed.push(event),
  }
}
