import { mkdtempSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { builtinWorkbenchId } from '@mohou/contract'
import { McpClient } from '@mohou/mcp-client'
import type { RuntimeProvider } from '@mohou/runtime-provider'

import { createAppRegistry, listedApp, type ListedApp } from '../apps/registry.ts'
import { ensureRuntimeAppsLayout } from '../apps/startup-seed.ts'
import { readActivity } from './activity.ts'
import { historyBounds } from '../history/store.ts'
import { ensureVendorFiles, vendorOutputDir } from '../compile/build-vendor.ts'
import { renderRunnerDocument } from '../compile/runner.ts'
import { bindLoopback } from '../http/bind.ts'
import { appResource, httpLayout } from '../http/layout.ts'
import { createOwnerReads, reloadView } from '../owner/read.ts'
import { resolveFirstPaint } from '../theme/paint.ts'
import { createThemePins, type AppPin } from '../theme/pin.ts'
import { createBash } from '../bash/client.ts'
import { createHttp } from '../http/client.ts'
import { readMetrics } from '../metrics/read.ts'
import { createPwsh } from '../pwsh/client.ts'
import type { CommandPolicy } from '../shell/command.ts'
import { createAuthorTools, ensureAuthoringToken, readAuthoringToken } from '../tools/author.ts'
import { startAuthorHttp } from '../tools/http.ts'
import { emptyCredentials, type CredentialProvider } from '../credentials/provider.ts'
import type { AuthorMcpLayout } from './author-mcp.ts'
import type { AuthorSkillLayout } from './author-skill.ts'
import { ConfigError } from './codes.ts'
import { probeBrain, resolveHostConfig, writeHostPolicy, type HostPolicy, type HostSeed } from './config.ts'
import { allocateHostPort, PortInUseError } from './port.ts'
import { homeThemesDir, hostAppsDir, hostTrashDir } from './layout.ts'
import { createHostLog, type HostLog } from './log.ts'
import { loadMcpServers, mcpReferenceSources, type McpLoadFailure } from './mcp.ts'
import { createAppWorkbench } from './workbench.ts'

/** Command and HTTP bounds for a booted host. Not locked numbers. */
const commandPolicy: CommandPolicy = { timeoutMs: 30_000, maxOutputBytes: 1_000_000 }
const httpPolicy = {
  timeoutMs: { min: 1, max: 60_000, default: 10_000 },
  maxBodyBytes: 1_000_000,
}

export interface HostSession {
  readonly policy: HostPolicy
  readonly author: ReturnType<typeof createAuthorTools>
  readonly log: HostLog
  readonly owner: ReturnType<typeof createOwnerReads> & {
    reloadView(appId: string): Promise<void>
    runnerDocument(appId: string): Promise<string>
    themes: ReturnType<typeof createThemePins>
    readPolicy(): HostPolicy
    writePolicy(raw: unknown): Promise<{ policy: HostPolicy; restartRequired: boolean }>
    probe(id: string): ReturnType<typeof probeBrain>
    list(): Promise<ListedApp[]>
    open(appId: string, title?: string): Promise<unknown>
    deleteApp(appId: string): Promise<void>
    undeleteApp(appId: string): Promise<unknown>
    listTrash(): Promise<ListedApp[]>
    restoreStorage(appId: string): Promise<void>
  }
  bindFrame(post: (message: unknown) => void): () => void
  start(): Promise<{ port: number }>
  dispose(): Promise<void>
}

function brainConfig(policy: HostPolicy): NonNullable<HostPolicy['runtimeProvider']['config']> {
  const config = policy.runtimeProvider.config ?? {}
  if (policy.llm === null || config.provider !== undefined || config.model !== undefined) return config
  return { ...config, provider: policy.llm.provider, model: policy.llm.model }
}

/**
 * Boot a host without starting it. Create registers no child.
 * Start opens the authoring listener and the injected brain. A failed start leaves neither running.
 * @param options - runtime root, seed used only when `host.json` is missing, and the brain Shell selected
 */
export async function createHost(options: {
  readonly runtimeRoot: string
  readonly seed: HostSeed
  readonly provider: RuntimeProvider
  readonly providers?: readonly RuntimeProvider[]
  readonly credentials?: CredentialProvider
  readonly env?: NodeJS.ProcessEnv
  readonly themesDir?: string
  readonly panel?: { readonly html: string; readonly script: string }
  readonly mcpImports?: Readonly<Record<string, string>>
  readonly restart?: () => Promise<void>
  readonly authorSkill?: AuthorSkillLayout
  readonly authorMcp?: AuthorMcpLayout
  /** When false, skip copying skill startup samples (tests). Default true. */
  readonly seedStartup?: boolean
}): Promise<HostSession> {
  await mkdir(options.runtimeRoot, { recursive: true })
  ensureAuthoringToken(options.runtimeRoot)
  let policy = await resolveHostConfig(options.runtimeRoot, options.seed)
  if (options.seedStartup !== false) {
    await ensureRuntimeAppsLayout(options.runtimeRoot, options.authorSkill?.source)
  } else {
    await mkdir(hostAppsDir(options.runtimeRoot), { recursive: true })
    await mkdir(hostTrashDir(options.runtimeRoot), { recursive: true })
  }
  const providers = options.providers ?? [options.provider]
  const live = providers.find(item => item.id === policy.runtimeProvider.id)
  if (live === undefined) {
    throw new ConfigError('config-invalid', `runtime provider is not registered: ${policy.runtimeProvider.id}`)
  }
  const credentials = options.credentials ?? emptyCredentials()
  const mcpSources = mcpReferenceSources(options.env ?? process.env, credentials)
  const mcpLoaded = await loadMcpServers(options.runtimeRoot, options.env, mcpSources)
  const mcp = new McpClient(mcpLoaded.servers, options.env)
  // What the live client left out. Boot sets it, and every write replaces it, so the panel and the
  // author list never report a boot-time answer about a file that has changed since.
  let mcpFailures: readonly McpLoadFailure[] = mcpLoaded.failures
  const readMcpFailures = (): readonly McpLoadFailure[] => mcpFailures
  const recordMcpFailures = (failures: readonly McpLoadFailure[]): void => { mcpFailures = failures }
  const bash = createBash(commandPolicy)
  const pwsh = createPwsh(commandPolicy)
  const registry = createAppRegistry(options.runtimeRoot)
  const themesDir = options.themesDir ?? homeThemesDir(homedir())
  const log = createHostLog(options.runtimeRoot)
  const listOwnerApps = async () => {
    const listed = await registry.list()
    const activity = readActivity(registry.runtimeRoot)
    return Promise.all(listed.apps.map(async app => listedApp(app, await historyBounds(app.directory), activity.apps[app.id])))
  }
  const author = createAuthorTools({
    registry,
    mcp,
    readMcpFailures,
    recordMcpFailures,
    ...options.env === undefined ? {} : { env: options.env },
    onTreeChanged: (appId) => {
      author.hostEvents.publish({ type: 'app:reload', appId })
    },
    ports: {
      credentials,
      config: {
        get theme() { return policy.theme },
        get palette() { return policy.palette },
        get locale() { return policy.locale },
        get chatLanguage() { return policy.chatLanguage },
        get hostPort() { return policy.hostPort },
        get llm() { return policy.llm },
      },
      log: (appId, ...args) => {
        log.write(appId, ...args)
      },
      push() {},
      http: createHttp(httpPolicy),
      bash: command => bash.run(command),
      pwsh: command => pwsh.run(command),
      metrics: () => Promise.resolve(readMetrics()),
      processDirectory: process.cwd(),
      createTemp: () => mkdtempSync(join(tmpdir(), 'mma-')),
      provider: live,
      workbench: createAppWorkbench({
        listApps: () => listOwnerApps(),
        openApp: (appId, title) => author.invoke('mini_app_open', {
          appId,
          ...title === undefined ? {} : { title },
        }).then(() => undefined),
        readDefault: () => policy.defaultWorkbenchId,
        writeDefault: async (id) => {
          const { defaultWorkbenchId: _gone, ...rest } = policy
          void _gone
          const written = await writeHostPolicy(options.runtimeRoot, policy, id === undefined ? rest : { ...rest, defaultWorkbenchId: id })
          policy = written.policy
          author.hostEvents.publish({ type: 'workbench:default', appId: id ?? builtinWorkbenchId })
        },
        locale: () => policy.locale,
      }),
    },
  })
  const themes = createThemePins(registry, themesDir)
  const owner = {
    ...createOwnerReads(registry),
    themes,
    reloadView: (appId: string) => reloadView(registry, (event) => {
      author.hostEvents.publish(event)
    }, appId),
    runnerDocument: (appId: string) => runnerDocument(registry, themes, policy.palette, policy.theme, policy.locale, themesDir, appId),
  }
  let http: { port: number; close: () => Promise<void> } | undefined
  let started = false
  return {
    get policy() {
      return policy
    },
    author,
    log,
    owner: {
      ...owner,
      readPolicy: () => policy,
      writePolicy: async (raw: unknown) => {
        const written = await writeHostPolicy(options.runtimeRoot, policy, raw)
        policy = written.policy
        return written
      },
      probe: (id: string) => probeBrain(id, providers, live.id),
      deleteApp: (appId: string) => author.deleteApp(appId),
      undeleteApp: (appId: string) => author.undeleteApp(appId),
      listTrash: async () => {
        const trashed = await registry.listTrash()
        const activity = readActivity(registry.runtimeRoot)
        return Promise.all(trashed.map(async app => listedApp(app, await historyBounds(app.directory), activity.apps[app.id])))
      },
      restoreStorage: (appId: string) => author.restoreStorage(appId),
      list: () => listOwnerApps(),
      open: (appId: string, title?: string) => author.invoke('mini_app_open', {
        appId,
        ...title === undefined ? {} : { title },
      }),
    },
    bindFrame(post) {
      for (const row of author.appEvents.retained()) {
        if (row.gap !== undefined) post({ type: 'app:gap', appId: row.appId, since: row.gap.since })
        for (const event of row.events) post({ appId: row.appId, name: event.name, data: event.data, seq: event.seq })
      }
      const stopHost = author.hostEvents.subscribe((event) => {
        if (event.type === 'app:reload' || event.type === 'app:eval') post(event)
      })
      const stopAuthor = author.appEvents.observe((appId, event) => {
        post({ appId, name: event.name, data: event.data, seq: event.seq })
      })
      return () => {
        stopHost()
        stopAuthor()
      }
    },
    async start() {
      if (http !== undefined) return { port: http.port }
      live.configure?.(brainConfig(policy))
      const preferred = policy.hostPort
      try {
        await live.start()
        started = true
        const token = await readAuthoringToken(options.runtimeRoot)
        const vendorDir = vendorOutputDir()
        await ensureVendorFiles(vendorDir)
        http = await startAuthorHttp({
          author,
          token,
          port: preferred,
          diagnostics: {
            recordError: (appId, raw) => {
              author.errors.record(appId, raw)
            },
            markAlive: (appId) => {
              author.views.markAlive(appId)
            },
            markAbsent: (appId) => {
              author.views.absent(appId)
            },
            answerView: (requestId, appId, raw) => {
              return author.views.answer(requestId, appId, raw)
            },
          },
          loopback: bindLoopback({
            author,
            owner,
            registry,
            mcp,
            policy: () => policy,
            writePolicy: async (raw) => {
              const written = await writeHostPolicy(options.runtimeRoot, policy, raw)
              policy = written.policy
              return written
            },
            probe: id => probeBrain(id, providers, live.id),
            providers,
            token,
            vendorDir,
            runtimeRoot: options.runtimeRoot,
            env: options.env ?? process.env,
            credentials,
            mcpFailures: readMcpFailures,
            recordMcpFailures,
            ...options.mcpImports === undefined ? {} : { mcpImports: options.mcpImports },
            ...options.restart === undefined ? {} : { restart: options.restart },
            ...options.authorSkill === undefined ? {} : { authorSkill: options.authorSkill },
            ...options.authorMcp === undefined ? {} : { authorMcp: options.authorMcp },
            ...options.panel === undefined ? {} : {
              panel: {
                html: options.panel.html,
                script: options.panel.script,
                paint: async () => {
                  const painted = await resolveFirstPaint({
                    appDir: options.runtimeRoot,
                    pin: { kind: 'follow-host' },
                    hostPalette: policy.palette,
                    themesDir,
                  })
                  return { style: painted.style, appearance: policy.theme }
                },
              },
            },
          }),
        })
      } catch (error) {
        if (started) await live.stop().catch(() => undefined)
        started = false
        http = undefined
        throw await listenError(error, preferred)
      }
      return { port: http.port }
    },
    async dispose() {
      const close = http?.close()
      http = undefined
      await close?.catch(() => undefined)
      await author.settle()
      if (started) await live.stop().catch(() => undefined)
      started = false
      await mcp.dispose()
      await bash.dispose()
      await pwsh.dispose()
      author.dispose()
    },
  }
}

async function runnerDocument(
  registry: { get: (appId: string) => Promise<{ id: string; directory: string }> },
  themes: { readPin: (appId: string) => Promise<AppPin> },
  hostPalette: string,
  appearance: 'system' | 'light' | 'dark',
  locale: string,
  themesDir: string,
  appId: string,
): Promise<string> {
  const app = await registry.get(appId)
  const paint = await resolveFirstPaint({
    appDir: app.directory,
    pin: await themes.readPin(app.id),
    hostPalette,
    themesDir,
  })
  return renderRunnerDocument({
    appId: app.id,
    entry: appResource(app.id, httpLayout.ui, httpLayout.entry),
    style: paint.style,
    appearance,
    locale,
  })
}

async function listenError(error: unknown, port: number): Promise<unknown> {
  if (!isCode(error, 'EADDRINUSE')) return error
  const suggestedPort = await allocateHostPort(port + 1)
  return new PortInUseError(port, suggestedPort)
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
