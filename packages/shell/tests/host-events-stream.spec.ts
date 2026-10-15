/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'

import { openHostEventsStream, type HostStreamControls, type HostStreamHooks } from '../src/host-events-stream.ts'

describe('openHostEventsStream', () => {
  it('queues app:open until controls are ready, then flushes', () => {
    const sources: FakeSource[] = []
    const stream = openHostEventsStream('/api/events', hooks(), (href) => {
      const source = new FakeSource(href)
      sources.push(source)
      return source as unknown as EventSource
    })
    sources[0]?.emit({ type: 'app:open', appId: 'com.example.app', title: 'Example' })
    const panel = recorder()
    stream.setControls(panel)
    expect(panel.shown).toEqual([{ appId: 'com.example.app', title: 'Example' }])
    stream.close()
  })

  it('reconnects after an error and stops after close', () => {
    vi.useFakeTimers()
    const sources: FakeSource[] = []
    const stream = openHostEventsStream('/api/events', hooks(), (href) => {
      const source = new FakeSource(href)
      sources.push(source)
      return source as unknown as EventSource
    })
    expect(sources).toHaveLength(1)
    sources[0]?.error()
    vi.advanceTimersByTime(500)
    expect(sources).toHaveLength(2)
    sources[1]?.open()
    sources[1]?.error()
    stream.close()
    vi.advanceTimersByTime(8_000)
    expect(sources).toHaveLength(2)
    vi.useRealTimers()
  })

  it('dispatches every host control and frame hook once controls are live', () => {
    const sources: FakeSource[] = []
    const heard = {
      events: [] as unknown[],
      gaps: [] as unknown[],
      reloads: [] as string[],
      evals: [] as unknown[],
    }
    const stream = openHostEventsStream('/api/events', {
      onAppEvent: event => heard.events.push(event),
      onAppGap: (appId, since) => heard.gaps.push({ appId, since }),
      onAppReload: appId => heard.reloads.push(appId),
      onAppEval: event => heard.evals.push(event),
    }, (href) => {
      const source = new FakeSource(href)
      sources.push(source)
      return source as unknown as EventSource
    })
    const panel = recorder()
    stream.setControls(panel)
    const src = sources[0]
    src?.emit('not-json')
    src?.emit({ type: 'app:event', appId: 'com.example.app', name: 'tick', data: { n: 1 }, seq: 3 })
    src?.emit({ type: 'app:gap', appId: 'com.example.app', since: 1 })
    src?.emit({ type: 'app:open', appId: 'com.example.app' })
    src?.emit({ type: 'workbench:default', appId: 'com.example.desk' })
    src?.emit({ type: 'app:rename', from: 'com.example.old', to: 'com.example.new' })
    src?.emit({ type: 'storage-size', appId: 'com.example.app', table: 'kv' })
    src?.emit({ type: 'market:install', kind: 'theme', id: 'forest' })
    src?.emit({ type: 'app:changed', appId: 'com.example.app', change: 'updated' })
    src?.emit({ type: 'app:changed', appId: 'com.example.app', change: 'renamed', from: 'com.example.old' })
    src?.emit({ type: 'app:reload', appId: 'com.example.app' })
    src?.emit({ type: 'app:eval', appId: 'com.example.app', requestId: '1' })
    src?.emit({ type: 'app:changed', appId: 'com.example.app', change: 'nope' })
    expect(heard.events).toEqual([{ appId: 'com.example.app', name: 'tick', data: { n: 1 }, seq: 3 }])
    expect(heard.gaps).toEqual([{ appId: 'com.example.app', since: 1 }])
    expect(heard.reloads).toEqual(['com.example.app'])
    expect(heard.evals).toEqual([{ type: 'app:eval', appId: 'com.example.app', requestId: '1' }])
    expect(panel.shown).toEqual([{ appId: 'com.example.app' }])
    expect(panel.workbenches).toEqual(['com.example.desk'])
    expect(panel.renames).toEqual([{ from: 'com.example.old', to: 'com.example.new' }])
    expect(panel.notices).toEqual([{ appId: 'com.example.app', table: 'kv' }])
    expect(panel.market).toEqual([{ kind: 'theme', id: 'forest' }])
    expect(panel.changed).toEqual([
      { appId: 'com.example.app', change: 'updated' },
      { appId: 'com.example.app', change: 'renamed', from: 'com.example.old' },
    ])
    stream.close()
  })
})

class FakeSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
  }
  close(): void {}
  open(): void {
    this.onopen?.()
  }
  emit(data: unknown): void {
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    this.onmessage?.({ data: text } as MessageEvent<string>)
  }
  error(): void {
    this.onerror?.()
  }
}

function hooks(): HostStreamHooks {
  return {
    onAppEvent: () => undefined,
    onAppGap: () => undefined,
    onAppReload: () => undefined,
    onAppEval: () => undefined,
  }
}

function recorder(): HostStreamControls & {
  shown: unknown[]
  notices: unknown[]
  workbenches: string[]
  renames: unknown[]
  market: unknown[]
  changed: unknown[]
} {
  const shown: unknown[] = []
  const notices: unknown[] = []
  const workbenches: string[] = []
  const renames: unknown[] = []
  const market: unknown[] = []
  const changed: unknown[] = []
  return {
    shown,
    notices,
    workbenches,
    renames,
    market,
    changed,
    showApp: (appId, title) => shown.push(title === undefined ? { appId } : { appId, title }),
    showNotice: (appId, table) => notices.push({ appId, table }),
    setWorkbench: appId => workbenches.push(appId),
    renameApp: (from, to) => renames.push({ from, to }),
    marketInstalled: (kind, id) => market.push({ kind, id }),
    appChanged: event => changed.push(event),
  }
}
