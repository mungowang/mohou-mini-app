import { appsResource, httpLayout } from '@mohou/host/http'
import {
  panelUpdateFailureCodes,
  PanelClientError,
  type GalleryApp,
  type HistoryClient,
  type HistoryCommit,
  type HistoryDetail,
  type PanelClient,
  type PanelPolicy,
  type PanelPolicyWrite,
  type PanelAbout,
  type PanelProbe,
  type PanelRuntime,
  type PanelAuthorMcpStatus,
  type PanelSkillStatus,
  type PanelUpdateAttempt,
  type PanelUpdateCheck,
  type PanelUpdateFailureCode,
  type McpCheckResult,
  type McpServerDraft,
  type PanelCredential,
  type PanelMcpFailure,
  type PanelSettingsClient,
  type StorageClient,
  type ThemeClient,
  type ThemePin,
} from '@mohou/panel'

/** Panel calls over the loopback origin. Route strings stay in the host path table. */
export function httpPanelClients(origin: string): PanelClient & PanelSettingsClient & HistoryClient & StorageClient & ThemeClient {
  return {
    list: () => readApps(origin, httpLayout.apps),
    listTrash: () => readApps(origin, httpLayout.trash),
    open: (appId, title) => postOk(origin, appsResource(appId, httpLayout.open), title === undefined ? {} : { title }),
    deleteApp: appId => sendOk(origin, 'DELETE', `${httpLayout.app}/${encodeURIComponent(appId)}`),
    undeleteApp: appId => postOk(origin, `${httpLayout.trash}/${encodeURIComponent(appId)}/${httpLayout.restore}`),
    reload: appId => postOk(origin, appsResource(appId, httpLayout.reload)),
    readPolicy: async () => publicPolicy((await getJson(origin, httpLayout.hostConfig)).policy),
    writePolicy: async (policy) => {
      const body = await sendJson(origin, 'POST', httpLayout.hostConfig, policy, true)
      const result = record(body.result)
      return {
        policy: publicPolicy(result.policy),
        restartRequired: result.restartRequired === true,
      } satisfies PanelPolicyWrite
    },
    probe: async (id) => {
      const body = await sendJson(origin, 'POST', httpLayout.probe, { id }, true)
      return probeOf(resultOf(body))
    },
    readAbout: async () => panelAbout(await getJson(origin, httpLayout.about)),
    readSkill: async (customDirs = []) => {
      const query = customDirs.length === 0 ? '' : `?custom=${encodeURIComponent(customDirs.join('\n'))}`
      return skillStatus(await getJson(origin, `${httpLayout.authorSkill}${query}`))
    },
    installSkill: async (agentIds, customDirs) => skillStatus(await sendJson(origin, 'POST', httpLayout.authorSkill, { agentIds, customDirs }, true)),
    revealSkill: dest => postOk(origin, httpLayout.authorSkillReveal, { dest }),
    readAuthorMcp: async () => authorMcpStatus(await getJson(origin, httpLayout.authorMcp)),
    installAuthorMcp: async (agentIds, description) => authorMcpStatus(await sendJson(origin, 'POST', httpLayout.authorMcp, { agentIds, description }, true)),
    revealAuthorMcp: dest => postOk(origin, httpLayout.authorMcpReveal, { dest }),
    checkUpdate: async () => updateCheck(await getJson(origin, httpLayout.updates)),
    installUpdate: async (version) => { await sendJson(origin, 'POST', httpLayout.updateInstall, { version }, true) },
    ackUpdate: async (at) => { await sendJson(origin, 'POST', httpLayout.updateAck, { at }) },
    restartHost: async () => { await sendJson(origin, 'POST', httpLayout.restart, {}, true) },
    listRuntimes: async () => arrayOf((await getJson(origin, httpLayout.providers)).providers, runtimeOf),
    readCredentials: async () => {
      const result = resultOf(await sendJson(origin, 'GET', httpLayout.credentials, undefined, true))
      return {
        credentials: arrayOf(result.credentials, panelCredential),
        writable: result.writable === true,
      }
    },
    putCredential: async (name, description, secret) => {
      await sendJson(origin, 'POST', httpLayout.credentials, { name, description, secret }, true)
    },
    removeCredential: async (name) => {
      await sendJson(origin, 'POST', httpLayout.credentialRemove, { name }, true)
    },
    listMcp: async () => {
      const result = resultOf(await getJson(origin, httpLayout.mcpServers))
      return {
        servers: arrayOf(result.servers, mcpServer),
        unresolved: arrayOf(result.unresolved, mcpFailure),
      }
    },
    writeMcp: async (servers) => {
      const body = await sendJson(origin, 'POST', httpLayout.mcpServers, { servers }, true)
      return { unresolved: arrayOf(resultOf(body).unresolved, mcpFailure) }
    },
    checkMcp: async (server) => {
      const body = await sendJson(origin, 'POST', httpLayout.mcpCheck, server, true)
      return mcpCheck(resultOf(body))
    },
    admitMcp: async (text) => {
      const body = await sendJson(origin, 'POST', httpLayout.mcpAdmit, { text })
      return arrayOf(resultOf(body).servers, mcpServer)
    },
    importMcp: async (source) => {
      const body = await getJson(origin, `${httpLayout.mcpImport}/${encodeURIComponent(source)}`)
      return arrayOf(resultOf(body).servers, mcpServer)
    },
    readHistory: async (appId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.history))
      return arrayOf(body.commits, historyCommit)
    },
    readCommit: async (appId, commitId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.history, commitId))
      return historyDetail(resultOf(body))
    },
    readStorage: async (appId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.storage))
      return storageSummary(resultOf(body))
    },
    restoreStorage: appId => postOk(origin, appsResource(appId, httpLayout.storage, httpLayout.restoreStorage)),
    readTable: async (appId, table) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.storage, table))
      return { rows: arrayOf(resultOf(body).rows, row => row) }
    },
    listPalettes: async () => {
      const body = await getJson(origin, httpLayout.palettes)
      return {
        palettes: arrayOf(body.palettes, paletteChip),
        ignored: arrayOf(body.ignored, ignoredPalette),
      }
    },
    readPin: async (appId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.theme))
      return themePin(resultOf(body).pin)
    },
    appFile: async (appId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.theme))
      return resultOf(body).appFile === true
    },
    readAppTheme: async (appId) => {
      const body = await getJson(origin, appsResource(appId, httpLayout.theme))
      return appThemeOf(resultOf(body).appTheme)
    },
    setPin: async (appId, pin) => {
      const body = await sendJson(origin, 'POST', appsResource(appId, httpLayout.theme), pin)
      return themePin(resultOf(body))
    },
  }
}

function resultOf(body: Record<string, unknown>): Record<string, unknown> {
  return record(body.result)
}

function probeOf(value: unknown): PanelProbe {
  const row = record(value)
  if (typeof row.healthy !== 'boolean') throw new PanelClientError('failed', 'probe response is invalid')
  return {
    healthy: row.healthy,
    ...typeof row.code === 'string' ? { code: row.code } : {},
    ...typeof row.message === 'string' ? { message: row.message } : {},
  }
}

function historyCommit(value: unknown): HistoryCommit {
  const row = record(value)
  if (typeof row.id !== 'string' || typeof row.message !== 'string' || typeof row.time !== 'string') {
    throw new PanelClientError('failed', 'history row is invalid')
  }
  return {
    id: row.id,
    message: row.message,
    time: row.time,
    parentIds: arrayOf(row.parentIds, text),
  }
}

function historyDetail(value: unknown): HistoryDetail {
  const row = record(value)
  if (typeof row.message !== 'string' || typeof row.time !== 'string') {
    throw new PanelClientError('failed', 'history detail is invalid')
  }
  return {
    message: row.message,
    time: row.time,
    parentIds: arrayOf(row.parentIds, text),
    files: arrayOf(row.files, historyFile),
  }
}

function historyFile(value: unknown): HistoryDetail['files'][number] {
  const row = record(value)
  if (typeof row.path !== 'string' || typeof row.add !== 'number' || typeof row.del !== 'number' || typeof row.preview !== 'string') {
    throw new PanelClientError('failed', 'history file is invalid')
  }
  return { path: row.path, add: row.add, del: row.del, preview: row.preview }
}

function storageSummary(value: unknown): { bytes: number; tables: readonly string[] } {
  const row = record(value)
  if (typeof row.bytes !== 'number') throw new PanelClientError('failed', 'storage summary is invalid')
  return { bytes: row.bytes, tables: arrayOf(row.tables, text) }
}

function paletteChip(value: unknown): { id: string; name: string; nameZh?: string; swatch?: string; style?: string; origin?: 'builtin' | 'custom' } {
  const row = record(value)
  if (typeof row.id !== 'string' || typeof row.name !== 'string') {
    throw new PanelClientError('failed', 'palette row is invalid')
  }
  return {
    id: row.id,
    name: row.name,
    ...typeof row.nameZh === 'string' && row.nameZh.length > 0 ? { nameZh: row.nameZh } : {},
    ...typeof row.swatch === 'string' && row.swatch.length > 0 ? { swatch: row.swatch } : {},
    ...typeof row.style === 'string' && row.style.length > 0 ? { style: row.style } : {},
    ...row.origin === 'builtin' || row.origin === 'custom' ? { origin: row.origin } : {},
  }
}

function appThemeOf(value: unknown): { name?: string; nameZh?: string; swatch?: string; style?: string } | null {
  if (value === null || value === undefined) return null
  const row = record(value)
  if (typeof row.swatch !== 'string' || typeof row.style !== 'string') return null
  return {
    ...typeof row.name === 'string' && row.name.length > 0 ? { name: row.name } : {},
    ...typeof row.nameZh === 'string' && row.nameZh.length > 0 ? { nameZh: row.nameZh } : {},
    swatch: row.swatch,
    style: row.style,
  }
}

function ignoredPalette(value: unknown): { file: string; reason: string } {
  const row = record(value)
  if (typeof row.file !== 'string' || typeof row.reason !== 'string') {
    throw new PanelClientError('failed', 'ignored palette is invalid')
  }
  return { file: row.file, reason: row.reason }
}

function themePin(value: unknown): ThemePin {
  const row = record(value)
  if (row.kind === 'default' || row.kind === 'follow-host' || row.kind === 'app-file') return { kind: row.kind }
  if (row.kind === 'palette' && typeof row.id === 'string') return { kind: 'palette', id: row.id }
  throw new PanelClientError('failed', 'pin is invalid')
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new PanelClientError('failed', 'text field is invalid')
  return value
}

function publicPolicy(value: unknown): PanelPolicy {
  const policy = record(value)
  const llm = policy.llm
  const desk = optionalText(policy.defaultWorkbenchId)
  return {
    theme: policy.theme === 'dark' || policy.theme === 'system' ? policy.theme : 'light',
    palette: typeof policy.palette === 'string' ? policy.palette : '',
    locale: typeof policy.locale === 'string' ? policy.locale : '',
    chatLanguage: typeof policy.chatLanguage === 'string' ? policy.chatLanguage : '',
    hostPort: typeof policy.hostPort === 'number' ? policy.hostPort : 0,
    llm: llmOf(llm),
    runtimeProvider: { id: text(record(policy.runtimeProvider).id) },
    ...desk === undefined ? {} : { defaultWorkbenchId: desk },
  }
}

async function readApps(origin: string, path: string): Promise<GalleryApp[]> {
  return arrayOf((await getJson(origin, path)).apps, galleryApp)
}

function galleryApp(value: unknown): GalleryApp {
  const row = record(value)
  const tags = row.tags
  const createdAt = optionalText(row.createdAt)
  const updatedAt = optionalText(row.updatedAt)
  const activity = activityOf(row.activity)
  return {
    id: text(row.id),
    name: text(row.name),
    description: text(row.description),
    version: text(row.version),
    acronym: text(row.acronym),
    ...tags === undefined ? {} : { tags: tagList(tags) },
    ...createdAt === undefined ? {} : { createdAt },
    ...updatedAt === undefined ? {} : { updatedAt },
    ...activity === undefined ? {} : { activity },
    ...row.kind === 'workbench' ? { kind: 'workbench' as const } : {},
  }
}

function activityOf(value: unknown): GalleryApp['activity'] {
  if (value === undefined) return undefined
  const row = record(value)
  if (typeof row.openCount !== 'number' || typeof row.lastOpenedAt !== 'string') {
    throw new PanelClientError('failed', 'activity is invalid')
  }
  return { openCount: row.openCount, lastOpenedAt: row.lastOpenedAt }
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return text(value)
}

function tagList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new PanelClientError('failed', 'tags are invalid')
  return value.map(text)
}

function llmOf(value: unknown): PanelPolicy['llm'] {
  if (value === null || value === undefined) return null
  const row = record(value)
  return { provider: text(row.provider), model: text(row.model) }
}

async function postOk(origin: string, path: string, body?: unknown): Promise<void> {
  await sendJson(origin, 'POST', path, body ?? {})
}

async function sendOk(origin: string, method: string, path: string): Promise<void> {
  await sendJson(origin, method, path)
}

async function getJson(origin: string, path: string): Promise<Record<string, unknown>> {
  return sendJson(origin, 'GET', path)
}

/** The panel's own token, read once per origin. The about block is where a panel gets it. */
const panelTokens = new Map<string, string>()

async function authoringToken(origin: string): Promise<string> {
  const known = panelTokens.get(origin)
  if (known !== undefined) return known
  const token = panelAbout(await getJson(origin, httpLayout.about)).authoring.token
  panelTokens.set(origin, token)
  return token
}

/** `authorize` marks a route Host guards with the authoring token. Each call site says which. */
async function sendJson(
  origin: string,
  method: string,
  path: string,
  body?: unknown,
  authorize = false,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (authorize) headers.authorization = `Bearer ${await authoringToken(origin)}`
  let response: Response
  try {
    response = await fetch(`${origin}${path}`, {
      method,
      ...Object.keys(headers).length === 0 ? {} : { headers },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
    })
  } catch (error) {
    throw new PanelClientError('unreachable', error instanceof Error ? error.message : 'host is unreachable')
  }
  const parsed = await response.json() as Record<string, unknown>
  if (!response.ok || parsed.ok === false) {
    const error = parsed.error
    const message = typeof error === 'string' ? error : record(error).message
    throw new PanelClientError('failed', typeof message === 'string' ? message : 'request failed')
  }
  return parsed
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function mcpFailure(value: unknown): PanelMcpFailure {
  const row = record(value)
  if (typeof row.id !== 'string') throw new PanelClientError('failed', 'mcp failure is invalid')
  return {
    id: row.id,
    code: typeof row.code === 'string' ? row.code : 'config-invalid',
    message: typeof row.message === 'string' ? row.message : '',
  }
}

function panelCredential(value: unknown): PanelCredential {
  const row = record(value)
  if (typeof row.name !== 'string') throw new PanelClientError('failed', 'credential is invalid')
  return { name: row.name, description: typeof row.description === 'string' ? row.description : '' }
}

function mcpServer(value: unknown): McpServerDraft {
  const row = record(value)
  if (typeof row.id !== 'string') throw new PanelClientError('failed', 'mcp server is invalid')
  const transport = row.transport === 'sse' || row.transport === 'streamable-http' ? row.transport : undefined
  return {
    id: row.id,
    ...typeof row.description === 'string' && row.description.length > 0 ? { description: row.description } : {},
    ...row.enabled === false || row.disabled === true ? { enabled: false } : {},
    ...typeof row.command === 'string' ? { command: row.command } : {},
    ...Array.isArray(row.args) ? { args: row.args.filter((item): item is string => typeof item === 'string') } : {},
    ...typeof row.url === 'string' ? { url: row.url } : {},
    ...transport === undefined ? {} : { transport },
    ...stringMap(row.env, 'env'),
    ...stringMap(row.headers, 'headers'),
  }
}

function mcpCheck(value: Record<string, unknown>): McpCheckResult {
  const tools = Array.isArray(value.tools) ? value.tools.flatMap((item) => {
    const row = record(item)
    if (typeof row.name !== 'string') return []
    const input = mcpSchema(row.inputSchema)
    const output = mcpSchema(row.outputSchema)
    return [{
      name: row.name,
      ...typeof row.description === 'string' ? { description: row.description } : {},
      ...input === undefined ? {} : { inputSchema: input },
      ...output === undefined ? {} : { outputSchema: output },
    }]
  }) : []
  return {
    ok: value.ok === true,
    tools,
    ...typeof value.code === 'string' ? { code: value.code } : {},
    ...typeof value.message === 'string' ? { message: value.message } : {},
  }
}

/** A schema is a JSON object. A row that carries anything else reads as no schema. */
function mcpSchema(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringMap(value: unknown, field: 'env' | 'headers'): { env: Record<string, string> } | { headers: Record<string, string> } | Record<string, never> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const mapped: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && key.length > 0) mapped[key] = item
  }
  if (Object.keys(mapped).length === 0) return {}
  return field === 'env' ? { env: mapped } : { headers: mapped }
}

function panelAbout(value: Record<string, unknown>): PanelAbout {
  const authoring = record(value.authoring)
  return {
    name: text(value.name),
    current: text(value.current),
    platform: text(value.platform),
    authoring: {
      url: text(authoring.url),
      token: text(authoring.token),
      tools: Array.isArray(authoring.tools)
        ? authoring.tools.flatMap((item) => {
          const row = record(item)
          return typeof row.name === 'string' ? [{ name: row.name, description: text(row.description) }] : []
        })
        : [],
    },
  }
}

function arrayOf<T>(value: unknown, admit: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new PanelClientError('failed', 'list field is invalid')
  return value.map(admit)
}

function runtimeOf(value: unknown): PanelRuntime {
  const row = record(value)
  if (typeof row.id !== 'string' || row.id.length === 0) throw new PanelClientError('failed', 'runtime is invalid')
  return {
    id: row.id,
    ...typeof row.label === 'string' && row.label.length > 0 ? { label: row.label } : {},
    models: Array.isArray(row.models) ? row.models.flatMap(listingOf) : [],
  }
}

function listingOf(value: unknown): PanelRuntime['models'] {
  const row = record(value)
  if (typeof row.provider !== 'string' || row.provider.length === 0 || !Array.isArray(row.models)) return []
  const models = row.models.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return models.length === 0 ? [] : [{ provider: row.provider, models }]
}

function skillStatus(value: Record<string, unknown>): PanelSkillStatus {
  const row = record(value.result ?? value)
  return {
    skillId: text(row.skillId),
    version: skillVersion(row.version),
    agents: Array.isArray(row.agents) ? row.agents.flatMap(skillAgent) : [],
    customs: Array.isArray(row.customs) ? row.customs.flatMap(skillCustom) : [],
  }
}

function skillCopy(row: Record<string, unknown>): {
  dest: string
  installed: boolean
  version: string | null
  updateAvailable: boolean
} | undefined {
  if (typeof row.dest !== 'string') return undefined
  return {
    dest: row.dest,
    installed: row.installed === true,
    version: skillVersion(row.version),
    updateAvailable: row.updateAvailable === true,
  }
}

function skillVersion(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function skillAgent(value: unknown): PanelSkillStatus['agents'] {
  const row = record(value)
  const copy = skillCopy(row)
  if (typeof row.id !== 'string' || copy === undefined) return []
  return [{
    id: row.id,
    label: text(row.label) || row.id,
    skillsDir: text(row.skillsDir),
    homePresent: row.homePresent === true,
    ...copy,
  }]
}

function skillCustom(value: unknown): PanelSkillStatus['customs'] {
  const row = record(value)
  const copy = skillCopy(row)
  if (typeof row.dir !== 'string' || copy === undefined) return []
  return [{ dir: row.dir, ...copy }]
}

function authorMcpStatus(value: Record<string, unknown>): PanelAuthorMcpStatus {
  const row = record(value.result ?? value)
  return {
    agents: Array.isArray(row.agents) ? row.agents.flatMap(authorMcpAgent) : [],
  }
}

function authorMcpAgent(value: unknown): PanelAuthorMcpStatus['agents'] {
  const row = record(value)
  if (typeof row.id !== 'string' || typeof row.dest !== 'string') return []
  return [{
    id: row.id,
    label: text(row.label) || row.id,
    dest: row.dest,
    homePresent: row.homePresent === true,
    installed: row.installed === true,
    updateAvailable: row.updateAvailable === true,
    ...typeof row.adapter === 'string' && row.adapter.length > 0 ? { adapter: row.adapter } : {},
  }]
}

function updateCheck(value: Record<string, unknown>): PanelUpdateCheck {
  const attempt = updateAttempt(value.lastAttempt)
  return {
    name: text(value.name),
    current: text(value.current),
    latest: typeof value.latest === 'string' ? value.latest : null,
    updateAvailable: value.updateAvailable === true,
    ...value.channel === 'registry' || value.channel === 'tarball' ? { channel: value.channel } : {},
    ...value.installable === true ? { installable: true } : {},
    ...typeof value.error === 'string' ? { error: value.error } : {},
    ...attempt === undefined ? {} : { lastAttempt: attempt },
  }
}

/** The launcher's record crosses the wire as unknown JSON. A code this panel does not know reads as no record. */
function updateAttempt(value: unknown): PanelUpdateAttempt | undefined {
  const row = record(value)
  const at = row.at
  if (typeof at !== 'number' || !Number.isFinite(at)) return undefined
  const from = updateVersion(row.from)
  const to = updateVersion(row.to)
  if (row.state === 'done') {
    return {
      state: 'done',
      at,
      ...from === undefined ? {} : { from },
      ...to === undefined ? {} : { to },
    }
  }
  if (row.state !== 'failed') return undefined
  const code = row.code
  if (typeof code !== 'string' || !(panelUpdateFailureCodes as readonly string[]).includes(code)) return undefined
  return {
    state: 'failed',
    code: code as PanelUpdateFailureCode,
    rolledBack: row.rolledBack === true,
    at,
    ...from === undefined ? {} : { from },
    ...to === undefined ? {} : { to },
    ...typeof row.exitCode === 'number' && Number.isFinite(row.exitCode) ? { exitCode: row.exitCode } : {},
    ...typeof row.log === 'string' && row.log.length > 0 ? { log: row.log } : {},
  }
}

function updateVersion(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
