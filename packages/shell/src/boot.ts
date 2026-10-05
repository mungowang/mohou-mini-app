import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createCredentials,
  createHost,
  defaultRuntimeRoot,
  homeCredentialsPath,
  isPortInUseError,
  writeHostPolicy,
  type CredentialProvider,
  type HostSession,
} from '@mohou/host'
import { registerPiRuntime } from '@mohou/runtime-pi'
import { createEchoProvider, createProviderRegistry } from '@mohou/runtime-provider'

import { builtinMcpAgents } from './mcp-agents.ts'
import { resolvePortConflict, type PortConflictMode } from './port-conflict.ts'
import { hostRestartExitCode } from './restart-code.ts'
import { builtinSkillAgents } from './skill-agents.ts'
import { openPanelWindow, type WindowSpawn } from './window.ts'

/** Seed used only when `host.json` is missing. Not a locked product value. */
export const shellSeed = {
  hostPort: 9743,
  theme: 'system' as const,
  palette: 'default',
  locale: 'en',
}

/**
 * Construct and start one Host. A failure leaves nothing running.
 * When an existing `hostPort` is busy, prompt (or auto-decide) before rewriting the file.
 * @param options - root, port override, credentials, panel document, and optional window spawn
 */
export async function bootHost(options: {
  readonly runtimeRoot?: string
  readonly hostPort?: number
  readonly home?: string
  readonly credentials?: CredentialProvider
  readonly panel?: { readonly html: string; readonly script: string }
  readonly openWindow?: boolean
  readonly windowSpawn?: WindowSpawn
  /** How to handle a busy saved port. Default `prompt` opens a confirm page. */
  readonly portConflict?: PortConflictMode
  /** When false, skip skill startup samples. Default true. */
  readonly seedStartup?: boolean
  /**
   * Replace process-exit restart (tests). Production leaves this unset so the
   * sidecar exits with `hostRestartExitCode` and the wrapper relaunches it.
   */
  readonly processRestart?: () => Promise<void>
} = {}): Promise<HostSession> {
  const home = options.home ?? homedir()
  const runtimeRoot = options.runtimeRoot ?? defaultRuntimeRoot(home)
  const echo = createEchoProvider()
  const registry = createProviderRegistry()
  registry.register(echo)
  registerPiRuntime(registry)
  const providers = registry.ids().map(id => registry.get(id))
  const open = () => createHost({
    runtimeRoot,
    seed: { ...shellSeed, ...options.hostPort === undefined ? {} : { hostPort: options.hostPort } },
    provider: echo,
    providers,
    ...options.seedStartup === undefined ? {} : { seedStartup: options.seedStartup },
    credentials: options.credentials ?? createCredentials([
      { kind: 'builtin-json', file: homeCredentialsPath(home) },
    ]),
    ...options.panel === undefined ? {} : { panel: options.panel },
    mcpImports: Object.fromEntries(builtinMcpAgents(home).map(agent => [agent.id, agent.file])),
    authorSkill: {
      source: resolveAuthorSkillSource(),
      agents: builtinSkillAgents(home),
    },
    authorMcp: { agents: builtinMcpAgents(home) },
    restart: async () => {
      await host.dispose()
      // Sidecar process restart: wrapper (`run` / `dev:host`) relaunches Node.
      // The Tauri window can stay open and poll the same origin.
      if (options.processRestart !== undefined) {
        await options.processRestart()
        return
      }
      process.exit(hostRestartExitCode)
    },
  })
  let host = await open()
  try {
    host = await startHost(host, options, open)
  } catch (error) {
    await host.dispose().catch(() => undefined)
    throw error
  }
  return liveSession(() => host)
}

async function startHost(
  initial: HostSession,
  options: {
    readonly openWindow?: boolean
    readonly windowSpawn?: WindowSpawn
    readonly portConflict?: PortConflictMode
  },
  reopen?: () => Promise<HostSession>,
): Promise<HostSession> {
  let host = initial
  for (;;) {
    try {
      const started = await host.start()
      if (options.openWindow === true) {
        const origin = `http://127.0.0.1:${started.port}`
        if (options.windowSpawn === undefined) openPanelWindow(origin)
        else openPanelWindow(origin, options.windowSpawn)
      }
      return host
    } catch (error) {
      if (!isPortInUseError(error) || reopen === undefined) throw error
      const policy = host.policy
      await host.dispose()
      const supervised = process.env.MINI_APP_SUPERVISED === '1'
      const decision = await resolvePortConflict({
        busyPort: error.busyPort,
        suggestedPort: error.suggestedPort,
        locale: policy.locale,
        mode: options.portConflict ?? 'prompt',
        openWindow: supervised
          ? false
          : options.portConflict === 'prompt' || options.portConflict === undefined
            ? options.openWindow !== false
            : false,
        ...supervised ? { onReady: (origin: string) => { console.log(origin) } } : {},
        ...options.windowSpawn === undefined ? {} : { windowSpawn: options.windowSpawn },
      })
      if (decision.kind === 'quit') throw error
      await writeHostPolicy(policy.runtimeRoot, policy, { ...policy, hostPort: decision.port })
      host = await reopen()
    }
  }
}

/**
 * Skill source: packaged copy beside `@mohou/shell`, then monorepo `skills/` for dev.
 */
export function resolveAuthorSkillSource(fromFile = import.meta.url): string {
  const here = path.dirname(fileURLToPath(fromFile))
  const packaged = path.resolve(here, '../skill/mohou-mini-app')
  const monorepo = path.resolve(here, '../../../skills/mohou-mini-app')
  if (existsSync(path.join(packaged, 'SKILL.md'))) return packaged
  if (existsSync(path.join(monorepo, 'SKILL.md'))) return monorepo
  return packaged
}

/** Methods always call the session that is running now, including after restart. */
function liveSession(current: () => HostSession): HostSession {
  return {
    get policy() { return current().policy },
    get author() { return current().author },
    get log() { return current().log },
    get owner() { return current().owner },
    bindFrame: post => current().bindFrame(post),
    start: () => current().start(),
    dispose: () => current().dispose(),
  }
}
