import type { AppId } from './app-id.ts'
import type { AppSpawnHandle, AppSpawnOptions, WebsiteSessionApi } from './website.ts'
import type { AppWorkbench } from './workbench.ts'

import { agentEventType, llmEventType } from './event-type.ts'

/** A cell accepted by SQLite. */
export type SqlValue = null | number | string | bigint | Uint8Array

/** One result row. Column names are the keys. */
export interface SqlRow {
  [column: string]: SqlValue
}

/** Positional or named parameters. Named keys omit the sigil. */
export type SqlParams = readonly SqlValue[] | Record<string, SqlValue>

/** The host-owned `kv` table. `query` and `run` cannot see it. */
export interface AppKeyValueTable {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

/** One SQLite file. `kv()` is the key-value table. SQL is everything else. */
export interface AppStorage {
  kv(): AppKeyValueTable
  query(sql: string, params?: SqlParams): Promise<SqlRow[]>
  run(sql: string, params?: SqlParams): Promise<{ changes: number; lastInsertRowid: number | bigint }>
  transaction<T>(work: (tx: AppStorage) => Promise<T>): Promise<T>
}

/** `ctx.http` request. Object `body` is sent as JSON. */
export interface AppHttpRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  timeout?: number
  signal?: AbortSignal
}

/** `ctx.http` result. Never a platform `Response`. */
export interface AppHttpResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  text: string
  /** Parsed body when the content type contains json and parsing succeeds, otherwise null. */
  json: unknown
}

/** Options shared by `ctx.llm` and `ctx.agent`. Omitted limits use host policy. */
/** Image bytes the caller already holds. `data` is base64, with no `data:` prefix. */
export interface AppImageData {
  mimeType: string
  data: string
  path?: never
}

/** A file the host reads. `path` is an absolute path or a `file:` URI. */
export interface AppImageFile {
  path: string
  mimeType?: string
  data?: never
}

/** One image on `ctx.llm` or `ctx.agent`. Data or a path, not both, and not a web URL. */
export type AppImageInput = AppImageData | AppImageFile

export interface AppModelOptions {
  provider?: string
  model?: string
  system?: string
  schema?: unknown
  maxTokens?: number
  /** Attempts in total, including the first. */
  retryTimes?: number
  signal?: AbortSignal
  /** Inline bytes, or a file the host reads before the brain runs. */
  images?: AppImageInput[]
}

/** Why an agent turn ended. `kind` stays open so a provider can add a reason. */
export interface AppAgentTurnEndReason {
  kind: string
  error?: unknown
  reason?: unknown
}

/** Observation only. The `ctx.agent` return stays a string. */
export type AppAgentEvent =
  | { type: typeof agentEventType.status; status: 'running' | 'idle' }
  | { type: typeof agentEventType.textDelta; text: string }
  | { type: typeof agentEventType.tool; phase: 'start' | 'end'; name: string; args?: unknown; result?: unknown }
  | { type: typeof agentEventType.turn; phase: 'start'; turn: number }
  | { type: typeof agentEventType.turn; phase: 'end'; turn: number; reason?: AppAgentTurnEndReason }
  | { type: typeof agentEventType.error; message: string }
  | { type: typeof agentEventType.done; text: string }

/** Observation for `ctx.llm` when `stream` is true. The return stays a string. */
export type AppLlmEvent =
  | { type: typeof llmEventType.status; status: 'running' | 'idle' }
  | { type: typeof llmEventType.textDelta; text: string }
  | { type: typeof llmEventType.error; message: string }
  | { type: typeof llmEventType.done; text: string }

/** `ctx.llm` options. `stream` defaults to false. */
export interface AppLlmOptions extends AppModelOptions {
  /** When true, the call returns a stream the method reads with `for await`. It does not reach the UI by itself. */
  stream?: boolean
}

/** `ctx.agent` options. `stream` defaults to false. */
export interface AppAgentOptions extends AppModelOptions {
  /** When true, the call returns a stream the method reads with `for await`. It does not reach the UI by itself. */
  stream?: boolean
  maxIterations?: number
  cwdType?: 'app' | 'process' | 'temp' | 'custom'
  cwd?: string
}

/** Public host policy visible to an app. No secrets. */
export interface AppConfig {
  theme: 'light' | 'dark' | 'system'
  palette: string
  locale: string
  chatLanguage: string
  hostPort: number
  llm: { provider: string; model: string } | null
}

/** One external MCP server for `ctx.mcpServers`. Names only: no descriptions, no schemas, no env. */
export interface AppMcpServer {
  readonly id: string
  readonly status: 'alive' | 'failed'
  /** Tool names. Set when the status is `alive`. */
  readonly tools?: readonly string[]
  /** Failure code, and the human message when there is one. Set when the status is `failed`. */
  readonly error?: { readonly code: string; readonly message?: string }
}

/** One tool on an external MCP server, for `ctx.mcpTools`. */
export interface AppMcpTool {
  readonly name: string
  readonly description?: string
  /** JSON Schema for the tool's arguments object. */
  readonly inputSchema: Record<string, unknown>
  /** JSON Schema for a structured result, when the server declares one. */
  readonly outputSchema?: Record<string, unknown>
}

/** One OS snapshot. `loadavg` is null where the OS does not provide it. */
export interface AppSystemMetrics {
  platform: string
  arch: string
  hostname: string
  uptimeSec: number
  loadavg: { '1m': number; '5m': number; '15m': number } | null
  memory: { total: number; free: number; used: number; usedRatio: number }
  cpu: { count: number; model: string; speedMHz: number }
  collectedAt: string
}

/** One secret, by the name the owner stored. Listing is not on this object. */
export interface AppCredentials {
  get(name: string): Promise<string | undefined>
}

/** First argument of every `api` method. `State` is the object the author declared. */
export interface AppContext<State extends object = Record<string, never>> {
  appId: AppId
  appDir: string
  storage: AppStorage
  state: State
  credentials: AppCredentials
  config: AppConfig
  log(...args: unknown[]): void
  signal?: AbortSignal
  push(name: string, params?: unknown): void
  http(url: string | AppHttpRequest, opts?: Omit<AppHttpRequest, 'url'>): Promise<AppHttpResponse>
  bash(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  pwsh(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  system: { metrics(): Promise<AppSystemMetrics> }
  llm(prompt: string, opts: AppLlmOptions & { stream: true }): AsyncIterable<AppLlmEvent> & Promise<string>
  llm(prompt: string, opts?: AppLlmOptions): Promise<string>
  agent(goal: string, opts: AppAgentOptions & { stream: true }): AsyncIterable<AppAgentEvent> & Promise<string>
  agent(goal: string, opts?: AppAgentOptions): Promise<string>
  mcp(serverId: string, toolName: string, args?: Record<string, unknown>): Promise<unknown>
  /** List the host's external MCP servers. Default is the alive ones; `includeAll` also returns the failed. */
  mcpServers(includeAll?: boolean): Promise<{ servers: readonly AppMcpServer[] }>
  /** One server's tools, with descriptions and schemas. Opens the server if needed. */
  mcpTools(serverId: string): Promise<{ tools: readonly AppMcpTool[] }>
  /** Present only when the manifest kind is `workbench`. */
  workbench?: AppWorkbench
  /**
   * Long-lived child owned by Host for this app session (view or ephemeral).
   * Tag is set by Host: `app` from api/notices, `website` from driver hooks.
   * Session end kills every spawn. Not a one-shot shell.
   */
  spawn(file: string, args?: readonly string[], options?: AppSpawnOptions): Promise<AppSpawnHandle>
  /**
   * Present only when the manifest kind is `website`, in driver hooks
   * (`website.ensure` / `refresh` / `dispose` / `content`). `state` is the
   * session-scoped author bag: Host creates it when the site session starts,
   * passes the same object to every hook, and keeps it across a reload that
   * swaps the driver module. The session end disposes it.
   */
  website?: WebsiteSessionApi
}
