import { renderViewBridge } from '../events/view-bridge.ts'
import { appResource, httpLayout } from '../http/layout.ts'
import { diagnosticUrl } from '../tools/diagnostics.ts'
import { platformImportMap } from './allowlist.ts'
import { chordForwardSource, leaveGuardSource } from './leave.ts'
import { hostWrapperBinding, renderHostWrapper } from './wrapper.ts'

/** Thin bar on WKWebView and WebView2. `scrollbar-width` covers the rest. */
const thinScrollbarCss = 'html{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,CanvasText 32%,transparent) transparent}*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,CanvasText 32%,transparent) transparent}::-webkit-scrollbar{-webkit-appearance:none;width:8px;height:8px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:color-mix(in srgb,CanvasText 32%,transparent);border:2px solid transparent;border-radius:999px;background-clip:padding-box}'

/**
 * The first document for one app. The iframe runner route serves it.
 * Boot art is cleared before the component mounts. The host injects the error boundary.
 * The UI bundle is a later request. This document does not wait for it.
 * @param input - app id, entry URL, and first-paint CSS
 */
export function renderRunnerDocument(input: {
  readonly appId: string
  readonly entry: string
  readonly style: string
  readonly appearance: 'system' | 'light' | 'dark'
  /** Host chrome locale. Kit uses `en` | `zh`. */
  readonly locale?: string
}): string {
  const errors = diagnosticUrl(input.appId, 'errors')
  const alive = diagnosticUrl(input.appId, 'alive')
  return `<!doctype html>
<html${appearanceAttribute(input.appearance)}>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${appResource(input.appId, httpLayout.ui, httpLayout.sheet)}">
<style id="mma-first-paint">${escapeStyle(input.style)}</style>
<style>html,body,#root{height:100%;margin:0}#root>div{height:100%;min-height:0;display:flex;flex-direction:column}${thinScrollbarCss}</style>
<script type="importmap">
${JSON.stringify({ imports: platformImportMap() })}
</script>
${appearanceScript(input.appearance)}
<script>
${leaveGuardSource()}
${chordForwardSource()}
</script>
</head>
<body>
<div id="boot"></div>
<div id="root"></div>
<script>
${renderViewBridge({ appId: input.appId, evalUrl: diagnosticUrl(input.appId, 'viewEval') })}
${renderHostWrapper(input.appId)}
</script>
<script type="module">
${reportedMessageSource()}
const boot = document.getElementById('boot')
if (boot) boot.remove()
await fetch(${JSON.stringify(alive)}, { method: 'POST', body: '{}' })
${uncaughtReporterSource(errors)}
${asyncReporterSource(errors)}
${moduleErrorPaintSource(kitLocale(input.locale))}
try {
  const module = await import(${JSON.stringify(input.entry)})
  const component = module.default
  if (typeof component !== 'function') {
    const message = 'default export is not a component'
    void fetch(${JSON.stringify(errors)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'module', message }) })
    paintModuleError(${JSON.stringify(input.appId)}, message)
  } else {
  const React = await import('react')
  const ui = await import('@mohou/ui')
  const frame = window[${JSON.stringify(hostWrapperBinding.host)}]
  function HostFrame(props) {
    return frame.runInside(() => props.component({}))
  }
  const root = React.createElement(
    ui.AppRuntime,
    { appId: ${JSON.stringify(input.appId)} },
    React.createElement(
      ui.UiProvider,
      { locale: ${JSON.stringify(kitLocale(input.locale))} },
      React.createElement(ui.AppErrorBoundary, null, React.createElement(HostFrame, { component })),
    ),
  )
  const target = document.getElementById('root')
  if (target) target.replaceChildren(document.createTextNode(''))
  const host = document.createElement('div')
  target?.append(host)
  const client = React.createRoot?.(host)
  if (client) client.render(root)
  }
} catch (error) {
  const message = reportedMessage(error)
  const text = message.length > 0 ? message : 'UI module failed to load'
  if (message.length > 0) {
  void fetch(${JSON.stringify(errors)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'module', message }) })
  }
  paintModuleError(${JSON.stringify(input.appId)}, text)
}
</script>
</body>
</html>`
}

/** Message already on an error. Empty and non-errors are not given a stand-in. */
export function reportedMessageSource(): string {
  return `function reportedMessage(error) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}`
}

/**
 * Vanilla fallback when the UI module never mounts React.
 * Does not import the kit — module failure may be the kit itself.
 */
export function moduleErrorPaintSource(locale: 'en' | 'zh'): string {
  const copy = locale === 'zh'
    ? {
      title: '小程序未能加载',
      hint: '入口模块没有起来，通常是依赖导出缺失或需要重新编译。',
      reload: '重新加载',
    }
    : {
      title: 'This mini-app failed to load',
      hint: 'The UI bundle did not load — a missing export or a compile is the usual cause.',
      reload: 'Reload',
    }
  return `function paintModuleError(appId, message) {
  const target = document.getElementById('root')
  if (!target) return
  target.replaceChildren()
  const card = document.createElement('div')
  card.setAttribute('role', 'alert')
  card.dataset.moduleError = '1'
  card.style.cssText = 'box-sizing:border-box;margin:24px;padding:16px 18px;border-radius:12px;border:1px solid var(--destructive,#dc2626);background:var(--card,#fff);color:var(--foreground,#111);font:13px/1.6 var(--font-sans,ui-sans-serif,system-ui,sans-serif);max-width:720px'
  const head = document.createElement('div')
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px'
  const dot = document.createElement('span')
  dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:var(--destructive,#dc2626);flex:0 0 auto'
  const title = document.createElement('strong')
  title.style.fontSize = '14px'
  title.textContent = ${JSON.stringify(copy.title)}
  const id = document.createElement('code')
  id.style.cssText = 'margin-left:auto;padding:1px 6px;border-radius:6px;background:var(--muted,#f3f4f6);color:var(--muted-foreground,#6b7280);font-size:11px'
  id.textContent = appId
  head.append(dot, title, id)
  const hint = document.createElement('p')
  hint.style.cssText = 'margin:0 0 8px;color:var(--muted-foreground,#6b7280)'
  hint.textContent = ${JSON.stringify(copy.hint)}
  const pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;padding:10px 12px;border-radius:8px;background:var(--muted,#f3f4f6);white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:12px'
  pre.textContent = message
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = ${JSON.stringify(copy.reload)}
  btn.style.cssText = 'padding:5px 12px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--primary,#2563eb);color:var(--primary-foreground,#fff);font:inherit;cursor:pointer'
  btn.onclick = () => { location.reload() }
  row.append(btn)
  card.append(head, hint, pre, row)
  target.append(card)
}`
}

/** Post an unhandled rejection only when it already has a message. */
export function asyncReporterSource(errorsUrl: string): string {
  return `window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  if (message.length === 0) return
  void fetch(${JSON.stringify(errorsUrl)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'async', message }) })
})`
}

/** Drop a resource-load error. Those events have no message and are not script failures. */
export function uncaughtReporterSource(errorsUrl: string): string {
  return `window.addEventListener('error', (event) => {
  if (event.target && event.target !== window) return
  if (typeof event.message !== 'string' || event.message.length === 0) return
  void fetch(${JSON.stringify(errorsUrl)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'uncaught', message: event.message }) })
})`
}

function escapeStyle(style: string): string {
  return style.replaceAll('</', '<\\/')
}

/** Map host `en` | `zh-CN` onto kit `en` | `zh`. */
export function kitLocale(host: string | undefined): 'en' | 'zh' {
  if (host === 'zh-CN' || host === 'zh') return 'zh'
  return 'en'
}

function appearanceAttribute(appearance: 'system' | 'light' | 'dark'): string {
  if (appearance === 'system') return ''
  return ` data-mode="${appearance}"`
}

function appearanceScript(appearance: 'system' | 'light' | 'dark'): string {
  if (appearance !== 'system') return ''
  return `<script>
const applyMode = () => {
  document.documentElement.dataset.mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
applyMode()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMode)
</script>`
}
