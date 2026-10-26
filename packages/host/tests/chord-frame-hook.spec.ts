import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const wire = readFileSync(join(root, '../../panel/src/palette/chord-wire.js'), 'utf8').replaceAll('export function', 'function')
const body = readFileSync(join(root, '../../launcher/tauri/src/chord_frame_hook_body.js'), 'utf8')
const hook = `(function () {\n${wire}\n${body}\n})()`

interface HookDocument {
  getElementById(id: string): HookFrame | null
  createElement(tag: string): { textContent: string }
  body: { append(node: { textContent: string }): void }
  dispatchEvent(event: { defaultPrevented: boolean }): void
  open(): void
  write(html: string): void
  close(): void
}

interface HookFrame {
  readonly contentWindow: HookWindow | null
  readonly contentDocument: HookDocument | null
}

interface HookWindow {
  document: HookDocument
  KeyboardEvent: new (type: string, init?: {
    key?: string
    code?: string
    shiftKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    repeat?: boolean
    bubbles?: boolean
    cancelable?: boolean
  }) => { defaultPrevented: boolean }
  MessageEvent: new (type: string, init?: { data?: unknown; source?: unknown }) => Event
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void
  dispatchEvent(event: Event): void
  parent: { postMessage(data: unknown): void }
  close(): void
}

function install(win: HookWindow): void {
  const script = win.document.createElement('script')
  script.textContent = hook
  win.document.body.append(script)
}

/** A child frame whose parent is the panel window. JSDOM delivers `postMessage` on a later turn. */
function nestedFrame(): { parent: HookWindow; child: HookWindow; nest: HookFrame } {
  const dom = new JSDOM('<!doctype html><iframe id="app"></iframe>', { url: 'http://127.0.0.1:9743/', runScripts: 'dangerously' })
  const parent = dom.window as unknown as HookWindow
  const app = parent.document.getElementById('app')
  if (app === null || app.contentWindow === null || app.contentDocument === null) throw new Error('app frame did not open')
  app.contentDocument.open()
  app.contentDocument.write('<!doctype html><body><iframe id="nest"></iframe></body>')
  app.contentDocument.close()
  const nest = app.contentDocument.getElementById('nest')
  if (nest === null) throw new Error('nested frame did not open')
  install(app.contentWindow)
  return { parent, child: app.contentWindow, nest }
}

describe('chord frame hook', () => {
  it('posts palette and tab-switch chords from a nested frame and re-posts a child frame', async () => {
    const { parent, child, nest } = nestedFrame()
    const posted: unknown[] = []
    parent.addEventListener('message', (event) => { posted.push(event.data) })
    const event = new child.KeyboardEvent('keydown', { key: 'p', shiftKey: true, ctrlKey: true, bubbles: true, cancelable: true })
    child.document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const tab = new child.KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true, metaKey: true, bubbles: true, cancelable: true })
    child.document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    // Some engines omit key when Meta is held — code alone must still match.
    const byCode = new child.KeyboardEvent('keydown', { key: '', code: 'ArrowRight', shiftKey: true, ctrlKey: true, bubbles: true, cancelable: true })
    child.document.dispatchEvent(byCode)
    expect(byCode.defaultPrevented).toBe(true)
    child.dispatchEvent(new child.MessageEvent('message', {
      data: { type: 'mma-chord', key: 'P', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false, extra: 'no' },
      source: nest.contentWindow,
    }))
    child.dispatchEvent(new child.MessageEvent('message', {
      data: { type: 'mma-chord', key: 'ArrowRight', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
      source: nest.contentWindow,
    }))
    child.dispatchEvent(new child.MessageEvent('message', {
      data: { type: 'mma-chord', key: 'p', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
      source: child,
    }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(posted).toEqual([
      { type: 'mma-chord', key: 'p', code: '', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
      { type: 'mma-chord', key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
      { type: 'mma-chord', key: 'ArrowRight', code: 'ArrowRight', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
      { type: 'mma-chord', key: 'P', code: '', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false },
      { type: 'mma-chord', key: 'ArrowRight', code: '', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true },
    ])
    parent.close()
  })

  it('does not post from the top window, and ignores a repeated key', () => {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:9743/', runScripts: 'dangerously' })
    const win = dom.window as unknown as HookWindow
    const posted: unknown[] = []
    win.parent.postMessage = (data: unknown) => { posted.push(data) }
    install(win)
    const repeat = new win.KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true, repeat: true, cancelable: true })
    const chord = new win.KeyboardEvent('keydown', { key: 'p', shiftKey: true, metaKey: true, cancelable: true })
    win.document.dispatchEvent(repeat)
    win.document.dispatchEvent(chord)
    expect(repeat.defaultPrevented).toBe(false)
    expect(chord.defaultPrevented).toBe(false)
    expect(posted).toEqual([])
    win.close()
  })
})
