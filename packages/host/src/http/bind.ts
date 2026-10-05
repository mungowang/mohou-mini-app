import type { McpClient } from '@mohou/mcp-client'
import type { RuntimeProvider } from '@mohou/runtime-provider'

import type { CredentialProvider } from '../credentials/provider.ts'

import { listedApp, type AppSummary } from '../apps/registry.ts'
import { readActivity } from '../host/activity.ts'
import { historyBounds } from '../history/store.ts'
import { cachedUiBundle } from '../compile/autogen.ts'
import { forwardFrames } from '../events/app-events.ts'
import { compileAppStylesheet } from '../compile/sheet.ts'
import { readAppAsset } from './asset.ts'
import { httpLayout } from './layout.ts'
import { readVendorFile } from './ports.ts'
import type { LoopbackPorts } from './ports.ts'
import { authoringTokenMatches } from './guard.ts'
import { probeBrain, type HostPolicy } from '../host/config.ts'
import { checkPackageUpdate, discardUpdateResult, readUpdateResult, readUpdateSource, stagePackageUpdate, updateEnv } from './updates.ts'
import { McpError } from '@mohou/mcp-client'

import { admitMcpText } from '../host/mcp-import.ts'
import { CredentialError } from '../credentials/codes.ts'
import { mcpReferenceSources, type McpLoadFailure } from '../host/mcp.ts'
import { checkMcpEditor, readMcpEditor, readMcpImport, writeMcpEditor } from '../host/mcp-editor.ts'
import { readAuthorMcp, revealAuthorMcp, writeAuthorMcp, type AuthorMcpLayout } from '../host/author-mcp.ts'
import { readAuthorSkill, revealAuthorSkill, writeAuthorSkill, type AuthorSkillLayout } from '../host/author-skill.ts'
import type { createAuthorTools } from '../tools/author.ts'
import type { createOwnerReads } from '../owner/read.ts'
import type { createThemePins } from '../theme/pin.ts'

type Author = ReturnType<typeof createAuthorTools>

interface OwnerSlice {
  reloadView: (appId: string) => Promise<void>
  runnerDocument: (appId: string) => Promise<string>
  readHistory: ReturnType<typeof createOwnerReads>['readHistory']
  readCommit: ReturnType<typeof createOwnerReads>['readCommit']
  readStorage: ReturnType<typeof createOwnerReads>['readStorage']
  readTable: ReturnType<typeof createOwnerReads>['readTable']
  themes: ReturnType<typeof createThemePins>
}

interface RegistrySlice {
  get: (appId: string) => Promise<AppSummary>
  list: () => Promise<{ apps: AppSummary[] }>
  listTrash: () => Promise<AppSummary[]>
}

/**
 * Project the live session onto the loopback routes. Does not open a socket.
 * @param input - the session pieces the routes call
 */
export function bindLoopback(input: {
  readonly author: Author
  readonly owner: OwnerSlice
  readonly registry: RegistrySlice
  /** Live MCP sessions. A written server file is handed to this client, so it takes effect now. */
  readonly mcp: McpClient
  readonly policy: () => HostPolicy
  readonly writePolicy: (raw: unknown) => Promise<{ policy: HostPolicy; restartRequired: boolean }>
  readonly probe: (id: string) => ReturnType<typeof probeBrain>
  readonly providers: readonly RuntimeProvider[]
  readonly token: string
  readonly vendorDir: string
  readonly runtimeRoot: string
  readonly env: NodeJS.ProcessEnv
  /** The read port Shell injected. Only names and descriptions reach the panel surface. */
  readonly credentials: CredentialProvider
  /** Servers the live client left out: boot's list, replaced by every write. */
  readonly mcpFailures: () => readonly McpLoadFailure[]
  readonly recordMcpFailures: (failures: readonly McpLoadFailure[]) => void
  readonly mcpImports?: Readonly<Record<string, string>>
  readonly panel?: LoopbackPorts['panel']
  readonly restart?: () => Promise<void>
  readonly authorSkill?: AuthorSkillLayout
  readonly authorMcp?: AuthorMcpLayout
}): LoopbackPorts {
  const skill = input.authorSkill
  const mcpAgents = input.authorMcp
  const authoringLive = (description: string) => ({
    url: `http://127.0.0.1:${input.policy().hostPort}${httpLayout.mcp}`,
    token: input.token,
    description,
  })
  return {
    list: async () => {
      const listed = await input.registry.list()
      const activity = readActivity(input.runtimeRoot)
      return Promise.all(listed.apps.map(async app => ({
        ...listedApp(app, await historyBounds(app.directory), activity.apps[app.id]),
        pin: await input.owner.themes.readPin(app.id),
        appFile: await input.owner.themes.appFile(app.id),
      })))
    },
    listTrash: async () => {
      const trashed = await input.registry.listTrash()
      const activity = readActivity(input.runtimeRoot)
      return Promise.all(trashed.map(async app => listedApp(app, await historyBounds(app.directory), activity.apps[app.id])))
    },
    deleteApp: appId => input.author.deleteApp(appId),
    undeleteApp: appId => input.author.undeleteApp(appId),
    open: (appId, title) => input.author.invoke('mini_app_open', {
      appId,
      ...title === undefined ? {} : { title },
    }),
    reload: appId => input.owner.reloadView(appId),
    call: (appId, method, args, observe) => {
      if (observe !== undefined) return input.author.callObserved(appId, method, args, observe)
      return input.author.invoke('mini_app_call', {
        appId,
        method,
        ...args === undefined ? {} : { args },
      })
    },
    readPolicy: () => input.policy(),
    writePolicy: raw => input.writePolicy(raw),
    probe: id => input.probe(id),
    providers: input.providers,
    listPalettes: () => input.owner.themes.listPalettes(),
    readPin: appId => input.owner.themes.readPin(appId),
    setPin: (appId, pin) => input.owner.themes.setPin(appId, pin),
    appFile: appId => input.owner.themes.appFile(appId),
    readAppTheme: appId => input.owner.themes.readAppTheme(appId),
    readHistory: appId => input.owner.readHistory(appId),
    readCommit: (appId, commitId) => input.owner.readCommit(appId, commitId),
    readStorage: appId => input.owner.readStorage(appId),
    readTable: (appId, table) => input.owner.readTable(appId, table),
    runnerDocument: appId => input.owner.runnerDocument(appId),
    entryScript: async (appId) => {
      const app = await input.registry.get(appId)
      return cachedUiBundle(app.directory)
    },
    stylesheet: async (appId) => {
      const app = await input.registry.get(appId)
      return compileAppStylesheet(app.directory)
    },
    assetFile: async (appId, rest) => {
      const app = await input.registry.get(appId)
      return readAppAsset(app.directory, rest)
    },
    restoreStorage: appId => input.author.restoreStorage(appId),
    readErrors: appId => input.author.errors.read(appId),
    vendorFile: name => readVendorFile(input.vendorDir, name),
    ...input.panel === undefined ? {} : { panel: input.panel },
    authoringToken: input.token,
    authorized: header => authoringTokenMatches(input.token, bearer(header)),
    subscribeHost: listener => input.author.hostEvents.subscribe(listener),
    subscribeFrames: listener => forwardFrames(input.author.appEvents, listener),
    subscribeApp: (appId, since, listener) => input.author.appEvents.subscribe(appId, since, listener),
    updateSource: () => Promise.resolve(readUpdateSource(updateEnv(input.policy()))),
    checkUpdate: async () => {
      const attempt = readUpdateResult(input.runtimeRoot)
      return {
        ...await checkPackageUpdate(undefined, updateEnv(input.policy())),
        ...attempt === undefined ? {} : { lastAttempt: attempt },
      }
    },
    installUpdate: (version) => {
      stagePackageUpdate(version, updateEnv(input.policy()))
      if (input.restart === undefined) return Promise.resolve()
      const restart = input.restart
      setTimeout(() => {
        void restart()
      }, 200)
      return Promise.resolve()
    },
    ackUpdate: (at) => {
      discardUpdateResult(input.runtimeRoot, at)
      return Promise.resolve()
    },
    ...input.restart === undefined ? {} : { restart: input.restart },
    ...skill === undefined ? {} : {
      authorSkill: skill,
      readAuthorSkill: customDirs => readAuthorSkill(skill, customDirs ?? []),
      writeAuthorSkill: (agentIds, customDirs) => writeAuthorSkill(skill, agentIds, customDirs),
      revealAuthorSkill: dest => revealAuthorSkill(skill, dest),
    },
    ...mcpAgents === undefined ? {} : {
      authorMcp: mcpAgents,
      readAuthorMcp: () => readAuthorMcp(mcpAgents, authoringLive('')),
      writeAuthorMcp: (agentIds, description) => writeAuthorMcp(mcpAgents, agentIds, authoringLive(description)),
      revealAuthorMcp: dest => revealAuthorMcp(mcpAgents, dest),
    },
    readMcp: async () => {
      return { servers: await readMcpEditor(input.runtimeRoot, input.env), unresolved: input.mcpFailures() }
    },
    writeMcp: async (servers) => {
      const resolved = await writeMcpEditor(input.runtimeRoot, servers, input.env, mcpReferenceSources(input.env, input.credentials))
      await input.mcp.setServers(resolved.servers)
      input.recordMcpFailures(resolved.failures)
      return { unresolved: resolved.failures }
    },
    checkMcp: server => checkMcpEditor(server, input.env, mcpReferenceSources(input.env, input.credentials)),
    admitMcp: text => admitMcpText(text),
    importMcp: (source) => {
      const file = input.mcpImports?.[source]
      if (file === undefined) return Promise.reject(new McpError('config-invalid', `mcp import is unknown: ${source}`))
      return readMcpImport(file)
    },
    readCredentials: async () => ({ credentials: await input.credentials.list(), writable: input.credentials.writable }),
    putCredential: async (name, description, secret) => {
      // A blank field means "keep the stored secret". Host resolves it here: the panel never reads a
      // secret back, so it has no value to send, and the store stays a store with one write op.
      const keep = secret === undefined || secret.length === 0 ? await input.credentials.get(name) : secret
      if (keep === undefined || keep.length === 0) {
        throw new CredentialError('credential-invalid', `credential has no secret to keep: ${name}`)
      }
      await input.credentials.put(name, description, keep)
    },
    removeCredential: name => input.credentials.remove(name),
  }
}

function bearer(header: string | undefined): string | undefined {
  if (header === undefined || !header.startsWith('Bearer ')) return undefined
  const token = header.slice('Bearer '.length)
  return token.length === 0 ? undefined : token
}
