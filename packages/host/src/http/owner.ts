import type { Context, Hono } from 'hono'

import type { HostEnv } from './env.ts'

import type { McpEditorServer } from '../host/mcp-editor.ts'
import { authorMcpToolList } from '../tools/schemas.ts'
import { historyListBound, httpLayout } from './layout.ts'
import { aboutInfo, type LoopbackPorts } from './ports.ts'
import { authoringDenied, isPin, isRecord, mergePolicy, ok } from './reply.ts'

/** Panel and owner routes. No authoring token. */
export function mountOwner(app: Hono<HostEnv>, ports: LoopbackPorts): void {
  if (ports.panel !== undefined) {
    const panel = ports.panel
    app.get(httpLayout.panel, async (c) => {
      if (panel.paint === undefined) return c.html(panel.html)
      const painted = await panel.paint()
      return c.html(injectPanelPaint(panel.html, painted))
    })
    app.get(httpLayout.panelScript, c => c.body(panel.script, 200, {
      'content-type': 'text/javascript; charset=utf-8',
    }))
  }
  app.get(httpLayout.apps, async (c) => {
    return c.json({ apps: await ports.list() })
  })
  app.get(httpLayout.trash, async (c) => {
    return c.json({ apps: await ports.listTrash() })
  })
  app.get(httpLayout.palettes, async (c) => {
    return c.json(await ports.listPalettes())
  })
  app.get(httpLayout.hostConfig, c => c.json({ ok: true, policy: ports.readPolicy() }))
  app.post(httpLayout.hostConfig, (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    return writeConfig(c, ports)
  })
  app.get(httpLayout.about, c => c.json({
    ok: true,
    ...aboutInfo(),
    authoring: {
      url: `http://127.0.0.1:${ports.readPolicy().hostPort}${httpLayout.mcp}`,
      token: ports.authoringToken,
      tools: authorMcpToolList().map(tool => ({ name: tool.name, description: tool.description })),
    },
  }))
  app.get(httpLayout.updates, async (c) => {
    return c.json({ ok: true, ...await ports.checkUpdate() })
  })
  app.post(httpLayout.updateInstall, async (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    if (ports.installUpdate === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'update install is not available' } }, 400)
    }
    const body = await readBody(c)
    const version = isRecord(body) && typeof body.version === 'string' ? body.version : ''
    return ok(c, async () => {
      if (ports.installUpdate === undefined) throw new Error('update install is not available')
      if (version.length === 0) throw new Error('update version is missing')
      await ports.installUpdate(version)
    })
  })
  app.post(httpLayout.updateAck, async (c) => {
    if (ports.ackUpdate === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'update acknowledgement is not available' } }, 400)
    }
    const body = await readBody(c)
    const at = isRecord(body) && typeof body.at === 'number' ? body.at : undefined
    if (at === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'attempt time is required' } }, 400)
    }
    return ok(c, () => {
      if (ports.ackUpdate === undefined) throw new Error('update acknowledgement is not available')
      return ports.ackUpdate(at)
    })
  })
  app.get(httpLayout.providers, async c => c.json({ providers: await providerList(ports) }))
  app.post(httpLayout.activate, (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    return activate(c, ports)
  })
  app.post(httpLayout.probe, (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    return probe(c, ports)
  })
  app.get(httpLayout.authorSkill, (c) => {
    if (ports.readAuthorSkill === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author skill is not available' } }, 400)
    }
    const custom = c.req.query('custom') ?? ''
    const customDirs = custom.length === 0 ? [] : custom.split('\n')
    return ok(c, async () => {
      if (ports.readAuthorSkill === undefined) throw new Error('author skill is not available')
      return ports.readAuthorSkill(customDirs)
    })
  })
  app.post(httpLayout.authorSkill, async (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    if (ports.writeAuthorSkill === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author skill is not available' } }, 400)
    }
    const body = await readBody(c)
    const agentIds = isRecord(body) && Array.isArray(body.agentIds) ? body.agentIds.filter((item): item is string => typeof item === 'string') : []
    const customDirs = isRecord(body) && Array.isArray(body.customDirs) ? body.customDirs.filter((item): item is string => typeof item === 'string') : []
    return ok(c, async () => {
      if (ports.writeAuthorSkill === undefined) throw new Error('author skill is not available')
      return ports.writeAuthorSkill(agentIds, customDirs)
    })
  })
  app.post(httpLayout.authorSkillReveal, async (c) => {
    if (ports.revealAuthorSkill === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author skill is not available' } }, 400)
    }
    const body = await readBody(c)
    const dest = isRecord(body) && typeof body.dest === 'string' ? body.dest : ''
    return ok(c, async () => {
      if (ports.revealAuthorSkill === undefined) throw new Error('author skill is not available')
      await ports.revealAuthorSkill(dest)
    })
  })
  app.get(httpLayout.authorMcp, (c) => {
    if (ports.readAuthorMcp === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author mcp is not available' } }, 400)
    }
    return ok(c, async () => {
      if (ports.readAuthorMcp === undefined) throw new Error('author mcp is not available')
      return ports.readAuthorMcp()
    })
  })
  app.post(httpLayout.authorMcp, async (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    if (ports.writeAuthorMcp === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author mcp is not available' } }, 400)
    }
    const body = await readBody(c)
    const agentIds = isRecord(body) && Array.isArray(body.agentIds) ? body.agentIds.filter((item): item is string => typeof item === 'string') : []
    const description = isRecord(body) && typeof body.description === 'string' ? body.description : ''
    return ok(c, async () => {
      if (ports.writeAuthorMcp === undefined) throw new Error('author mcp is not available')
      return ports.writeAuthorMcp(agentIds, description)
    })
  })
  app.post(httpLayout.authorMcpReveal, async (c) => {
    if (ports.revealAuthorMcp === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'author mcp is not available' } }, 400)
    }
    const body = await readBody(c)
    const dest = isRecord(body) && typeof body.dest === 'string' ? body.dest : ''
    return ok(c, async () => {
      if (ports.revealAuthorMcp === undefined) throw new Error('author mcp is not available')
      await ports.revealAuthorMcp(dest)
    })
  })
  app.post(httpLayout.restart, (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    if (ports.restart === undefined) {
      return c.json({ ok: false, error: { code: 'config-invalid', message: 'host restart is not available' } }, 400)
    }
    // Delay past response flush. Disposing too soon drops the TCP body and the panel hangs on "Restarting…".
    setTimeout(() => {
      void ports.restart?.().catch((error: unknown) => {
        console.error('host restart failed', error)
      })
    }, 400)
    return c.json({ ok: true, result: { restarting: true } })
  })
  app.get(httpLayout.mcpServers, c => ok(c, () => ports.readMcp()))
  app.post(httpLayout.mcpServers, async (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    const body = await readBody(c)
    const servers = isRecord(body) ? mcpServers(body.servers) : undefined
    if (servers === undefined) return c.json({ ok: false, error: { code: 'config-invalid', message: 'servers are invalid' } }, 400)
    return ok(c, () => ports.writeMcp(servers))
  })
  app.post(httpLayout.mcpCheck, async (c) => {
    const denied = rejectWithoutToken(c, ports)
    if (denied !== undefined) return denied
    const body = await readBody(c)
    const server = mcpServer(body)
    if (server === undefined) return c.json({ ok: false, error: { code: 'config-invalid', message: 'server is invalid' } }, 400)
    return ok(c, () => ports.checkMcp(server))
  })
  app.post(httpLayout.mcpAdmit, async (c) => {
    const body = await readBody(c)
    const text = isRecord(body) && typeof body.text === 'string' ? body.text : undefined
    if (text === undefined) return c.json({ ok: false, error: { code: 'config-invalid', message: 'mcp import is empty' } }, 400)
    return ok(c, () => Promise.resolve({ servers: ports.admitMcp(text) }))
  })
  app.get(`${httpLayout.mcpImport}/:source`, c => ok(c, () => ports.importMcp(c.req.param('source')).then(servers => ({ servers }))))
  app.get(httpLayout.credentials, (c) => {
    if (!ports.authorized(c.req.header('authorization'))) return authoringDenied(c)
    return ok(c, () => ports.readCredentials())
  })
  app.post(httpLayout.credentials, async (c) => {
    if (!ports.authorized(c.req.header('authorization'))) return authoringDenied(c)
    const body = await readBody(c)
    const name = isRecord(body) && typeof body.name === 'string' ? body.name : undefined
    const secret = isRecord(body) && typeof body.secret === 'string' ? body.secret : undefined
    const description = isRecord(body) && typeof body.description === 'string' ? body.description : ''
    if (name === undefined) {
      return c.json({ ok: false, error: { code: 'credential-invalid', message: 'a credential needs a name' } }, 400)
    }
    return ok(c, () => ports.putCredential(name, description, secret))
  })
  app.post(httpLayout.credentialRemove, async (c) => {
    if (!ports.authorized(c.req.header('authorization'))) return authoringDenied(c)
    const body = await readBody(c)
    const name = isRecord(body) && typeof body.name === 'string' ? body.name : undefined
    if (name === undefined) return c.json({ ok: false, error: { code: 'credential-invalid', message: 'credential name is missing' } }, 400)
    return ok(c, () => ports.removeCredential(name))
  })
  app.post(`${httpLayout.apps}/:appId/${httpLayout.open}`, async (c) => {
    const body = await readBody(c)
    const title = isRecord(body) && typeof body.title === 'string' ? body.title : undefined
    return ok(c, () => ports.open(c.req.param('appId'), title))
  })
  app.post(`${httpLayout.apps}/:appId/${httpLayout.reload}`, c => ok(c, () => ports.reload(c.req.param('appId'))))
  app.get(`${httpLayout.apps}/:appId/${httpLayout.history}`, async (c) => {
    const raw = Number(c.req.query('limit') ?? '')
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : historyListBound.default, historyListBound.max)
    const nodes = await ports.readHistory(c.req.param('appId'))
    return c.json({ commits: nodes.slice(0, limit) })
  })
  app.get(`${httpLayout.apps}/:appId/${httpLayout.history}/:commitId`, (c) => {
    return ok(c, () => ports.readCommit(c.req.param('appId'), c.req.param('commitId')))
  })
  app.post(`${httpLayout.apps}/:appId/${httpLayout.storage}/${httpLayout.restoreStorage}`, (c) => {
    return ok(c, () => ports.restoreStorage(c.req.param('appId')))
  })
  app.get(`${httpLayout.apps}/:appId/${httpLayout.storage}`, c => ok(c, () => ports.readStorage(c.req.param('appId'))))
  app.get(`${httpLayout.apps}/:appId/${httpLayout.storage}/:table`, (c) => {
    return ok(c, () => ports.readTable(c.req.param('appId'), c.req.param('table')))
  })
  app.get(`${httpLayout.apps}/:appId/${httpLayout.theme}`, c => ok(c, async () => ({
    pin: await ports.readPin(c.req.param('appId')),
    appFile: await ports.appFile(c.req.param('appId')),
    appTheme: await ports.readAppTheme(c.req.param('appId')),
  })))
  app.post(`${httpLayout.apps}/:appId/${httpLayout.theme}`, async (c) => {
    const body = await readBody(c)
    if (!isPin(body)) {
      return c.json({ ok: false, error: { code: 'theme-invalid', message: 'pin is invalid' } }, 400)
    }
    return ok(c, () => ports.setPin(c.req.param('appId'), body))
  })
  app.delete(`${httpLayout.app}/:appId`, c => ok(c, () => ports.deleteApp(c.req.param('appId'))))
  app.post(`${httpLayout.trash}/:appId/${httpLayout.restore}`, (c) => {
    return ok(c, () => ports.undeleteApp(c.req.param('appId')))
  })
}

async function providerList(ports: LoopbackPorts): Promise<unknown[]> {
  return Promise.all(ports.providers.map(async (provider) => {
    const describe = provider.describe?.bind(provider)
    return {
      id: provider.id,
      ...provider.label === undefined ? {} : { label: provider.label },
      fields: describe?.() ?? [],
      models: provider.models === undefined ? [] : await provider.models(),
    }
  }))
}

async function writeConfig(c: Context, ports: LoopbackPorts): Promise<Response> {
  const body = await readBody(c)
  if (!isRecord(body)) {
    return c.json({ ok: false, error: { code: 'config-invalid', message: 'invalid json' } }, 400)
  }
  return ok(c, () => ports.writePolicy(mergePolicy(ports.readPolicy(), body)))
}

async function activate(c: Context, ports: LoopbackPorts): Promise<Response> {
  const body = await readBody(c)
  if (!isRecord(body) || typeof body.id !== 'string') {
    return c.json({ ok: false, error: { code: 'config-invalid', message: 'provider id is required' } }, 400)
  }
  const current = ports.readPolicy()
  if (!isRecord(current)) {
    return c.json({ ok: false, error: { code: 'config-missing', message: 'host config is missing' } }, 400)
  }
  return ok(c, () => ports.writePolicy({
    ...current,
    runtimeProvider: {
      id: body.id,
      ...isRecord(body.config) ? { config: body.config } : {},
    },
  }))
}

async function probe(c: Context, ports: LoopbackPorts): Promise<Response> {
  const body = await readBody(c)
  const id = isRecord(body) ? body.id : undefined
  if (typeof id !== 'string') {
    return c.json({ ok: false, error: { code: 'provider-missing', message: 'provider id is required' } }, 400)
  }
  return ok(c, () => ports.probe(id))
}

function mcpServers(value: unknown): readonly McpEditorServer[] | undefined {
  if (!Array.isArray(value)) return undefined
  const servers: McpEditorServer[] = []
  for (const item of value) {
    const server = mcpServer(item)
    if (server === undefined) return undefined
    servers.push(server)
  }
  return servers
}

function mcpServer(value: unknown): McpEditorServer | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim().length === 0) return undefined
  const args = stringList(value.args)
  const env = stringRecord(value.env)
  const headers = stringRecord(value.headers)
  const transport = value.transport === 'sse' || value.transport === 'streamable-http' ? value.transport : undefined
  let server: McpEditorServer = { id: value.id }
  if (typeof value.description === 'string' && value.description.trim().length > 0) server = { ...server, description: value.description.trim() }
  if (value.enabled === false || value.disabled === true) server = { ...server, enabled: false }
  if (typeof value.command === 'string') server = { ...server, command: value.command }
  if (args !== undefined) server = { ...server, args }
  if (env !== undefined) server = { ...server, env }
  if (typeof value.url === 'string') server = { ...server, url: value.url }
  if (transport !== undefined) server = { ...server, transport }
  if (headers !== undefined) server = { ...server, headers }
  return server
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined
  return value
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const record: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return undefined
    record[key] = item
  }
  return record
}

/** A route that changes host configuration or spawns a configured process requires the token. */
function rejectWithoutToken(c: Context, ports: LoopbackPorts): Response | undefined {
  return ports.authorized(c.req.header('authorization')) ? undefined : authoringDenied(c)
}

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}

/** Bake the host palette into the panel document. Tailwind utilities read these variables. */
export function injectPanelPaint(
  html: string,
  paint: { readonly style: string; readonly appearance: 'system' | 'light' | 'dark' },
): string {
  const mode = paint.appearance === 'system' ? '' : ` data-mode="${paint.appearance}"`
  const script = paint.appearance === 'system'
    ? `<script>
const applyMode = () => { document.documentElement.dataset.mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }
applyMode()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMode)
</script>`
    : ''
  return html
    .replace('<html>', `<html${mode}>`)
    .replace('</head>', `<style id="mma-theme">${paint.style.replaceAll('</', '<\\/')}</style>${script}</head>`)
}
