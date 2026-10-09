/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { GalleryApp } from '../src/gallery/list.ts'
import { bindPaletteChord } from '../src/palette/chord.ts'
import { CommandPalette } from '../src/palette/view.tsx'

const lab: GalleryApp = {
  id: 'com.mohou.lab',
  name: '实验台',
  description: '图片识别',
  version: '1.0.47',
  acronym: '实',
  spelling: { name: { full: 'shiyantai', initials: 'syt' } },
}

function mount(extra: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const opened: string[] = []
  const calls = { library: 0, close: 0 }
  act(() => {
    root.render(
      <CommandPalette
        apps={[lab]}
        openIds={new Set([lab.id])}
        currentId={lab.id}
        locale="zh-CN"
        mode="production"
        onClose={() => { calls.close += 1 }}
        onOpen={(app) => { opened.push(app.id) }}
        onLibrary={() => { calls.library += 1 }}
        {...extra}
      />,
    )
  })
  return { host, root, opened, calls }
}

describe('CommandPalette', () => {
  it('opens the current app, returns to the library, and closes', async () => {
    const view = mount()
    expect(view.host.querySelector('[data-palette]')).not.toBeNull()
    expect(view.host.textContent).toContain('小程序库')
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
})

describe('bindPaletteChord', () => {
  it('fires from the document and from an iframe, and ignores a plain key', () => {
    let hits = 0
    const stop = bindPaletteChord(document, () => { hits += 1 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    const frame = document.createElement('iframe')
    document.body.append(frame)
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 'p', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://other.example',
      source: frame.contentWindow,
      data: { type: 'mma-chord', key: 'p', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
    }))
    expect(hits).toBe(2)
    stop()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true }))
    expect(hits).toBe(2)
    frame.remove()
  })
})
