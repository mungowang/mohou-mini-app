import { parseAppId } from '@mohou/contract'
import type { Context, Hono } from 'hono'

import type { HostEnv } from './env.ts'
import { streamSSE } from 'hono/streaming'

import { platformLayout, platformModules, platformRuntimePath, platformSdkPath, platformVendorPath } from '../compile/allowlist.ts'
import { acceptDiagnostic, DEFAULT_DIAGNOSTIC_MAX_BYTES, diagnosticLayout, type DiagnosticPorts } from '../tools/diagnostics.ts'
import { httpLayout } from './layout.ts'
import type { LoopbackPorts } from './ports.ts'
import { RouteError } from './route-codes.ts'
import { authoringDenied, errorBody, isRecord } from './reply.ts'

/** Iframe document, call, platform files, and diagnostic posts. */
export function mountIframe(app: Hono<HostEnv>, options: {
  readonly diagnostics?: DiagnosticPorts
  readonly loopback?: LoopbackPorts
}): void {
  if (options.diagnostics !== undefined) mountDiagnostics(app, options.diagnostics)
  const ports = options.loopback
  if (ports === undefined) return
  app.post(httpLayout.call, c => call(c, ports))
  app.get(platformRuntimePath(), async (c) => {
    return script(c, await ports.vendorFile('runtime.js'))
  })
  app.get(platformSdkPath(), async (c) => {
    return script(c, await ports.vendorFile('sdk.js'))
  })
  app.get(`${platformLayout.root}/${platformLayout.vendors}/:file`, c => vendor(c, ports))
  app.get(`${httpLayout.runner}/:appId`, c => document(c, ports))
  app.get(`${diagnosticLayout.root}/:appId/events`, c => events(c, (listener) => {
    const since = Number(c.req.query('since') ?? '0')
    return ports.subscribeApp(c.req.param('appId'), Number.isFinite(since) ? since : 0, listener)
  }))
  app.get(httpLayout.events, c => events(c, (listener) => {
    const stopHost = ports.subscribeHost(listener)
    const stopFrames = ports.subscribeFrames(listener)
    return () => {
      stopHost()
      stopFrames()
    }
  }))
  app.get(`${diagnosticLayout.root}/:appId/${httpLayout.ui}/${httpLayout.sheet}`, (c) => {
    return text(c, () => ports.stylesheet(c.req.param('appId')), 'text/css; charset=utf-8')
  })
  app.get(`${diagnosticLayout.root}/:appId/${httpLayout.ui}/${httpLayout.entry}`, (c) => {
    return entryModule(c, () => ports.entryScript(c.req.param('appId')))
  })
  app.get(`${diagnosticLayout.root}/:appId/${httpLayout.assets}/*`, c => asset(c, ports))
  app.get(`${diagnosticLayout.root}/:appId/${diagnosticLayout.errors}`, (c) => {
    if (!ports.authorized(c.req.header('authorization'))) return authoringDenied(c)
    return c.json(ports.readErrors(c.req.param('appId')))
  })
}

function mountDiagnostics(app: Hono<HostEnv>, ports: DiagnosticPorts): void {
  const max = ports.maxBodyBytes ?? DEFAULT_DIAGNOSTIC_MAX_BYTES
  const post = (kind: string) => async (c: Context) => {
    const raw = await c.req.text()
    const appId = admittedAppId(c.req.param('appId') ?? '')
    if (appId !== undefined && Buffer.byteLength(raw) <= max) acceptDiagnostic(ports, appId, kind, raw)
    return c.body(null, 204)
  }
  app.post(`${diagnosticLayout.root}/:appId/${diagnosticLayout.errors}`, post(diagnosticLayout.errors))
  app.post(`${diagnosticLayout.root}/:appId/${diagnosticLayout.alive}`, post(diagnosticLayout.alive))
  app.post(`${diagnosticLayout.root}/:appId/${diagnosticLayout.absent}`, post(diagnosticLayout.absent))
  app.post(`${diagnosticLayout.root}/:appId/${diagnosticLayout.viewEval}`, post(diagnosticLayout.viewEval))
}

function callBody(result: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (isRecord(result) && result.ok === true && 'value' in result) return { ok: true, value: result.value }
  if (isRecord(result) && result.ok === false) {
    const error = result.error
    const message = isRecord(error) && typeof error.message === 'string'
      ? error.message
      : typeof error === 'string' ? error : 'call failed'
    return { ok: false, error: message }
  }
  return { ok: true, value: result }
}

async function call(c: Context, ports: LoopbackPorts): Promise<Response> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid json' }, 400)
  }
  if (!isRecord(body) || typeof body.appId !== 'string' || body.appId.length === 0 || typeof body.method !== 'string' || body.method.length === 0) {
    return c.json({ ok: false, error: 'missing appId or method' }, 400)
  }
  const appId = body.appId
  const method = body.method
  const args = body.args
  if (!wantsStream(c.req.header('accept'))) {
    try {
      const result = callBody(await ports.call(appId, method, args))
      return result.ok ? c.json(result) : c.json(result, 400)
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : 'call failed' }, 400)
    }
  }
  return streamSSE(c, async (sse) => {
    let chain = Promise.resolve()
    const write = (event: unknown): void => {
      const next = chain.then(() => sse.writeSSE({ data: JSON.stringify(event) }))
      chain = next.then(() => undefined, () => undefined)
    }
    const result = callBody(await ports.call(appId, method, args, (value) => {
      write({ value })
    }))
    await chain
    await sse.writeSSE({
      data: JSON.stringify(result.ok ? { return: result.value } : { error: result.error }),
    })
  })
}

function wantsStream(header: string | undefined): boolean {
  return (header ?? '').toLowerCase().includes('text/event-stream')
}

async function asset(c: Context, ports: LoopbackPorts): Promise<Response> {
  const marker = `/${httpLayout.assets}/`
  const at = c.req.path.indexOf(marker)
  const rest = at < 0 ? '' : c.req.path.slice(at + marker.length)
  try {
    const file = await ports.assetFile(c.req.param('appId') ?? '', rest)
    return new Response(file.bytes, {
      status: 200,
      headers: {
        'content-type': file.type,
        'cache-control': 'no-cache',
      },
    })
  } catch (error) {
    const status = error instanceof RouteError && error.code === 'not-found' ? 404 : 400
    return c.json({ ok: false, error: errorBody(error) }, status)
  }
}

async function vendor(c: Context, ports: LoopbackPorts): Promise<Response> {
  const file = c.req.param('file') ?? ''
  const id = file.replace(/\.js$/, '')
  if (!platformModules.some(row => row.file === platformVendorPath(id))) {
    const error = new RouteError('unknown-vendor', `unknown vendor: ${id}`)
    return c.json({ ok: false, error: { code: error.code, message: error.message } }, 404)
  }
  try {
    return script(c, await ports.vendorFile(file))
  } catch (error) {
    return c.json({ ok: false, error: errorBody(error) }, 400)
  }
}

async function document(c: Context, ports: LoopbackPorts): Promise<Response> {
  const appId = c.req.param('appId') ?? ''
  return text(c, () => ports.runnerDocument(appId), 'text/html; charset=utf-8')
}

function events(c: Context, subscribe: (listener: (event: unknown) => void) => () => void): Response {
  return streamSSE(c, async (stream) => {
    await new Promise<void>((resolve) => {
      const stop = subscribe((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) })
      })
      stream.onAbort(() => {
        stop()
        resolve()
      })
    })
  })
}

function admittedAppId(value: string): string | undefined {
  try {
    return parseAppId(value)
  } catch {
    return undefined
  }
}

function script(c: Context, code: string): Response {
  return c.body(code, 200, { 'content-type': 'text/javascript; charset=utf-8' })
}

async function text(c: Context, work: () => Promise<string>, type: string): Promise<Response> {
  try {
    return c.body(await work(), 200, { 'content-type': type })
  } catch (error) {
    return c.json({ ok: false, error: errorBody(error) }, 400)
  }
}

/**
 * UI entry must stay a JS module. A JSON 400 makes the browser say only
 * "Importing a module script failed" and hides the compile message.
 */
async function entryModule(c: Context, work: () => Promise<string>): Promise<Response> {
  try {
    return script(c, await work())
  } catch (error) {
    const { code, message } = errorBody(error)
    const detail = code === 'failed' ? message : `${code}: ${message}`
    return script(c, [
      `const __mmaUiError = ${JSON.stringify(detail)}`,
      'throw new Error(__mmaUiError)',
      'export default function BrokenUi() { throw new Error(__mmaUiError) }',
      '',
    ].join('\n'))
  }
}
