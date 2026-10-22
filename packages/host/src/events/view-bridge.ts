import { themeTokens } from '../theme/tokens.ts'

/** Values the runner script may close over. Caps on a query arrive in the message. */
export interface ViewBridgeDeps {
  readonly appId: string
  readonly evalUrl: string
  readonly tokens?: readonly string[]
}

interface BridgeBox {
  left: number
  top: number
  width: number
  height: number
}

interface BridgeElement {
  nodeType: number
  tagName: string
  id: string
  /** An SVG element exposes `SVGAnimatedString` here, not a string. */
  className: string | { readonly baseVal: string }
  isConnected: boolean
  parentElement: BridgeElement | null
  firstElementChild: BridgeElement | null
  nextElementSibling: BridgeElement | null
  previousElementSibling: BridgeElement | null
  firstChild: { nodeType: number; nodeValue: string | null; nextSibling: BridgeElement['firstChild'] } | null
  getBoundingClientRect(): BridgeBox
  querySelector(selector: string): BridgeElement | null
  querySelectorAll(selector: string): ArrayLike<BridgeElement>
}

interface ThemeRoot {
  setAttribute(name: string, value: string): void
  style: { setProperty(name: string, value: string): void }
}

interface BridgeDocument {
  body: BridgeElement | null
  documentElement?: ThemeRoot | null
  querySelector(selector: string): BridgeElement | null
  querySelectorAll(selector: string): ArrayLike<BridgeElement>
  getElementById?(id: string): { textContent: string } | null
}

interface BridgeMessage {
  source: unknown
  origin: string
  data: unknown
}

interface BridgeWindow {
  parent: unknown
  document: BridgeDocument
  addEventListener(type: string, listener: (event: BridgeMessage) => void): void
  getComputedStyle?(element: BridgeElement): { display: string }
  CSS?: { escape(value: string): string }
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<unknown>
}

interface EvalMessage {
  type: 'app:eval'
  appId: string
  requestId: string
  code: string
  budgetMs: number
  maxBytes: number
  maxNodes: number
  maxDepth: number
}

/**
 * Install the three view helpers and answer `app:eval` from the parent origin.
 * No imports and no closed-over module state: the runner emits this function as text.
 * @param deps - app id and the diagnostic answer URL
 */
export function installViewBridge(deps: ViewBridgeDeps): void {
  const realm = globalThis as { window?: BridgeWindow }
  let win: BridgeWindow
  if (realm.window !== undefined) win = realm.window
  else win = globalThis
  const names = { query: '$', queryAll: '$$', selector: 'selector' } as const
  let parentOrigin: string | undefined

  function escapeIdent(value: string): string {
    if (win.CSS) return win.CSS.escape(value)
    return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1')
  }

  let matched = 0

  function query(selector: string, root?: BridgeElement | null): BridgeElement | null {
    const base = root ?? win.document
    const found = base.querySelector(selector)
    if (found !== null) matched += 1
    return found
  }

  function queryAll(selector: string, root?: BridgeElement | null): BridgeElement[] {
    const base = root ?? win.document
    const found = base.querySelectorAll(selector)
    const list: BridgeElement[] = []
    for (let index = 0; index < found.length; index += 1) {
      const item = found[index]
      if (item !== undefined) list.push(item)
    }
    matched += list.length
    return list
  }

  function selectorOf(element: BridgeElement): string {
    if (element.nodeType !== 1) return ''
    const tag = element.tagName.toLowerCase()
    if (element.id) {
      const byId = `#${escapeIdent(element.id)}`
      if (queryAll(byId).length === 1) return byId
    }
    const classes = classNames(element)
    let dots = ''
    for (let index = 0; index < classes.length; index += 1) {
      dots += `.${escapeIdent(classes[index] ?? '')}`
      if (queryAll(tag + dots).length === 1) return tag + dots
    }
    const parts: string[] = []
    let node: BridgeElement | null = element
    while (node !== null && node.nodeType === 1 && node !== win.document.body) {
      if (node.id) {
        parts.unshift(`#${escapeIdent(node.id)}`)
        return parts.join(' > ')
      }
      let nth = 1
      for (let sibling = node.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
        if (sibling.tagName === node.tagName) nth += 1
      }
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nth})`)
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  const helpers = {
    [names.query]: query,
    [names.queryAll]: queryAll,
    [names.selector]: selectorOf,
  }
  ;(win as BridgeWindow & { mma?: typeof helpers }).mma = helpers

  win.addEventListener('message', (event) => {
    if (event.source !== win.parent) return
    if (parentOrigin === undefined) parentOrigin = event.origin
    if (event.origin !== parentOrigin) return
    if (applyTheme(event.data)) return
    const data = readEval(event.data)
    if (data === undefined || data.appId !== deps.appId) return
    void answer(data)
  })

  async function answer(data: EvalMessage): Promise<void> {
    const budget = {
      lines: [] as string[],
      bytes: 0,
      visited: 0,
      matched,
      dropped: 0,
      stopped: '' as '' | 'bytes' | 'nodes' | 'depth' | 'timeout',
      maxBytes: data.maxBytes,
      maxNodes: data.maxNodes,
      maxDepth: data.maxDepth,
      deadline: Date.now() + data.budgetMs,
    }
    let error: string | undefined
    try {
      // The query is an async function body supplied by the owner. It is not a string the host builds.
      // oxlint-disable-next-line typescript/no-implied-eval
      const run = new Function('mma', `return (async () => {\n${data.code}\n})()`) as (mma: typeof helpers) => Promise<unknown>
      const value = await run(helpers)
      renderValue(value, budget)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'view query failed'
    }
    if (budget.stopped !== '') pushLine(budget, `truncated: ${budget.stopped}`, true)
    const body: Record<string, unknown> = {
      requestId: data.requestId,
      result: budget.lines.join('\n'),
      view: 'live',
      bytes: budget.bytes,
      truncated: budget.stopped !== '',
      stoppedBy: budget.stopped === '' ? null : budget.stopped,
      visited: budget.visited,
      matched,
      budgetMs: data.budgetMs,
    }
    if (error !== undefined) body.error = error
    await win.fetch(deps.evalUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function renderValue(value: unknown, budget: Budget): void {
    if (isElement(value)) {
      walk(value, 0, '', budget)
      return
    }
    if (isElementList(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index]
        if (item === undefined) continue
        walk(item, 0, '', budget)
        if (budget.stopped !== '') return
      }
      return
    }
    pushLine(budget, textOf(value), false)
  }

  function walk(element: BridgeElement, depth: number, indent: string, budget: Budget): void {
    if (budget.stopped !== '') return
    if (Date.now() > budget.deadline) {
      budget.stopped = 'timeout'
      return
    }
    budget.visited += 1
    if (budget.visited > budget.maxNodes) {
      budget.stopped = 'nodes'
      budget.visited -= 1
      return
    }
    if (depth > budget.maxDepth) {
      budget.stopped = 'depth'
      budget.visited -= 1
      return
    }
    pushLine(budget, indent + describe(element), false)
    for (let child = element.firstElementChild; child !== null; child = child.nextElementSibling) {
      walk(child, depth + 1, `${indent}  `, budget)
    }
  }

  function describe(element: BridgeElement): string {
    let line = element.tagName.toLowerCase()
    if (element.id) line += `#${element.id}`
    const classes = classNames(element)
    if (classes.length > 0) line += `.${classes.join('.')}`
    if (!element.isConnected) return `${line}  detached`
    const box = element.getBoundingClientRect()
    line += `  x=${Math.round(box.left)} y=${Math.round(box.top)} w=${Math.round(box.width)} h=${Math.round(box.height)}`
    const kids = childCount(element)
    if (kids > 0) line += `  (${kids} ${kids === 1 ? 'child' : 'children'})`
    else {
      const text = ownText(element)
      if (text.length > 0) line += `  ${JSON.stringify(text)}`
    }
    const display = win.getComputedStyle?.(element).display
    if (display === 'none') line += '  display:none'
    return line
  }

  function pushLine(budget: Budget, text: string, force: boolean): void {
    if (budget.stopped !== '' && !force) {
      budget.dropped += 1
      return
    }
    const cost = text.length + 1
    if (!force && budget.bytes + cost > budget.maxBytes) {
      budget.stopped = 'bytes'
      budget.dropped += 1
      return
    }
    budget.bytes += cost
    budget.lines.push(text)
  }

  function classNames(element: BridgeElement): string[] {
    const raw = element.className
    const text = typeof raw === 'string' ? raw : raw.baseVal
    return text.trim().split(/\s+/).filter((name) => {
      return name.length > 0
    })
  }

  function childCount(element: BridgeElement): number {
    let count = 0
    for (let child = element.firstElementChild; child !== null; child = child.nextElementSibling) count += 1
    return count
  }

  function ownText(element: BridgeElement): string {
    let text = ''
    for (let node = element.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === 3 && node.nodeValue !== null) text += node.nodeValue
    }
    return text.replace(/\s+/g, ' ').trim()
  }

  function isElement(value: unknown): value is BridgeElement {
    return typeof value === 'object' && value !== null && 'tagName' in value && 'nodeType' in value && value.nodeType === 1
  }

  function isElementList(value: unknown): value is BridgeElement[] {
    return Array.isArray(value) && value.every(isElement)
  }

  function textOf(value: unknown): string {
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
    if (typeof value === 'string') return JSON.stringify(value)
    try {
      // JSON.stringify(undefined) returns undefined; an eval without a return must not crash the bridge.
      return JSON.stringify(value) ?? 'undefined'
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  function applyTheme(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false
    if (!('type' in value) || value.type !== 'theme') return false
    const root = win.document.documentElement
    if (root == null) return true
    if ('mode' in value && (value.mode === 'light' || value.mode === 'dark') && typeof root.setAttribute === 'function') {
      root.setAttribute('data-mode', value.mode)
    }
    if ('style' in value && typeof value.style === 'string') {
      const painted = win.document.getElementById?.('mma-first-paint')
      if (painted != null) painted.textContent = value.style
    }
    if (!('variables' in value) || typeof value.variables !== 'object' || value.variables === null) return true
    const variables = value.variables as Record<string, unknown>
    for (const key of Object.keys(variables)) {
      const item = variables[key]
      if (typeof item !== 'string' || !knownToken(key)) continue
      root.style.setProperty(key, item)
    }
    return true
  }

  function knownToken(name: string): boolean {
    if (!name.startsWith('--')) return false
    const tokens = deps.tokens
    if (tokens === undefined) return false
    const bare = name.slice(2)
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] === bare) return true
    }
    return false
  }

  function readEval(value: unknown): EvalMessage | undefined {
    if (typeof value !== 'object' || value === null) return undefined
    if (!('type' in value) || value.type !== 'app:eval') return undefined
    if (!('appId' in value) || typeof value.appId !== 'string') return undefined
    if (!('requestId' in value) || typeof value.requestId !== 'string') return undefined
    if (!('code' in value) || typeof value.code !== 'string') return undefined
    if (!('budgetMs' in value) || typeof value.budgetMs !== 'number') return undefined
    if (!('maxBytes' in value) || typeof value.maxBytes !== 'number') return undefined
    if (!('maxNodes' in value) || typeof value.maxNodes !== 'number') return undefined
    if (!('maxDepth' in value) || typeof value.maxDepth !== 'number') return undefined
    return {
      type: 'app:eval',
      appId: value.appId,
      requestId: value.requestId,
      code: value.code,
      budgetMs: value.budgetMs,
      maxBytes: value.maxBytes,
      maxNodes: value.maxNodes,
      maxDepth: value.maxDepth,
    }
  }
}

interface Budget {
  lines: string[]
  bytes: number
  visited: number
  matched: number
  dropped: number
  stopped: '' | 'bytes' | 'nodes' | 'depth' | 'timeout'
  maxBytes: number
  maxNodes: number
  maxDepth: number
  deadline: number
}

const bridgeHelpers = new Set(['__name'])

/** Source the runner inlines. Caps stay on the query message, not in this string. */
export function renderViewBridge(deps: ViewBridgeDeps): string {
  const payload = {
    appId: deps.appId,
    evalUrl: deps.evalUrl,
    tokens: deps.tokens ?? themeTokens,
  }
  const source = `{\nconst __name = (target) => target;\n(${installViewBridge.toString()})(${JSON.stringify(payload)})\n}`
  for (const match of source.matchAll(/\b(__[A-Za-z]+)\s*\(/g)) {
    const name = match[1]
    if (name !== undefined && !bridgeHelpers.has(name)) {
      throw new Error(`view bridge helper is not declared: ${name}`)
    }
  }
  return source
}
