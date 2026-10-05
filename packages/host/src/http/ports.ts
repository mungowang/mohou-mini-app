import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import type { RuntimeProvider } from '@mohou/runtime-provider'

import type { AuthorMcpLayout, AuthorMcpStatus } from '../host/author-mcp.ts'
import type { AuthorSkillLayout, AuthorSkillStatus } from '../host/author-skill.ts'
import { probeBrain, type HostPolicy } from '../host/config.ts'
import type { CredentialListing } from '../credentials/provider.ts'
import type { McpCheck, McpEditorServer } from '../host/mcp-editor.ts'
import type { McpLoadFailure } from '../host/mcp.ts'
import type { AppPin } from '../theme/pin.ts'
import type { UpdateCheck } from './updates.ts'

const require = createRequire(import.meta.url)

export interface LoopbackApp {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly acronym: string
  readonly tags?: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly activity?: { readonly openCount: number; readonly lastOpenedAt: string }
}

/** Owner and iframe calls. Author routes do not use this bag. */
export interface LoopbackPorts {
  list(): Promise<ReadonlyArray<LoopbackApp & { pin: AppPin; appFile: boolean }>>
  listTrash(): Promise<readonly LoopbackApp[]>
  deleteApp(appId: string): Promise<void>
  undeleteApp(appId: string): Promise<unknown>
  open(appId: string, title?: string): Promise<unknown>
  reload(appId: string): Promise<void>
  call(appId: string, method: string, args: unknown, publish?: (value: unknown) => Promise<void> | void): Promise<unknown>
  readPolicy(): HostPolicy
  writePolicy(raw: unknown): Promise<{ policy: HostPolicy; restartRequired: boolean }>
  probe(id: string): ReturnType<typeof probeBrain>
  providers: readonly RuntimeProvider[]
  listPalettes(): Promise<unknown>
  readPin(appId: string): Promise<AppPin>
  setPin(appId: string, pin: AppPin): Promise<AppPin>
  appFile(appId: string): Promise<boolean>
  readAppTheme(appId: string): Promise<{ name?: string; nameZh?: string; swatch: string; style: string } | null>
  readHistory(appId: string): Promise<readonly unknown[]>
  readCommit(appId: string, commitId: string): Promise<unknown>
  readStorage(appId: string): Promise<unknown>
  readTable(appId: string, table: string): Promise<unknown>
  runnerDocument(appId: string): Promise<string>
  entryScript(appId: string): Promise<string>
  stylesheet(appId: string): Promise<string>
  assetFile(appId: string, rest: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }>
  restoreStorage(appId: string): Promise<void>
  readErrors(appId: string): unknown
  vendorFile(file: string): Promise<string>
  panel?: {
    readonly html: string
    readonly script: string
    readonly paint?: () => Promise<{ readonly style: string; readonly appearance: 'system' | 'light' | 'dark' }>
  }
  authoringToken: string
  authorized(header: string | undefined): boolean
  subscribeHost(listener: (event: unknown) => void): () => void
  subscribeFrames(listener: (event: unknown) => void): () => void
  subscribeApp(appId: string, since: number, listener: (event: unknown) => void): () => void
  checkUpdate(): Promise<UpdateCheck>
  installUpdate?(version: string): Promise<void>
  /** The panel showed the launcher's last attempt. The record is dropped, not shown twice. */
  ackUpdate?(at: number): Promise<void>
  restart?(): Promise<void>
  authorSkill?: AuthorSkillLayout
  readAuthorSkill?(customDirs?: readonly string[]): Promise<AuthorSkillStatus>
  writeAuthorSkill?(agentIds: readonly string[], customDirs: readonly string[]): Promise<AuthorSkillStatus>
  revealAuthorSkill?(dest: string): Promise<void>
  authorMcp?: AuthorMcpLayout
  readAuthorMcp?(): Promise<AuthorMcpStatus>
  writeAuthorMcp?(agentIds: readonly string[], description: string): Promise<AuthorMcpStatus>
  revealAuthorMcp?(dest: string): Promise<void>
  readMcp(): Promise<{ servers: readonly McpEditorServer[]; unresolved: readonly McpLoadFailure[] }>
  writeMcp(servers: readonly McpEditorServer[]): Promise<{ unresolved: readonly McpLoadFailure[] }>
  checkMcp(server: McpEditorServer): Promise<McpCheck>
  admitMcp(text: string): readonly McpEditorServer[]
  importMcp(source: string): Promise<readonly McpEditorServer[]>
  /** Names, descriptions, and whether the store accepts a write. A secret is never on this surface. */
  readCredentials(): Promise<{ credentials: readonly CredentialListing[]; writable: boolean }>
  /**
   * Write one account. An absent or empty secret keeps the stored one, so an owner can fix a
   * description without pasting a secret they may no longer hold. A name with no account and no
   * secret has nothing to keep: `credential-invalid`.
   */
  putCredential(name: string, description: string, secret: string | undefined): Promise<void>
  removeCredential(name: string): Promise<void>
}

export async function readVendorFile(dir: string, name: string): Promise<string> {
  return readFile(`${dir}/${name}`, 'utf8')
}

export function aboutInfo(): { name: string; current: string; platform: string; private: boolean } {
  const parsed = JSON.parse(readFileSync(require.resolve('@mohou/host/package.json'), 'utf8')) as {
    name?: unknown
    version?: unknown
    private?: unknown
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    current: typeof parsed.version === 'string' ? parsed.version : '',
    platform: process.platform,
    private: parsed.private === true,
  }
}
