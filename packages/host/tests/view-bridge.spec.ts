import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { installViewBridge, renderViewBridge } from '../src/events/view-bridge.ts'
import { diagnosticUrl } from '../src/tools/diagnostics.ts'
import { renderRunnerDocument } from '../src/compile/runner.ts'

interface FakeNode {
  nodeType: number
  nodeValue: string | null
  nextSibling: FakeNode | null
}

interface FakeEl {
  nodeType: 1
  tagName: string
  id: string
  className: string
  isConnected: boolean
  display: string
  text: string
  box: { left: number; top: number; width: number; height: number }
  parentElement: FakeEl | null
  children: FakeEl[]
  firstElementChild: FakeEl | null
  nextElementSibling: FakeEl | null
  previousElementSibling: FakeEl | null
  firstChild: FakeNode | null
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  querySelector(selector: string): FakeEl | null
  querySelectorAll(selector: string): FakeEl[]
}

function element(tag: string, fields: Partial<FakeEl> = {}): FakeEl {
  const node: FakeEl = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    isConnected: true,
    display: 'block',
    text: '',
    box: { left: 0, top: 0, width: 10, height: 10 },
    parentElement: null,
    children: [],
    firstElementChild: null,
    nextElementSibling: null,
    previousElementSibling: null,
    firstChild: null,
    getBoundingClientRect() {
      return node.box
    },
    querySelector(selector) {
      return find(node, selector)[0] ?? null
    },
    querySelectorAll(selector) {
      return find(node, selector)
    },
    ...fields,
  }
  if (node.text.length > 0) node.firstChild = { nodeType: 3, nodeValue: node.text, nextSibling: null }
  return node
}

function adopt(parent: FakeEl, child: FakeEl): void {
  const previous = parent.children[parent.children.length - 1]
  parent.children.push(child)
  child.parentElement = parent
  if (previous === undefined) parent.firstElementChild = child
  else {
    previous.nextElementSibling = child
    child.previousElementSibling = previous
  }
}

function find(root: FakeEl, selector: string): FakeEl[] {
  const all = flatten(root)
  if (selector.startsWith('#')) {
    return all.filter((item) => {
      return item.id === selector.slice(1)
    })
  }
  const [tag, rest] = selector.split('.')
  return all.filter((item) => {
    return item.tagName.toLowerCase() === tag && (rest === undefined || item.className.split(/\s+/).includes(rest))
  })
}

function flatten(root: FakeEl): FakeEl[] {
  const found = [root]
  for (const child of root.children) found.push(...flatten(child))
  return found
}

function boot(posts: Array<{ url: string; body: string }>) {
  const body = element('body')
  const root = element('div', { id: 'root', box: { left: 1, top: 2, width: 30, height: 40 } })
  const leaf = element('span', { text: 'hi', box: { left: 3, top: 4, width: 5, height: 6 } })
  adopt(body, root)
  adopt(root, leaf)
  adopt(root, element('span', { text: 'yo' }))
  const parent = {}
  const listeners: Array<(event: { source: unknown; origin: string; data: unknown }) => void> = []
  const win = {
    parent,
    document: {
      body,
      documentElement: themeRoot(),
      querySelector: (selector: string) => body.querySelector(selector),
      querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    },
    addEventListener: (_type: string, listener: (event: { source: unknown; origin: string; data: unknown }) => void) => {
      listeners.push(listener)
    },
    CSS: { escape: (value: string) => value },
    getComputedStyle: (item: FakeEl) => ({ display: item.display }),
    fetch: (url: string, init: { body: string }) => {
      posts.push({ url, body: init.body })
      return Promise.resolve()
    },
  }
  return {
    win,
    send: (origin: string, data: unknown, source: unknown = parent) => {
      for (const listener of listeners) listener({ source, origin, data })
    },
  }
}

function themeRoot() {
  const attrs: Record<string, string> = {}
  const props: Record<string, string> = {}
  return {
    attrs,
    props,
    setAttribute(name: string, value: string) {
      attrs[name] = value
    },
    style: {
      setProperty(name: string, value: string) {
        props[name] = value
      },
    },
  }
}

function sendDom(win: JSDOM['window'], data: unknown): void {
  const event = new win.MessageEvent('message', { data, origin: 'http://parent' })
  Object.defineProperty(event, 'source', { value: win.parent })
  win.dispatchEvent(event)
}

const query = {
  type: 'app:eval',
  appId: 'com.example.app',
  requestId: 'view-1',
  code: 'return mma.$("#root")',
  budgetMs: 1000,
  maxBytes: 2000,
  maxNodes: 20,
  maxDepth: 4,
}

describe('view bridge', () => {
  it('an eval without a return answers undefined, not a bridge crash', async () => {
    const posts: Array<{ url: string; body: string }> = []
    const harness = boot(posts)
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = harness.win
    try {
      installViewBridge({ appId: 'com.example.app', evalUrl: '/eval' })
      harness.send('http://parent', {
        type: 'app:eval',
        appId: 'com.example.app',
        requestId: 'view-1',
        code: '2 + 3',
        budgetMs: 50,
        maxBytes: 1000,
        maxNodes: 10,
        maxDepth: 4,
      })
      await new Promise((resolve) => { setTimeout(resolve, 10) })
      expect(posts).toHaveLength(1)
      const body = JSON.parse(posts[0]?.body ?? '{}') as { result: string; error?: string }
      expect(body.error).toBeUndefined()
      expect(body.result).toBe('undefined')
    } finally {
      ;(globalThis as { window?: unknown }).window = previous
    }
  })

  it('answers from the parent origin and keeps the helper set closed', async () => {
    const posts: Array<{ url: string; body: string }> = []
    const harness = boot(posts)
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = harness.win
    try {
      installViewBridge({
        appId: 'com.example.app',
        evalUrl: '/api/app/com.example.app/view/eval',
        tokens: ['background'],
      })
      const installed = harness.win as unknown as { mma: object }
      expect(Object.keys(installed.mma)).toEqual(['$', '$$', 'selector'])
      harness.send('http://parent', {
        type: 'theme',
        mode: 'dark',
        variables: { '--background': 'black', '--nope': 'red', color: 'blue' },
      })
      const root = harness.win.document.documentElement
      expect(root.attrs['data-mode']).toBe('dark')
      expect(root.attrs['data-dock']).toBeUndefined()
      expect(root.props['--background']).toBe('black')
      expect(root.props['--nope']).toBeUndefined()
      expect(root.props.color).toBeUndefined()
      harness.send('http://other', query)
      harness.send('http://parent', query, {})
      harness.send('http://parent', query)
      await Promise.resolve()
      expect(posts).toHaveLength(1)
      const body = JSON.parse(posts[0]?.body ?? '{}') as { result: string; matched: number; requestId: string }
      expect(body.requestId).toBe('view-1')
      expect(body.result).toContain('x=1 y=2 w=30 h=40')
      expect(body.result).toContain('(2 children)')
      expect(body.result).toContain('  span')
      expect(body.result).toContain('"hi"')
      expect(body.matched).toBe(1)
    } finally {
      ;(globalThis as { window?: unknown }).window = previous
    }
  })

  it('runs the emitted source the same way', async () => {
    const posts: Array<{ url: string; body: string }> = []
    const harness = boot(posts)
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = harness.win
    try {
      const source = renderViewBridge({ appId: 'com.example.app', evalUrl: diagnosticUrl('com.example.app', 'viewEval') })
      expect(source).not.toMatch(/\b__(?!name\b)[A-Za-z]+\s*\(/)
      // oxlint-disable-next-line typescript/no-implied-eval
      const start = new Function(source) as () => void
      start()
      harness.send('http://parent', { ...query, code: 'return mma.selector(mma.$("#root"))' })
      await Promise.resolve()
      const body = JSON.parse(posts[0]?.body ?? '{}') as { result: string }
      expect(body.result).toContain('#root')
      harness.send('http://parent', { type: 'theme', mode: 'light', variables: { '--background': 'white', '--nope': 'red' } })
      const painted = harness.win.document.documentElement
      expect(painted.attrs['data-mode']).toBe('light')
      expect(painted.attrs['data-dock']).toBeUndefined()
      expect(painted.props['--background']).toBe('white')
      expect(painted.props['--nope']).toBeUndefined()
    } finally {
      ;(globalThis as { window?: unknown }).window = previous
    }
  })

  it('stops on the first budget and still describes a detached or hidden node', async () => {
    const posts: Array<{ url: string; body: string }> = []
    const harness = boot(posts)
    const leaf = harness.win.document.body.children[0]?.children[0]
    if (leaf !== undefined) leaf.isConnected = false
    const hidden = element('em', { display: 'none', text: 'gone' })
    adopt(harness.win.document.body, hidden)
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = harness.win
    try {
      installViewBridge({ appId: 'com.example.app', evalUrl: '/eval' })
      harness.send('http://parent', { ...query, requestId: 'miss', code: 'return mma.$("#missing")' })
      harness.send('http://parent', { ...query, requestId: 'sel', code: 'return mma.selector(mma.$("span"))' })
      harness.send('http://parent', { ...query, requestId: 'many', code: 'return mma.$$("span")' })
      harness.send('http://parent', { ...query, requestId: 'cycle', code: 'const box = {}; box.self = box; return box' })
      harness.send('http://parent', { ...query, requestId: 'gone', code: 'return mma.$("span")' })
      harness.send('http://parent', { ...query, requestId: 'hidden', code: 'return mma.$("em")' })
      harness.send('http://parent', { ...query, requestId: 'scalar', code: 'return 1' })
      harness.send('http://parent', { ...query, requestId: 'fn', code: 'return function named() {}' })
      harness.send('http://parent', { ...query, requestId: 'bad', code: 'throw new Error("nope")' })
      harness.send('http://parent', { ...query, requestId: 'bytes', maxBytes: 1 })
      harness.send('http://parent', { ...query, requestId: 'nodes', maxNodes: 0 })
      harness.send('http://parent', { ...query, requestId: 'depth', maxDepth: 0 })
      harness.send('http://parent', { ...query, requestId: 'time', budgetMs: -1 })
      harness.send('http://parent', { ...query, requestId: 'other-app', appId: 'com.example.other' })
      harness.send('http://parent', { type: 'app:eval', appId: 'com.example.app' })
      await Promise.resolve()
      await Promise.resolve()
      const byId = Object.fromEntries(posts.map((item) => {
        const body = JSON.parse(item.body) as { requestId: string; result: string; stoppedBy: string | null; error?: string }
        return [body.requestId, body]
      }))
      expect(byId.gone?.result).toContain('detached')
      expect(byId.gone?.result).not.toContain('x=')
      expect(byId.hidden?.result).toContain('display:none')
      expect(byId.scalar?.result).toBe('1')
      expect(byId.fn?.result).toContain('[Function named]')
      expect(byId.bad?.error).toBe('nope')
      expect(byId.bytes?.stoppedBy).toBe('bytes')
      expect(byId.nodes?.stoppedBy).toBe('nodes')
      expect(byId.depth?.stoppedBy).toBe('depth')
      expect(byId.time?.stoppedBy).toBe('timeout')
      expect(byId['other-app']).toBeUndefined()
      const plain = boot([])
      delete (plain.win as { CSS?: unknown }).CSS
      ;(globalThis as { window?: unknown }).window = plain.win
      installViewBridge({ appId: 'com.example.app', evalUrl: '/eval' })
      plain.send('http://parent', { ...query, requestId: 'plain', code: 'return mma.selector(mma.$("#root"))' })
      await Promise.resolve()
    } finally {
      ;(globalThis as { window?: unknown }).window = previous
    }
  })

  it('reads a real DOM element, not a stand-in', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="root"><span>hi</span><span class="note">yo</span></div>
      <em style="display:none">gone</em>
      <svg id="mark" class="icon star"><circle r="4"></circle></svg>
    </body></html>`)
    const posts: Array<{ url: string; body: string }> = []
    const win = dom.window
    win.fetch = (url: string, init: { body: string }) => {
      posts.push({ url, body: init.body })
      return Promise.resolve(undefined)
    }
    const previous = globalThis as { window?: unknown; document?: unknown }
    const saved = { window: previous.window, document: previous.document }
    previous.window = win
    previous.document = win.document
    try {
      installViewBridge({ appId: 'com.example.app', evalUrl: diagnosticUrl('com.example.app', 'viewEval') })
      const root = win.document.querySelector('#root')
      expect(root).toBeInstanceOf(win.HTMLElement)
      sendDom(win, { ...query, requestId: 'root', code: 'return mma.$("#root")' })
      sendDom(win, {
        ...query,
        requestId: 'back',
        code: 'const el = mma.$("span.note"); if (mma.$(mma.selector(el)) !== el) throw new Error("selector missed"); return el',
      })
      sendDom(win, {
        ...query,
        requestId: 'loose',
        code: 'const el = document.createElement("p"); el.textContent = "loose"; return el',
      })
      sendDom(win, { ...query, requestId: 'hidden', code: 'return mma.$("em")' })
      // An SVG element answers `className` with SVGAnimatedString, not a string.
      sendDom(win, { ...query, requestId: 'svg', code: 'return mma.$("#mark")' })
      await Promise.resolve()
      await Promise.resolve()
      const byId = Object.fromEntries(posts.map((item) => {
        const body = JSON.parse(item.body) as { requestId: string; result: string; error?: string }
        return [body.requestId, body]
      }))
      expect(byId.root?.error).toBeUndefined()
      expect(byId.root?.result).toContain('div#root')
      expect(byId.root?.result).toContain('x=0 y=0 w=0 h=0')
      expect(byId.root?.result).toContain('(2 children)')
      expect(byId.root?.result).toContain('  span  x=0 y=0 w=0 h=0  "hi"')
      expect(byId.back?.error).toBeUndefined()
      expect(byId.back?.result).toContain('span.note')
      expect(byId.back?.result).toContain('"yo"')
      expect(byId.loose?.result).toContain('p  detached')
      expect(byId.loose?.result).not.toContain('x=')
      expect(byId.hidden?.result).toContain('display:none')
      expect(byId.hidden?.result).toContain('"gone"')
      expect(byId.svg?.error).toBeUndefined()
      expect(byId.svg?.result).toContain('svg#mark.icon.star')
    } finally {
      previous.window = saved.window
      previous.document = saved.document
      win.close()
    }
  })

  it('inlines the bridge in the runner document', () => {
    const html = renderRunnerDocument({ appId: 'com.example.app', entry: '/api/app/com.example.app/ui/entry.js', style: '', appearance: 'dark' })
    expect(html).toContain(diagnosticUrl('com.example.app', 'viewEval'))
    expect(html).toContain('selector')
  })
})
