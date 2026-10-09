import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { platformImportMap } from '../src/compile/allowlist.ts'
import { asyncReporterSource, kitLocale, moduleErrorPaintSource, renderRunnerDocument, reportedMessageSource, uncaughtReporterSource } from '../src/compile/runner.ts'
import { diagnosticUrl } from '../src/tools/diagnostics.ts'

interface ReporterWindow {
  document: {
    getElementById(id: string): { dispatchEvent(event: Event): void } | null
    createElement(tag: string): { textContent: string }
    body: { append(node: { textContent: string }): void }
  }
  fetch: (url: string, init: { body: string }) => Promise<unknown>
  eval(source: string): void
  dispatchEvent(event: Event): void
  Event: new (type: string, init?: { bubbles?: boolean }) => Event
  ErrorEvent: new (type: string, init?: { message?: string }) => Event
  close(): void
}

describe('renderRunnerDocument', () => {
  it('bakes the first paint, clears boot, and posts diagnostics', () => {
    const html = renderRunnerDocument({
      appId: 'com.example.app',
      entry: '/api/app/com.example.app/ui/entry.js',
      style: ':root[data-mode="light"]{--background:#fff}</style>',
      appearance: 'light',
    })
    expect(html).toContain('--background')
    expect(html).toContain('<\\/style>')
    expect(html).not.toContain('#fff}</style>')
    expect(html.indexOf("getElementById('boot')")).toBeLessThan(html.indexOf('await import('))
    expect(html).toContain('scrollbar-width:thin')
    expect(html).toContain('/api/app/com.example.app/ui/ui.css')
    expect(html).toContain(diagnosticUrl('com.example.app', 'alive'))
    expect(html).toContain(diagnosticUrl('com.example.app', 'errors'))
    expect(html).toContain(JSON.stringify({ imports: platformImportMap() }))
    expect(html).toContain('event.target !== window')
    expect(html).toContain("kind: 'async'")
    expect(html).not.toContain("'unhandled rejection'")
    expect(html).not.toContain("'render error'")
    expect(html).not.toContain("'module error'")
    expect(html).toContain('function reportedMessage')
    expect(html).toContain("type: 'mma-chord'")
    expect(html).not.toContain("message: event.message || 'error'")
    expect(html).toContain('AppErrorBoundary')
    expect(html).toContain('AppRuntime')
    expect(html).toContain('UiProvider')
    expect(html).toContain('locale: "en"')
    expect(html).toContain('paintModuleError')
    expect(html).toContain("kind: 'module'")
    expect(html).toContain('default export is not a component')
    expect(html).toContain('/api/app/com.example.app/ui/entry.js')
    expect(html).not.toContain('export default function Card')
  })

  it('paints a module failure into #root without React', () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1/', runScripts: 'dangerously' })
    const win = dom.window as unknown as {
      document: Document
      eval(source: string): void
      paintModuleError?(appId: string, message: string): void
      close(): void
    }
    const script = win.document.createElement('script')
    script.textContent = moduleErrorPaintSource('en')
    win.document.body.append(script)
    win.paintModuleError?.('com.example.app', "The requested module '@mohou/ui' does not provide an export named 'LiveRefresh'")
    const root = win.document.getElementById('root')
    expect(root?.querySelector('[data-module-error="1"]')).toBeTruthy()
    expect(root?.textContent).toContain('This mini-app failed to load')
    expect(root?.textContent).toContain('LiveRefresh')
    expect(root?.textContent).toContain('com.example.app')
    win.close()
  })

  it('maps host locale onto the kit UiProvider', () => {
    expect(kitLocale('zh-CN')).toBe('zh')
    expect(kitLocale('zh')).toBe('zh')
    expect(kitLocale('en')).toBe('en')
    expect(kitLocale(undefined)).toBe('en')
    const zh = renderRunnerDocument({
      appId: 'com.example.app',
      entry: '/api/app/com.example.app/ui/entry.js',
      style: '',
      appearance: 'system',
      locale: 'zh-CN',
    })
    expect(zh).toContain('locale: "zh"')
  })

  it('drops a resource-load error and posts a script error', () => {
    const posts: string[] = []
    const dom = new JSDOM('<!doctype html><img id="pic">', { url: 'http://127.0.0.1/', runScripts: 'dangerously' })
    const win = dom.window as unknown as ReporterWindow
    win.fetch = (_url, init) => {
      posts.push(init.body)
      return Promise.resolve()
    }
    const script = win.document.createElement('script')
    script.textContent = uncaughtReporterSource('/errors')
    win.document.body.append(script)
    const pic = win.document.getElementById('pic')
    if (pic === null) throw new Error('missing pic')
    pic.dispatchEvent(new win.Event('error', { bubbles: true }))
    win.dispatchEvent(new win.ErrorEvent('error', { message: '' }))
    expect(posts).toEqual([])
    win.dispatchEvent(new win.ErrorEvent('error', { message: 'boom' }))
    expect(posts[0]).toContain('boom')
    expect(posts[0]).not.toContain('"message":"error"')
    win.close()
  })

  it('does not invent a message for a render or module failure', () => {
    const dom = new JSDOM('<!doctype html>', { url: 'http://127.0.0.1/', runScripts: 'dangerously' })
    const win = dom.window as unknown as ReporterWindow & {
      reportedMessage(error: unknown): string
      Error: new (message?: string) => Error
    }
    const script = win.document.createElement('script')
    script.textContent = reportedMessageSource()
    win.document.body.append(script)
    expect(win.reportedMessage(new win.Error('boom'))).toBe('boom')
    expect(win.reportedMessage('text')).toBe('text')
    expect(win.reportedMessage(new win.Error(''))).toBe('')
    expect(win.reportedMessage(undefined)).toBe('')
    win.close()
  })

  it('drops an unhandled rejection that has no message', () => {
    const posts: string[] = []
    const dom = new JSDOM('<!doctype html>', { url: 'http://127.0.0.1/', runScripts: 'dangerously' })
    const win = dom.window as unknown as ReporterWindow
    win.fetch = (_url, init) => {
      posts.push(init.body)
      return Promise.resolve()
    }
    const script = win.document.createElement('script')
    script.textContent = asyncReporterSource('/errors')
    win.document.body.append(script)
    win.dispatchEvent(rejection(win, undefined))
    win.dispatchEvent(rejection(win, ''))
    expect(posts).toEqual([])
    win.dispatchEvent(rejection(win, 'boom'))
    expect(posts[0]).toContain('boom')
    win.close()
  })
})

function rejection(win: ReporterWindow, reason: unknown): Event {
  const event = new win.Event('unhandledrejection')
  Object.defineProperty(event, 'reason', { value: reason })
  return event
}
