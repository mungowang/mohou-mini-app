/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { GalleryApp } from '../src/gallery/list.ts'
import { bindPaletteChord, bindPanelChords } from '../src/palette/chord.ts'
import { CommandPalette, type PaletteOpenTab } from '../src/palette/view.tsx'

const lab: GalleryApp = {
  id: 'com.mohou.lab',
  name: '实验台',
  description: '图片识别',
  version: '1.0.47',
  acronym: '实',
  spelling: { name: { full: 'shiyantai', initials: 'syt' } },
}

const openTabs: readonly PaletteOpenTab[] = [
  { key: 'gallery', kind: 'gallery', title: '小程序库' },
  { key: lab.id, kind: 'app', appId: lab.id, title: '实验台' },
]

function mount(extra: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const opened: string[] = []
  const selectedOpen: number[] = []
  const calls = { library: 0, close: 0 }
  let tabNav: ((direction: 'prev' | 'next') => void) | undefined
  act(() => {
    root.render(
      <CommandPalette
        apps={[lab]}
        openIds={new Set([lab.id])}
        openTabs={openTabs}
        activeOpenIndex={1}
        currentId={lab.id}
        locale="zh-CN"
        mode="production"
        onClose={() => { calls.close += 1 }}
        onOpen={(app) => { opened.push(app.id) }}
        onLibrary={() => { calls.library += 1 }}
        onSelectOpenTab={(index) => { selectedOpen.push(index) }}
        onRegisterTabNav={(navigate) => { tabNav = navigate }}
        {...extra}
      />,
    )
  })
  return { host, root, opened, selectedOpen, calls, getTabNav: () => tabNav }
}

describe('CommandPalette', () => {
  it('opens the current app, returns to the library, and closes', async () => {
    const view = mount()
    expect(view.host.querySelector('[data-palette]')).not.toBeNull()
    expect(view.host.textContent).toContain('小程序库')
    expect(view.host.querySelector('[data-palette-open-tabs]')).not.toBeNull()
    expect(view.host.querySelectorAll('[data-palette-open-tab]')).toHaveLength(2)
    expect(view.host.querySelector('[data-palette-row] svg')).not.toBeNull()
    const rows = view.host.querySelectorAll('[data-palette-row]')
    expect(rows[0]?.innerHTML).toContain('bg-accent-foreground')
    expect(rows[0]?.innerHTML).toContain('text-accent-foreground/80')
    expect(rows[0]?.innerHTML).not.toContain('text-muted-foreground')
    expect(rows[1]?.innerHTML).toContain('text-muted-foreground')
    expect(view.host.textContent).toContain('当前')
    const query = view.host.querySelector('[data-palette-query]')
    expect(query).toBeInstanceOf(HTMLInputElement)
    await act(async () => {
      view.host.querySelector('[data-palette-row]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(view.calls.library).toBe(1)
    await act(async () => {
      if (query instanceof HTMLInputElement) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        set?.call(query, 'syt')
        query.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    expect(view.host.textContent).toContain('首字母')
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(view.opened).toEqual(['com.mohou.lab'])
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      view.host.querySelector('[data-palette]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(view.calls.close).toBe(2)
    const failed = mount({ error: '列表失败', apps: [] })
    expect(failed.host.textContent).toContain('列表失败')
    expect(failed.host.querySelector('[data-palette-row]')).toBeNull()
    const empty = mount({ apps: [] })
    const emptyQuery = empty.host.querySelector('[data-palette-query]')
    await act(async () => {
      if (emptyQuery instanceof HTMLInputElement) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(emptyQuery, 'zzz')
        emptyQuery.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    expect(empty.host.textContent).toContain('没有匹配的应用')
    view.root.unmount()
    failed.root.unmount()
    empty.root.unmount()
  })

  it('moves the open-tabs rail with plain arrows and opens the focused open tab on Enter', async () => {
    const view = mount()
    const query = view.host.querySelector('[data-palette-query]')
    expect(view.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('实验台')
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(view.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('小程序库')
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(view.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('实验台')
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(view.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('小程序库')
    await act(async () => {
      query?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(view.selectedOpen).toEqual([0])
    const again = mount()
    await act(async () => {
      again.host.querySelector('[data-palette-open-next]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(again.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('小程序库')
    await act(async () => {
      again.host.querySelector('[data-palette-open-prev]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(again.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('实验台')
    await act(async () => {
      const first = again.host.querySelectorAll('[data-palette-open-tab]')[0]
      first?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      first?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(again.selectedOpen).toEqual([0])
    view.root.unmount()
    again.root.unmount()
  })

  it('clamps a bad active open index, hides an empty rail, and keeps list Enter on the list zone', async () => {
    const clamped = mount({
      openTabs: [
        ...openTabs,
        { key: 'market', kind: 'market', title: '应用市场' },
      ],
      activeOpenIndex: 99,
    })
    expect(clamped.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('应用市场')
    await act(async () => {
      clamped.getTabNav()?.('next')
    })
    expect(clamped.host.querySelector('[data-palette-open-tab][data-on]')?.textContent).toContain('小程序库')
    const emptyRail = mount({ openTabs: [], activeOpenIndex: 0 })
    expect(emptyRail.host.querySelector('[data-palette-open-tabs]')).toBeNull()
    await act(async () => {
      emptyRail.getTabNav()?.('next')
    })
    const listOnly = mount()
    const rows = listOnly.host.querySelectorAll('[data-palette-row]')
    await act(async () => {
      rows[1]?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      rows[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(listOnly.opened).toEqual(['com.mohou.lab'])
    expect(listOnly.selectedOpen).toEqual([])
    clamped.root.unmount()
    emptyRail.root.unmount()
    listOnly.root.unmount()
  })
})

describe('bindPanelChords', () => {
  it('keeps bindPaletteChord as a palette-only wrapper', () => {
    let hits = 0
    const stop = bindPaletteChord(document, () => { hits += 1 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, ctrlKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, ctrlKey: true, bubbles: true }))
    expect(hits).toBe(1)
    stop()
  })

  it('fires palette and tab-switch chords from the document and from an iframe', () => {
    let palette = 0
    const tabs: string[] = []
    const stop = bindPanelChords(document, {
      onPalette: () => { palette += 1 },
      onTabSwitch: (direction) => { tabs.push(direction) },
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, ctrlKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, metaKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    const frame = document.createElement('iframe')
    document.body.append(frame)
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 'p', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 'ArrowLeft', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://other.example',
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 'p', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: null,
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'other', key: 'p', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 1, shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
    }))
    expect(palette).toBe(2)
    expect(tabs).toEqual(['next', 'prev', 'prev'])
    stop()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true }))
    expect(palette).toBe(2)
    frame.remove()
  })

  it('collapses two forwarded chords that arrive together, and ignores a repeated key', () => {
    let palette = 0
    let tabs = 0
    const stop = bindPanelChords(document, {
      onPalette: () => { palette += 1 },
      onTabSwitch: () => { tabs += 1 },
    })
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const message = (key: string) => window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'mma-chord', key, shiftKey: true, altKey: false, metaKey: key === 'P', ctrlKey: key !== 'P' },
    }))
    message('P')
    message('P')
    message('ArrowRight')
    message('ArrowRight')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, ctrlKey: true, repeat: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, ctrlKey: true, repeat: true, bubbles: true }))
    expect(palette).toBe(1)
    expect(tabs).toBe(1)
    stop()
    frame.remove()
  })
})
