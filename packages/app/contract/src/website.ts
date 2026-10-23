import type { AppContext } from './context.ts'

/** Author event name Host pushes for website session snapshots. Not an author-declared event. */
export const websiteSnapshotEvent = 'mohou.website' as const

/** Site session phase. Host owns it; UI does not invent transitions. */
export type WebsitePhase =
  | 'ensuring'
  | 'ready'
  | 'refreshing'
  | 'failing'
  | 'disposing'

/** Failure carried on a snapshot. Hook calls still settle. */
export interface WebsiteError {
  readonly code: string
  readonly message: string
  /**
   * Optional diagnostics (e.g. recent child stdout/stderr).
   * UI may show this under expand detail; not a stable machine protocol.
   */
  readonly detail?: string
}

/** Session projection the UI reads. */
export interface WebsiteSnapshot {
  readonly phase: WebsitePhase
  readonly url?: string
  readonly error?: WebsiteError
  /** Bumps when content must remount. */
  readonly generation: number
}

/** Optional override from ensure or refresh. Omitted url keeps the previous or manifest default. */
export interface WebsiteUrlResult {
  readonly url?: string
}

export type MaybePromise<T> = T | Promise<T>

/** Content-document moments Host reports into the Driver (path C). */
export interface WebsiteContentInfo {
  readonly url: string
  readonly generation: number
  readonly reason?: string
}

/**
 * Content plane hooks on the Driver.
 * Session ensure/refresh/dispose stay separate. These fire after content is bound.
 */
export interface WebsiteContentDriver<State extends object = Record<string, never>> {
  onLoad?(ctx: AppContext<State>, info: WebsiteContentInfo): MaybePromise<void>
  onLoadFailed?(ctx: AppContext<State>, info: WebsiteContentInfo): MaybePromise<void>
  /** Best-effort idle after load. Cross-origin pages may only get onLoad. */
  onDocumentIdle?(ctx: AppContext<State>, info: WebsiteContentInfo): MaybePromise<void>
}

/**
 * Session strategy Host calls. Not an `api` method.
 * `ensure` is required when `kind` is `website`.
 */
export interface WebsiteDriver<State extends object = Record<string, never>> {
  ensure(ctx: AppContext<State>): MaybePromise<void | WebsiteUrlResult>
  refresh?(ctx: AppContext<State>, current: { readonly url: string }): MaybePromise<void | WebsiteUrlResult>
  dispose?(ctx: AppContext<State>): MaybePromise<void>
  content?: WebsiteContentDriver<State>
}

/** Long-lived child registered on the current SiteSession. */
export interface AppSpawnHandle {
  readonly pid: number | undefined
  kill(): Promise<void>
  /** Resolves when the process exits. */
  readonly exited: Promise<{ readonly exitCode: number | null }>
  /**
   * Poll `url` until HTTP answers or timeout.
   * Timeout and non-network failure throw; the session path records failing.
   */
  ready(options: { readonly url: string; readonly timeoutMs?: number }): Promise<void>
  /**
   * Recent combined stdout/stderr (bounded ring). For failure analysis, not a live stream.
   * Empty string when the child wrote nothing yet.
   */
  output(): string
}

/** Options for `ctx.spawn`. */
export interface AppSpawnOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

/**
 * Session-scoped author bag on `ctx.website`, inside website driver hooks.
 * One object per site session; Host keeps it across a driver reload.
 */
export interface WebsiteSessionApi {
  readonly state: Record<string, unknown>
}

/** UI handle from `useWebsite()`. Snapshot fields are current; actions ask Host. */
export interface WebsiteHandle extends WebsiteSnapshot {
  refresh(): Promise<void>
  retry(): Promise<void>
  /** Content frame reports load. Kit Frame calls this; authors rarely need it. */
  reportContent(
    event: 'load' | 'load-failed' | 'document-idle',
    info?: { readonly reason?: string },
  ): Promise<void>
}
