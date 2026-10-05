import { randomBytes } from 'node:crypto'
import { closeSync, openSync, writeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { appEntries, resolveManifest, type AppApiMethod, type AppConfig, type AppId, type AppWorkbench } from '@mohou/contract'
import type { McpClient } from '@mohou/mcp-client'
import type { RuntimeProvider } from '@mohou/runtime-provider'

import type { AppSummary } from '../apps/registry.ts'
import { cachedUiBundle, purgeAutogen } from '../compile/autogen.ts'
import { loadBackend } from '../compile/load-backend.ts'
import { reviewApp, type ReviewNotice } from '../compile/review.ts'
import { DEFAULT_APP_EVENT_TAIL, createAppEvents, type AppEvents } from '../events/app-events.ts'
import { createErrorRing } from '../events/error-ring.ts'
import { createHostEvents } from '../events/host-events.ts'
import { createViewQueries } from '../events/view-eval.ts'
import { createFileTools, type FileCommit } from '../files/tools.ts'
import { commitApp, listHistory, resetApp } from '../history/store.ts'
import { DEFAULT_STORAGE_NOTICE_BYTES } from '../storage/open.ts'
import { restoreStorageBackup } from '../storage/schema.ts'
import type { CredentialProvider } from '../credentials/provider.ts'
import { hostAuthoringToken } from '../host/layout.ts'
import { checkMcpEditor, maskEditorServers, readMcpEditor, writeMcpEditor, type McpEditorServer } from '../host/mcp-editor.ts'
import { mcpReferenceSources, type McpLoadFailure } from '../host/mcp.ts'
import { recordOpen } from '../host/activity.ts'
import { InstallError } from '../install/codes.ts'
import { installApp, type InstallRequest, type NpmRun } from '../install/install.ts'
import { installLayout } from '../install/layout.ts'
import { bindBrain } from '../kernel/bind-brain.ts'
import { runCall, type CallCapabilities } from '../kernel/call.ts'
import { openStorage, type StorageFile } from '../storage/open.ts'
import { listMcpForAuthor, toolsMcpForAuthor } from './mcp-list.ts'
import { AuthorError } from './codes.ts'

/** Tools this implementation can run. The rest of the catalog is not mounted. */
export const authorToolNames = [
  'mini_app_list',
  'mini_app_get',
  'mini_app_list_files',
  'mini_app_read',
  'mini_app_edit',
  'mini_app_write',
  'mini_app_delete',
  'mini_app_register',
  'mini_app_reload',
  'mini_app_call',
  'mini_app_mcp_list',
  'mini_app_mcp_tools',
  'mini_app_mcp_add',
  'mini_app_mcp_remove',
  'mini_app_credential_list',
  'mini_app_history_commit',
  'mini_app_history_list',
  'mini_app_history_reset',
  'mini_app_open',
  'mini_app_errors',
  'mini_app_install',
  'mini_app_view_eval',
] as const

export type AuthorToolName = (typeof authorToolNames)[number]

/** Commit message for a successful reload. The tool description is the same sentence. */
export const reloadMessage = 'Compile and reload a mini-app.'

/** Byte-carrying file tools. HTTP invoke keeps them. MCP does not list or call them. */
export const authorByteToolNames = ['mini_app_edit', 'mini_app_write', 'mini_app_delete'] as const

export type AuthorByteToolName = (typeof authorByteToolNames)[number]

export const authorMcpToolNames = authorToolNames.filter(
  (name): name is Exclude<AuthorToolName, AuthorByteToolName> => {
    return !(authorByteToolNames as readonly string[]).includes(name)
  },
)

/** Locked batch cap. A larger batch fails before any entry runs. */
const CALL_BATCH_MAX = 20

export interface AuthorCallPorts {
  readonly credentials: CredentialProvider
  readonly config: AppConfig
  readonly log: (appId: string, ...args: unknown[]) => void
  readonly push: (name: string, params?: unknown) => void
  readonly http: CallCapabilities['http']
  readonly bash: CallCapabilities['bash']
  readonly pwsh: CallCapabilities['pwsh']
  readonly metrics: CallCapabilities['metrics']
  readonly processDirectory: string
  readonly createTemp: () => string
  readonly provider: RuntimeProvider
  readonly workbench?: AppWorkbench
}

interface LiveApp {
  api: Record<string, AppApiMethod>
  storage: StorageFile
  directory: string
  ui?: string
  kind?: 'workbench'
}

interface Registry {
  readonly runtimeRoot: string
  list: () => Promise<{ apps: AppSummary[]; runtimeRoot: string }>
  get: (appId: string) => Promise<AppSummary>
  register: (appId: string, files: Record<string, string>) => Promise<AppSummary>
  trash: (appId: string) => Promise<void>
  restoreTrashed: (appId: string) => Promise<AppSummary>
}

/**
 * One authoring implementation. MCP and HTTP call this. They do not grow a second manager.
 * @param options - registry, the external MCP client, and call ports
 */
export function createAuthorTools(options: {
  readonly registry: Registry
  readonly mcp: McpClient
  /** Servers the live client left out: boot's list, replaced by every write. The list reports them. */
  readonly readMcpFailures?: () => readonly McpLoadFailure[]
  readonly recordMcpFailures?: (failures: readonly McpLoadFailure[]) => void
  /** Process environment. Names the MCP server file when `MINI_APP_MCP_CONFIG` is set. */
  readonly env?: NodeJS.ProcessEnv
  readonly ports: AuthorCallPorts
  /** Called when a commit or a reset changes the tree. The session publishes `app:reload`. */
  readonly onTreeChanged?: (appId: string) => void
  /** Replaces npm in tests. Package names are not passed on the command line. */
  readonly runNpm?: NpmRun
  readonly installTimeoutMs?: number
  /** View query wait when the tool omits one. Host policy, not a locked number. */
  readonly viewTimeoutMs?: number
  /** Author event tail. Host policy, not a locked number. */
  readonly eventTailLength?: number
  /** Bytes past which a committed write may emit one storage-size notice. Not locked. */
  readonly storageNoticeBytes?: number
  /** Platform keyframe names. Empty until a stylesheet owns them. */
  readonly reservedKeyframes?: readonly string[]
  /** Time of an open. Tests pass a fixed clock. */
  readonly now?: () => string
}) {
  const live = new Map<string, LiveApp>()
  const hostEvents = createHostEvents()
  const appEvents = createAppEvents({ tailLength: options.eventTailLength ?? DEFAULT_APP_EVENT_TAIL })
  const errors = createErrorRing()
  const views = createViewQueries({
    ...options.viewTimeoutMs === undefined ? {} : { timeoutMs: options.viewTimeoutMs },
  })
  const bound = { ...options, hostEvents, appEvents, errors, views }
  const inflight = new Set<Promise<unknown>>()
  let stopping = false
  const track = <T>(work: Promise<T>): Promise<T> => {
    if (stopping) return Promise.reject(new AuthorError('cancelled', 'host is stopping'))
    const tracked = work.finally(() => {
      inflight.delete(tracked)
    })
    inflight.add(tracked)
    return tracked
  }
  return {
    names: authorToolNames,
    hostEvents,
    appEvents,
    errors,
    views,
    liveBundle: (appId: string) => live.get(appId)?.ui,
    invoke: (name: string, args: unknown) => track(invoke(bound, live, name, args)),
    callObserved: (appId: string, method: string, args: unknown, publish: (value: unknown) => Promise<void> | void) => {
      return track(oneCall(bound, live, appId, method, args, publish))
    },
    deleteApp: (appId: string) => track(removeApp(bound, live, appId)),
    undeleteApp: (appId: string) => track(restoreDeleted(bound, appId)),
    restoreStorage: (appId: string) => track(restoreAppStorage(bound, live, appId)),
    settle() {
      stopping = true
      return Promise.allSettled([...inflight]).then(() => undefined)
    },
    dispose() {
      stopping = true
      for (const app of live.values()) app.storage.close()
      live.clear()
      appEvents.dispose()
    },
  }
}

/** Read `authoring.token`. Shell creates it. This does not invent a token. */
export async function readAuthoringToken(runtimeRoot: string): Promise<string> {
  const text = await readFile(hostAuthoringToken(runtimeRoot), 'utf8').catch(() => '')
  const token = text.trim()
  if (token === '') throw new AuthorError('authoring-token', 'authoring token is missing')
  return token
}

/**
 * Create the authoring token when the file is absent.
 * A present file is left as it is, including an empty one.
 * POSIX mode bits are not a Windows access lock.
 */
export function ensureAuthoringToken(runtimeRoot: string): void {
  const file = hostAuthoringToken(runtimeRoot)
  try {
    const handle = openSync(file, 'wx', 0o600)
    try {
      writeSync(handle, randomBytes(32).toString('hex'))
    } finally {
      closeSync(handle)
    }
  } catch (error) {
    if (!isAlreadyThere(error)) throw error
  }
}

function isAlreadyThere(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

async function invoke(
  options: {
    registry: Registry
    mcp: McpClient
    /** Servers boot left out because a reference names nothing. The author list reports them. */
    readMcpFailures?: () => readonly McpLoadFailure[]
    recordMcpFailures?: (failures: readonly McpLoadFailure[]) => void
    env?: NodeJS.ProcessEnv
    ports: AuthorCallPorts
    onTreeChanged?: (appId: string) => void
    hostEvents: ReturnType<typeof createHostEvents>
    appEvents: AppEvents
    errors: ReturnType<typeof createErrorRing>
    views: ReturnType<typeof createViewQueries>
    runNpm?: NpmRun
    installTimeoutMs?: number
    storageNoticeBytes?: number
  },
  live: Map<string, LiveApp>,
  name: string,
  args: unknown,
): Promise<unknown> {
  if (!isAuthorTool(name)) {
    throw new AuthorError('unknown-tool', `unknown tool: ${name}. Catalog: ${authorToolNames.join(', ')}`)
  }
  const input = name === 'mini_app_list' || name === 'mini_app_mcp_list' || name === 'mini_app_credential_list' ? {} : record(args)
  switch (name) {
    case 'mini_app_list':
      return options.registry.list()
    case 'mini_app_get':
      return options.registry.get(requiredString(input, 'appId'))
    case 'mini_app_list_files':
      return { files: await filesFor(options, requiredString(input, 'appId')).list() }
    case 'mini_app_read':
      return filesFor(options, requiredString(input, 'appId')).read(
        requiredString(input, 'path'),
        windowOf(input),
        input.numbered === true,
      )
    case 'mini_app_edit':
      return filesFor(options, requiredString(input, 'appId')).edit(
        requiredString(input, 'path'),
        editsOf(input),
        input.commit !== false,
      )
    case 'mini_app_write':
      return filesFor(options, requiredString(input, 'appId')).write(
        requiredString(input, 'path'),
        requiredString(input, 'content'),
        input.commit !== false,
      )
    case 'mini_app_delete':
      return filesFor(options, requiredString(input, 'appId')).delete(
        requiredString(input, 'path'),
        input.commit !== false,
      )
    case 'mini_app_register': {
      const registered = await options.registry.register(requiredString(input, 'appId'), registerManifest(input))
      return { ...registered, needed: neededFiles(registered.directory) }
    }
    case 'mini_app_reload':
      return reload(options, live, requiredString(input, 'appId'), optionalCleanCaches(input.cleanCaches))
    case 'mini_app_call':
      return callApp(options, live, input)
    case 'mini_app_mcp_list':
      return listMcpForAuthor(options.mcp, options.readMcpFailures?.() ?? [])
    case 'mini_app_mcp_tools':
      return toolsMcpForAuthor(options.mcp, requiredString(input, 'serverId'), optionalString(input, 'toolName'), options.readMcpFailures?.() ?? [])
    case 'mini_app_mcp_add':
      return addMcpServer(options, input)
    case 'mini_app_mcp_remove':
      return removeMcpServer(options, input)
    case 'mini_app_credential_list':
      return { credentials: await options.ports.credentials.list() }
    case 'mini_app_history_commit':
      return historyCommit(options, requiredString(input, 'appId'), requiredString(input, 'message'))
    case 'mini_app_history_list':
      return historyList(options, requiredString(input, 'appId'), optionalLimit(input.limit))
    case 'mini_app_history_reset':
      return historyReset(options, requiredString(input, 'appId'), requiredString(input, 'commitId'))
    case 'mini_app_open':
      return openApp(options, requiredString(input, 'appId'), optionalString(input, 'title'))
    case 'mini_app_errors':
      return readErrors(options, requiredString(input, 'appId'), optionalSince(input.since), optionalClear(input.clear))
    case 'mini_app_install':
      return installPackages(options, requiredString(input, 'appId'), installRequest(input), input.commit !== false)
    case 'mini_app_view_eval':
      return evalView(options, requiredString(input, 'appId'), input)
    default:
      return name satisfies never
  }
}

function filesFor(
  options: { registry: Registry; onTreeChanged?: (appId: string) => void },
  appId: string,
) {
  const tools = async () => {
    const app = await options.registry.get(appId)
    return createFileTools(app.directory, {
      commit: message => trackedCommit(app.directory, app.id, message, options.onTreeChanged),
      protectedPath: file => file === installLayout.manifest || file === installLayout.lockfile,
    })
  }
  return {
    list: async () => (await tools()).list(),
    read: async (relative: string, window?: { start?: number; end?: number }, numbered?: boolean) =>
      (await tools()).read(relative, window, numbered),
    edit: async (relative: string, edits: Array<{ oldText: string; newText: string }>, commit: boolean) => {
      return (await tools()).edit(relative, edits, commit)
    },
    write: async (relative: string, content: string, commit: boolean) => {
      return (await tools()).write(relative, content, commit)
    },
    delete: async (relative: string, commit: boolean) => {
      return (await tools()).delete(relative, commit)
    },
  }
}

async function trackedCommit(
  appDir: string,
  appId: string,
  message: string,
  onTreeChanged: ((appId: string) => void) | undefined,
): Promise<FileCommit> {
  try {
    const result = await commitApp(appDir, message)
    if (result.status === 'committed') onTreeChanged?.(appId)
    return result
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'commit failed' }
  }
}

async function historyCommit(
  options: { registry: Registry; onTreeChanged?: (appId: string) => void },
  appId: string,
  message: string,
) {
  const app = await options.registry.get(appId)
  const result = await commitApp(app.directory, message)
  if (result.status === 'committed') options.onTreeChanged?.(app.id)
  return result
}

async function historyList(
  options: { registry: Registry },
  appId: string,
  limit: number | undefined,
) {
  const app = await options.registry.get(appId)
  return limit === undefined ? listHistory(app.directory) : listHistory(app.directory, limit)
}

async function historyReset(
  options: {
    registry: Registry
    onTreeChanged?: (appId: string) => void
    hostEvents: ReturnType<typeof createHostEvents>
  },
  appId: string,
  commitId: string,
) {
  const app = await options.registry.get(appId)
  const result = await resetApp(app.directory, commitId)
  if (result.changed) {
    options.onTreeChanged?.(app.id)
    options.hostEvents.publish({ type: 'app:reload', appId: app.id })
  }
  return result
}

async function openApp(
  options: {
    registry: Registry
    hostEvents: ReturnType<typeof createHostEvents>
    errors: ReturnType<typeof createErrorRing>
    now?: () => string
  },
  appId: string,
  title: string | undefined,
) {
  const app = await options.registry.get(appId)
  recordOpen(options.registry.runtimeRoot, app.id, (options.now ?? (() => new Date().toISOString()))())
  options.errors.markOpened(app.id)
  options.hostEvents.publish({
    type: 'app:open',
    appId: app.id,
    ...title === undefined ? {} : { title },
  })
  return { panel: options.hostEvents.connected ? 'notified' : 'no-panel-connected' }
}

async function readErrors(
  options: { registry: Registry; errors: ReturnType<typeof createErrorRing> },
  appId: string,
  since: number | undefined,
  clear: boolean,
) {
  const app = await options.registry.get(appId)
  return since === undefined ? options.errors.read(app.id, undefined, clear) : options.errors.read(app.id, since, clear)
}

async function evalView(
  options: {
    registry: Registry
    hostEvents: ReturnType<typeof createHostEvents>
    views: ReturnType<typeof createViewQueries>
  },
  appId: string,
  args: Record<string, unknown>,
) {
  const app = await options.registry.get(appId)
  const timeoutMs = optionalBudget(args.timeoutMs, 'timeoutMs')
  const maxBytes = optionalBudget(args.maxBytes, 'maxBytes')
  const code = args.code
  if (code !== undefined && typeof code !== 'string') throw new AuthorError('tool-args', 'code must be text')
  return options.views.ask({
    appId: app.id,
    connected: options.hostEvents.connected,
    publish: (event) => {
      options.hostEvents.publish(event)
    },
    ...timeoutMs === undefined ? {} : { timeoutMs },
    ...maxBytes === undefined ? {} : { maxBytes },
    ...typeof code === 'string' && code.length > 0 ? { code } : {},
  })
}

function optionalBudget(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || value < 1) throw new AuthorError('tool-args', `${key} must be a positive number`)
  return value
}

async function installPackages(
  options: {
    registry: Registry
    onTreeChanged?: (appId: string) => void
    runNpm?: NpmRun
    installTimeoutMs?: number
  },
  appId: string,
  request: InstallRequest,
  commit: boolean,
) {
  const app = await options.registry.get(appId)
  try {
    const result = await installApp(app.directory, request, {
      ...options.runNpm === undefined ? {} : { run: options.runNpm },
      ...options.installTimeoutMs === undefined ? {} : { timeoutMs: options.installTimeoutMs },
    })
    if (result.ok && commit && (request.packages.length > 0 || request.remove.length > 0)) {
      await trackedCommit(app.directory, app.id, 'install dependencies', options.onTreeChanged)
    }
    return result
  } catch (error) {
    if (error instanceof InstallError) {
      return { ok: false, packages: {}, lockfile: null, code: error.code, message: error.message }
    }
    throw error
  }
}

function installRequest(args: Record<string, unknown>): InstallRequest {
  return {
    packages: packageSpecs(args.packages),
    remove: nameList(args.remove),
  }
}

function packageSpecs(value: unknown): InstallRequest['packages'] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new AuthorError('tool-args', 'packages must be a list')
  return value.map((item) => {
    const spec = record(item)
    const version = spec.version
    if (version !== undefined && typeof version !== 'string') throw new AuthorError('tool-args', 'version must be text')
    return {
      name: requiredString(spec, 'name'),
      ...typeof version === 'string' ? { version } : {},
    }
  })
}

function nameList(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new AuthorError('tool-args', 'remove must be a list')
  return value.map((item) => {
    if (typeof item !== 'string' || item.length === 0) throw new AuthorError('tool-args', 'remove names must be text')
    return item
  })
}

async function restoreAppStorage(
  options: { registry: Registry },
  live: Map<string, LiveApp>,
  appId: string,
) {
  const app = await options.registry.get(appId)
  live.get(app.id)?.storage.close()
  live.delete(app.id)
  restoreStorageBackup(app.directory)
}

async function removeApp(
  options: { registry: Registry; errors: ReturnType<typeof createErrorRing> },
  live: Map<string, LiveApp>,
  appId: string,
) {
  const app = await options.registry.get(appId)
  live.get(app.id)?.storage.close()
  live.delete(app.id)
  options.errors.forget(app.id)
  await options.registry.trash(app.id)
}

async function restoreDeleted(
  options: { registry: Registry },
  appId: string,
) {
  return options.registry.restoreTrashed(appId)
}

async function reload(
  options: {
    registry: Registry
    onTreeChanged?: (appId: string) => void
    hostEvents: ReturnType<typeof createHostEvents>
    errors: ReturnType<typeof createErrorRing>
    views: ReturnType<typeof createViewQueries>
    storageNoticeBytes?: number
    reservedKeyframes?: readonly string[]
  },
  live: Map<string, LiveApp>,
  appId: string,
  cleanCaches = true,
): Promise<{
  ok: boolean
  errors: Array<{ code: string; message: string }>
  notices: ReviewNotice[]
  compiled: { backend: boolean; ui: boolean }
  committed: FileCommit & { id?: string }
  caches: { appCss: 'dropped'; views: 'not-open' | 'refetch'; cleanCaches: boolean }
}> {
  let opened: StorageFile | undefined
  try {
    const app = await options.registry.get(appId)
    if (cleanCaches) await purgeAutogen(app.directory)
    opened = await openStorage(app.directory, storageNotice(options, app.id))
    const loaded = await loadBackend(app.directory)
    const review = await reviewApp(app.directory, {
      ...options.reservedKeyframes === undefined ? {} : { reservedKeyframes: options.reservedKeyframes },
    })
    if (review.errors.length > 0) {
      opened.close()
      return {
        ok: false,
        errors: review.errors,
        notices: review.notices,
        compiled: { backend: false, ui: false },
        committed: { status: 'skipped' },
        caches: { appCss: 'dropped', views: 'not-open', cleanCaches },
      }
    }
    await cachedUiBundle(app.directory)
    const previous = live.get(app.id)
    live.set(app.id, { api: loaded.api, storage: opened, directory: app.directory })
    previous?.storage.close()
    const committed = await commitApp(app.directory, reloadMessage).catch((error: unknown) => ({
      status: 'failed' as const,
      reason: error instanceof Error ? error.message : 'commit failed',
    }))
    if (committed.status === 'committed') options.onTreeChanged?.(app.id)
    options.errors.clearReload(app.id)
    options.views.forgetAlive(app.id)
    const views = options.hostEvents.connected ? 'refetch' as const : 'not-open' as const
    options.hostEvents.publish({ type: 'app:reload', appId: app.id })
    return {
      ok: committed.status !== 'failed',
      errors: committed.status === 'failed' ? [{ code: 'commit-failed', message: committed.reason ?? 'commit failed' }] : [],
      notices: review.notices,
      compiled: { backend: true, ui: true },
      committed,
      caches: { appCss: 'dropped', views, cleanCaches },
    }
  } catch (error) {
    opened?.close()
    return {
      ok: false,
      errors: [errorOf(error)],
      notices: [],
      compiled: { backend: false, ui: false },
      committed: { status: 'skipped' },
      caches: { appCss: 'dropped', views: 'not-open', cleanCaches },
    }
  }
}

async function callApp(
  options: {
    registry: Registry
    mcp: McpClient
    ports: AuthorCallPorts
    appEvents: AppEvents
    hostEvents: ReturnType<typeof createHostEvents>
    storageNoticeBytes?: number
  },
  live: Map<string, LiveApp>,
  input: Record<string, unknown>,
): Promise<unknown> {
  const appId = requiredString(input, 'appId')
  const batch = input.calls
  if (batch !== undefined) {
    if (!Array.isArray(batch) || batch.length === 0) throw new AuthorError('tool-args', 'calls must be a non-empty list')
    if (batch.length > CALL_BATCH_MAX) throw new AuthorError('call-batch', `calls exceed ${CALL_BATCH_MAX}`)
    const results = []
    for (const entry of batch) {
      const item = record(entry)
      results.push(await oneCall(options, live, appId, requiredString(item, 'method'), item.args))
    }
    return { results }
  }
  return oneCall(options, live, appId, requiredString(input, 'method'), input.args)
}

async function oneCall(
  options: {
    registry: Registry
    mcp: McpClient
    ports: AuthorCallPorts
    appEvents: AppEvents
    hostEvents: ReturnType<typeof createHostEvents>
    storageNoticeBytes?: number
  },
  live: Map<string, LiveApp>,
  appId: string,
  method: string,
  args: unknown,
  publish?: (value: unknown) => Promise<void> | void,
): Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }> {
  try {
    const app = await ensureLive(options, live, appId)
    const brain = await bindBrain({
      provider: options.ports.provider,
      appDir: app.directory,
      processDirectory: options.ports.processDirectory,
      createTemp: options.ports.createTemp,
      push: (name, params) => {
        options.appEvents.push(app.id, name, params)
      },
    })
    try {
      const value = await runCall(capabilitiesFor(options, app, brain), app.api, method, args, publish)
      return { ok: true, value }
    } finally {
      await brain.stop()
    }
  } catch (error) {
    return { ok: false, error: errorOf(error) }
  }
}

function storageNotice(
  options: { hostEvents: ReturnType<typeof createHostEvents>; storageNoticeBytes?: number },
  appId: string,
): { noticeBytes: number; onNotice: (notice: { table: string; keys: string[] }) => void } {
  return {
    noticeBytes: options.storageNoticeBytes ?? DEFAULT_STORAGE_NOTICE_BYTES,
    onNotice: (notice) => {
      options.hostEvents.publish({ type: 'storage-size', appId, table: notice.table, keys: notice.keys })
    },
  }
}

async function ensureLive(
  options: { registry: Registry; hostEvents: ReturnType<typeof createHostEvents>; storageNoticeBytes?: number },
  live: Map<string, LiveApp>,
  appId: string,
): Promise<LiveApp & { id: AppId }> {
  const summary = await options.registry.get(appId)
  const cached = live.get(summary.id)
  if (cached !== undefined && cached.directory === summary.directory) return { ...withKind(cached, summary.kind), id: summary.id }
  const storage = await openStorage(summary.directory, storageNotice(options, summary.id))
  try {
    const loaded = await loadBackend(summary.directory)
    const next = withKind({ api: loaded.api, storage, directory: summary.directory }, summary.kind)
    live.set(summary.id, next)
    return { ...next, id: summary.id }
  } catch (error) {
    storage.close()
    throw error
  }
}

function capabilitiesFor(
  options: { mcp: McpClient; ports: AuthorCallPorts; appEvents: AppEvents },
  app: LiveApp & { id: AppId },
  brain: CallCapabilities['brain'],
): CallCapabilities {
  const ports = options.ports
  return {
    appId: app.id,
    appDir: app.directory,
    state: {},
    storage: app.storage.connect(),
    credentials: ports.credentials,
    config: ports.config,
    log: (...args) => { ports.log(app.id, ...args) },
    push: (name, params) => {
      options.appEvents.push(app.id, name, params)
    },
    http: ports.http,
    bash: ports.bash,
    pwsh: ports.pwsh,
    metrics: ports.metrics,
    mcp: (serverId, toolName, args) => options.mcp.call(serverId, toolName, args ?? {}),
    brain,
    ...app.kind === 'workbench' && ports.workbench !== undefined ? { workbench: ports.workbench } : {},
  }
}

function withKind(app: LiveApp, kind: 'workbench' | undefined): LiveApp {
  if (kind === undefined) {
    const { kind: gone, ...rest } = app
    void gone
    return rest
  }
  return { ...app, kind }
}

function errorOf(error: unknown): { code: string; message: string } {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'unknown-tool'
  const message = error instanceof Error ? error.message : 'tool failed'
  return { code, message }
}

function isAuthorTool(name: string): name is AuthorToolName {
  return (authorToolNames as readonly string[]).includes(name)
}

export function isAuthorMcpTool(name: string): boolean {
  return isAuthorTool(name) && !(authorByteToolNames as readonly string[]).includes(name)
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AuthorError('tool-args', 'tool arguments must be an object')
  }
  return value as Record<string, unknown>
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new AuthorError('tool-args', `${key} is required`)
  return value
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new AuthorError('tool-args', `${key} must be text`)
  return value
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || value < 1) throw new AuthorError('tool-args', 'limit must be a positive number')
  return value
}

function optionalSince(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || value < 0) throw new AuthorError('tool-args', 'since must be a non-negative number')
  return value
}

function optionalClear(value: unknown): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new AuthorError('tool-args', 'clear must be a boolean')
  return value
}

/** Default true. No cache directory is named, so the flag is recorded and nothing is removed. */
function optionalCleanCaches(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'boolean') throw new AuthorError('tool-args', 'cleanCaches must be a boolean')
  return value
}

/**
 * Add or replace one MCP server: check it by opening it, write the row, and hand the live client
 * the set it just wrote, so the server is usable without a restart. A failed check leaves both the
 * file and the client alone unless `force` is true.
 */
async function addMcpServer(
  options: {
    registry: Registry
    mcp: McpClient
    env?: NodeJS.ProcessEnv
    ports: AuthorCallPorts
    recordMcpFailures?: (failures: readonly McpLoadFailure[]) => void
  },
  input: Record<string, unknown>,
) {
  const env = options.env ?? process.env
  const root = options.registry.runtimeRoot
  const server = mcpServerRow(input)
  const sources = mcpReferenceSources(env, options.ports.credentials)
  const check = input.check === false ? undefined : await checkMcpEditor(server, env, sources)
  // The write input is the file itself. The masked rows are for the answer, and writing those back
  // would replace every other server's secret with its own mask.
  const file = await readMcpEditor(root, env)
  if (check !== undefined && !check.ok && input.force !== true) {
    return { added: false, id: server.id, check, servers: maskEditorServers(file) }
  }
  const resolved = await writeMcpEditor(root, [...file.filter(row => row.id !== server.id), server], env, sources)
  await options.mcp.setServers(resolved.servers)
  options.recordMcpFailures?.(resolved.failures)
  return {
    added: true,
    id: server.id,
    ...check === undefined ? {} : { check },
    servers: await readMcpEditor(root, env, true),
  }
}

/** Remove one MCP server by id, live. An unknown id changes nothing. */
async function removeMcpServer(
  options: {
    registry: Registry
    mcp: McpClient
    env?: NodeJS.ProcessEnv
    ports: AuthorCallPorts
    recordMcpFailures?: (failures: readonly McpLoadFailure[]) => void
  },
  input: Record<string, unknown>,
) {
  const env = options.env ?? process.env
  const root = options.registry.runtimeRoot
  const id = requiredString(input, 'id')
  const sources = mcpReferenceSources(env, options.ports.credentials)
  const file = await readMcpEditor(root, env)
  if (!file.some(row => row.id === id)) return { removed: false, id, servers: maskEditorServers(file) }
  const resolved = await writeMcpEditor(root, file.filter(row => row.id !== id), env, sources)
  await options.mcp.setServers(resolved.servers)
  options.recordMcpFailures?.(resolved.failures)
  return { removed: true, id, servers: await readMcpEditor(root, env, true) }
}

function mcpServerRow(input: Record<string, unknown>): McpEditorServer {
  const id = requiredString(input, 'id')
  const command = optionalString(input, 'command')
  const url = optionalString(input, 'url')
  if (command === undefined && url === undefined) throw new AuthorError('tool-args', 'give command or url')
  const description = optionalString(input, 'description')
  const transport = mcpTransport(input.transport)
  const args = stringList(input.args, 'args')
  const env = stringMap(input.env, 'env')
  const headers = stringMap(input.headers, 'headers')
  return {
    id,
    ...description === undefined ? {} : { description },
    ...input.enabled === false ? { enabled: false } : {},
    ...command === undefined ? {} : { command },
    ...args === undefined ? {} : { args },
    ...env === undefined ? {} : { env },
    ...url === undefined ? {} : { url },
    ...transport === undefined ? {} : { transport },
    ...headers === undefined ? {} : { headers },
  }
}

function mcpTransport(value: unknown): McpEditorServer['transport'] {
  if (value === undefined) return undefined
  if (value !== 'sse' && value !== 'streamable-http') throw new AuthorError('tool-args', 'transport must be sse or streamable-http')
  return value
}

function stringList(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new AuthorError('tool-args', `${key} must be an array of text`)
  }
  return value as string[]
}

function stringMap(value: unknown, key: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AuthorError('tool-args', `${key} must be an object of text`)
  }
  const out: Record<string, string> = {}
  for (const [name, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new AuthorError('tool-args', `${key}.${name} must be text`)
    out[name] = item
  }
  return out
}

function windowOf(args: Record<string, unknown>): { start?: number; end?: number } | undefined {
  const start = args.start
  const end = args.end
  if (start === undefined && end === undefined) return undefined
  return {
    ...typeof start === 'number' ? { start } : {},
    ...typeof end === 'number' ? { end } : {},
  }
}

function editsOf(args: Record<string, unknown>): Array<{ oldText: string; newText: string }> {
  const edits = args.edits
  if (!Array.isArray(edits) || edits.length === 0) throw new AuthorError('tool-args', 'edits are required')
  return edits.map((edit) => {
    const item = record(edit)
    return { oldText: requiredString(item, 'oldText'), newText: typeof item.newText === 'string' ? item.newText : '' }
  })
}

function registerManifest(input: Record<string, unknown>): Record<string, string> {
  if ('files' in input) throw new AuthorError('tool-args', 'files is not a register argument')
  const appId = requiredString(input, 'appId')
  const raw: Record<string, unknown> = {
    id: appId,
    name: requiredString(input, 'name'),
    description: requiredString(input, 'description'),
    version: requiredString(input, 'version'),
    entry: appEntries.ui,
  }
  if (input.acronym !== undefined) raw.acronym = input.acronym
  if (input.tags !== undefined) raw.tags = input.tags
  if (input.kind !== undefined) raw.kind = input.kind
  const admitted = resolveManifest(raw, appId)
  const body: Record<string, unknown> = {
    id: admitted.id,
    name: admitted.name,
    description: admitted.description,
    version: admitted.version,
    entry: admitted.entry,
  }
  if (admitted.acronym !== undefined) body.acronym = admitted.acronym
  if (admitted.tags !== undefined) body.tags = admitted.tags
  if (admitted.kind !== undefined) body.kind = admitted.kind
  return { [appEntries.manifest]: `${JSON.stringify(body, null, 2)}
` }
}

function neededFiles(directory: string): readonly string[] {
  return [path.join(directory, appEntries.ui), path.join(directory, appEntries.backend)]
}
