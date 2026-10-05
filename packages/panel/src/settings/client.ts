/** Public host policy the settings form can read. No secrets. */
export interface PanelPolicy {
  readonly theme: 'system' | 'light' | 'dark'
  readonly palette: string
  readonly locale: string
  readonly chatLanguage: string
  readonly hostPort: number
  readonly llm: { readonly provider: string; readonly model: string } | null
  readonly runtimeProvider: { readonly id: string }
  readonly defaultWorkbenchId?: string
  /** Registry for this product's own update check and install. Empty follows the packaged default. */
  readonly updateRegistry?: string
}

export interface PanelPolicyWrite {
  readonly policy: PanelPolicy
  readonly restartRequired: boolean
}

export interface PanelProbe {
  readonly healthy: boolean
  readonly code?: string
  readonly message?: string
}

/** Writing skill install status for one assistant or custom folder. */
export interface PanelSkillCopy {
  readonly dest: string
  readonly installed: boolean
  readonly version: string | null
  readonly updateAvailable: boolean
}

export interface PanelSkillAgent extends PanelSkillCopy {
  readonly id: string
  readonly label: string
  readonly skillsDir: string
  readonly homePresent: boolean
}

export interface PanelSkillStatus {
  readonly skillId: string
  readonly version: string | null
  readonly agents: readonly PanelSkillAgent[]
  readonly customs: readonly (PanelSkillCopy & { readonly dir: string })[]
}

/** Authoring MCP install status for one assistant. */
export interface PanelAuthorMcpAgent {
  readonly id: string
  readonly label: string
  readonly dest: string
  readonly homePresent: boolean
  readonly installed: boolean
  readonly updateAvailable: boolean
  readonly adapter?: string
}

export interface PanelAuthorMcpStatus {
  readonly agents: readonly PanelAuthorMcpAgent[]
}

/**
 * Where this install updates from. `none` is a source tree with no install prefix.
 * A registry names its host; a tarball channel names its drop folder.
 */
export type PanelUpdateSource =
  | { readonly channel: 'registry'; readonly registry: string }
  | { readonly channel: 'tarball'; readonly tarballDir: string }
  | { readonly channel: 'none' }

/** Owner about block, including the authoring MCP snippet. */
export interface PanelAbout {
  readonly name: string
  readonly current: string
  readonly platform: string
  /** Where an update would come from. */
  readonly source?: PanelUpdateSource
  readonly authoring: {
    readonly url: string
    readonly token: string
    readonly tools: readonly { readonly name: string; readonly description: string }[]
  }
}

/** Why an install did not finish. Closed: the panel owns the wording of each code. */
export const panelUpdateFailureCodes = ['timeout', 'exit', 'prepare', 'closed', 'leftover', 'verify', 'boot'] as const

export type PanelUpdateFailureCode = (typeof panelUpdateFailureCodes)[number]

/**
 * What the launcher recorded about the last install, in the runtime root.
 * `from` is the version that was running when the attempt started, and `at` is epoch milliseconds.
 */
export type PanelUpdateAttempt =
  | {
    readonly state: 'done'
    readonly from?: string
    readonly to?: string
    readonly at: number
  }
  | {
    readonly state: 'failed'
    readonly code: PanelUpdateFailureCode
    readonly from?: string
    readonly to?: string
    readonly rolledBack: boolean
    readonly exitCode?: number
    readonly log?: string
    readonly at: number
  }

/** One registry check. `latest` is missing when the registry did not answer. */
export interface PanelUpdateCheck {
  readonly name: string
  readonly current: string
  readonly latest: string | null
  readonly updateAvailable: boolean
  readonly channel?: 'registry' | 'tarball'
  readonly installable?: boolean
  /** The host an update would install from, when the prefix names one. */
  readonly registry?: string
  /** The folder a tarball update would install from. */
  readonly tarballDir?: string
  readonly error?: string
  /** The last install this machine recorded, when one is on disk. The panel shows it once. */
  readonly lastAttempt?: PanelUpdateAttempt
}

/** One registered brain and the vendor/model pairs it publishes. */
export interface PanelRuntime {
  readonly id: string
  readonly label?: string
  readonly models: readonly { readonly provider: string; readonly models: readonly string[] }[]
}

/** Settings calls. Absent means the settings entry is hidden. No route string lives here. */
export interface PanelSettingsClient {
  readPolicy(): Promise<PanelPolicy>
  writePolicy(policy: PanelPolicy): Promise<PanelPolicyWrite>
  probe(id: string): Promise<PanelProbe>
  readAbout?(): Promise<PanelAbout>
  checkUpdate?(): Promise<PanelUpdateCheck>
  installUpdate?(version: string): Promise<void>
  /** Tell Host the launcher's last attempt was shown, so the next check does not open it again. */
  ackUpdate?(at: number): Promise<void>
  restartHost?(): Promise<void>
  listRuntimes?(): Promise<readonly PanelRuntime[]>
  readSkill?(customDirs?: readonly string[]): Promise<PanelSkillStatus>
  installSkill?(agentIds: readonly string[], customDirs: readonly string[]): Promise<PanelSkillStatus>
  revealSkill?(dest: string): Promise<void>
  readAuthorMcp?(): Promise<PanelAuthorMcpStatus>
  installAuthorMcp?(agentIds: readonly string[], description: string): Promise<PanelAuthorMcpStatus>
  revealAuthorMcp?(dest: string): Promise<void>
  /** Names, descriptions, and whether the store accepts a write. A secret never crosses this. */
  readCredentials?(): Promise<PanelCredentials>
  /**
   * Save one account. An omitted secret keeps the one already stored, which is how the form edits a
   * description without the owner pasting a secret again. Host reads the stored value; the panel
   * never receives one.
   */
  putCredential?(name: string, description: string, secret?: string): Promise<void>
  removeCredential?(name: string): Promise<void>
  listMcp?(): Promise<PanelMcpList>
  writeMcp?(servers: readonly McpServerDraft[]): Promise<{ unresolved: readonly PanelMcpFailure[] }>
  checkMcp?(server: McpServerDraft): Promise<McpCheckResult>
  admitMcp?(text: string): Promise<readonly McpServerDraft[]>
  importMcp?(source: string): Promise<readonly McpServerDraft[]>
}

/** One stored account, as the editor lists it. No secret: values are write-only. */
export interface PanelCredential {
  readonly name: string
  readonly description: string
}

export interface PanelCredentials {
  readonly credentials: readonly PanelCredential[]
  /** False when the store is read-only, and then the form shows no write control. */
  readonly writable: boolean
}

/** One server the last boot left out, and why. */
export interface PanelMcpFailure {
  readonly id: string
  readonly code: string
  readonly message: string
}

export interface PanelMcpList {
  readonly servers: readonly McpServerDraft[]
  readonly unresolved: readonly PanelMcpFailure[]
}

/** One MCP server the settings section can edit. */
export interface McpServerDraft {
  readonly id: string
  readonly description?: string
  readonly enabled?: boolean
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly url?: string
  readonly transport?: 'sse' | 'streamable-http'
  readonly headers?: Readonly<Record<string, string>>
}

/** One tool a check listed, with the schemas the server declared. */
export interface McpToolRow {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: Record<string, unknown>
  readonly outputSchema?: Record<string, unknown>
}

/** Result of trying one server without saving. */
export interface McpCheckResult {
  readonly ok: boolean
  readonly tools: readonly McpToolRow[]
  readonly code?: string
  readonly message?: string
}
