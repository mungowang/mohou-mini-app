import {
  websiteSnapshotEvent,
  type AppContext,
  type AppId,
  type WebsiteDriver,
  type WebsitePhase,
  type WebsiteSnapshot,
} from '@mohou/contract'

import type { CallCapabilities } from '../kernel/call.ts'
import { contextFor } from '../kernel/call.ts'
import { SpawnError } from '../process/spawn.ts'

export interface WebsiteSessionPorts {
  readonly runtimeRoot: string
  /** Capabilities already carry website-tagged `spawn` from the live app registry. `state` lands on `ctx.website`. */
  readonly buildCapabilities: (appId: AppId, state: Record<string, unknown>) => Promise<CallCapabilities> | CallCapabilities
  /** Kill website-tagged children on ensure retry / ensure failure. Host owns the registry. */
  readonly disposeWebsiteSpawns?: (appId: AppId) => Promise<void>
  /** Recent website-tag spawn output for failing snapshots. */
  readonly websiteOutput?: (appId: AppId) => string
  readonly pushSnapshot: (appId: AppId, snapshot: WebsiteSnapshot) => void
  readonly log: (appId: string, message: string) => void
}

interface SessionRecord {
  readonly appId: AppId
  readonly defaultUrl: string
  driver: WebsiteDriver
  phase: WebsitePhase
  url?: string
  error?: WebsiteSnapshot['error']
  generation: number
  chain: Promise<void>
  /** Author bag for this site session. Survives a driver swap (reload); dies with the session. */
  state: Record<string, unknown>
}

/**
 * One SiteSession per website app id while a view holds it.
 * Spawns live on the app process registry (website tag); session end kills via Host.
 */
export function createWebsiteSessions(ports: WebsiteSessionPorts) {
  const sessions = new Map<string, SessionRecord>()

  function snapshotOf(session: SessionRecord): WebsiteSnapshot {
    return {
      phase: session.phase,
      generation: session.generation,
      ...session.url === undefined ? {} : { url: session.url },
      ...session.error === undefined ? {} : { error: session.error },
    }
  }

  function publish(session: SessionRecord): void {
    ports.pushSnapshot(session.appId, snapshotOf(session))
  }

  function get(appId: string): WebsiteSnapshot | undefined {
    const session = sessions.get(appId)
    return session === undefined ? undefined : snapshotOf(session)
  }

  async function withCtx<T>(
    session: SessionRecord,
    work: (ctx: AppContext) => Promise<T> | T,
  ): Promise<T> {
    const capabilities = await ports.buildCapabilities(session.appId, session.state)
    const controller = new AbortController()
    const ctx = contextFor(capabilities, controller.signal)
    try {
      return await work(ctx)
    } finally {
      controller.abort()
      await capabilities.brain.stop()
    }
  }

  function enqueue(session: SessionRecord, work: () => Promise<void>): Promise<void> {
    const next = session.chain.then(work, work)
    session.chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  function missing(): WebsiteSnapshot {
    return {
      phase: 'failing',
      generation: 0,
      error: { code: 'website-no-session', message: 'website session is not open' },
    }
  }

  async function killWebsite(appId: AppId): Promise<void> {
    if (ports.disposeWebsiteSpawns === undefined) return
    await ports.disposeWebsiteSpawns(appId).catch(() => undefined)
  }

  async function ensure(input: {
    readonly appId: AppId
    readonly defaultUrl: string
    readonly driver: WebsiteDriver
    readonly appDir: string
  }): Promise<WebsiteSnapshot> {
    const existing = sessions.get(input.appId)
    if (existing !== undefined) {
      // Reload: swap the driver module, keep the session (and its state bag).
      existing.driver = input.driver
      return snapshotOf(existing)
    }
    const session: SessionRecord = {
      appId: input.appId,
      defaultUrl: input.defaultUrl,
      driver: input.driver,
      phase: 'ensuring',
      generation: 0,
      chain: Promise.resolve(),
      state: {},
    }
    sessions.set(input.appId, session)
    publish(session)

    await enqueue(session, async () => {
      session.phase = 'ensuring'
      session.error = undefined
      publish(session)
      try {
        const result = await withCtx(session, ctx => session.driver.ensure(ctx))
        if (!sessions.has(session.appId)) return
        session.url = pickUrl(result, session.defaultUrl, session.url)
        session.phase = 'ready'
        session.generation += 1
        session.error = undefined
        publish(session)
      } catch (error) {
        // Capture output before dispose clears the registry rings.
        const output = ports.websiteOutput?.(session.appId)
        await killWebsite(session.appId)
        if (!sessions.has(session.appId)) return
        fail(session, error, 'website-ensure-failed', output)
      }
    })
    return snapshotOf(session)
  }

  async function refresh(appId: AppId): Promise<WebsiteSnapshot> {
    const session = sessions.get(appId)
    if (session === undefined) return missing()
    await enqueue(session, async () => {
      const currentUrl = session.url ?? session.defaultUrl
      session.phase = 'refreshing'
      publish(session)
      try {
        let nextUrl = currentUrl
        if (session.driver.refresh !== undefined) {
          const result = await withCtx(session, (ctx) => {
            if (session.driver.refresh === undefined) return undefined
            return session.driver.refresh(ctx, { url: currentUrl })
          })
          nextUrl = pickUrl(result, session.defaultUrl, currentUrl)
        }
        if (!sessions.has(session.appId)) return
        session.url = nextUrl
        session.phase = 'ready'
        session.generation += 1
        session.error = undefined
        publish(session)
      } catch (error) {
        if (!sessions.has(session.appId)) return
        fail(session, error, 'website-refresh-failed')
      }
    })
    return snapshotOf(session)
  }

  async function retry(appId: AppId): Promise<WebsiteSnapshot> {
    const session = sessions.get(appId)
    if (session === undefined) return missing()
    if (session.phase !== 'failing') return refresh(appId)
    await enqueue(session, async () => {
      session.phase = 'ensuring'
      session.error = undefined
      publish(session)
      try {
        await killWebsite(session.appId)
        const result = await withCtx(session, ctx => session.driver.ensure(ctx))
        if (!sessions.has(session.appId)) return
        session.url = pickUrl(result, session.defaultUrl, session.url)
        session.phase = 'ready'
        session.generation += 1
        session.error = undefined
        publish(session)
      } catch (error) {
        const output = ports.websiteOutput?.(session.appId)
        await killWebsite(session.appId)
        if (!sessions.has(session.appId)) return
        fail(session, error, 'website-ensure-failed', output)
      }
    })
    return snapshotOf(session)
  }

  /**
   * End the driver session. Runs `dispose` hook only — Host kills remaining spawns after.
   */
  async function dispose(appId: AppId): Promise<void> {
    const session = sessions.get(appId)
    if (session === undefined) return
    sessions.delete(appId)
    await enqueue(session, async () => {
      session.phase = 'disposing'
      publish(session)
      if (session.driver.dispose === undefined) return
      await withCtx(session, (ctx) => {
        if (session.driver.dispose === undefined) return undefined
        return session.driver.dispose(ctx)
      }).catch((error: unknown) => {
        ports.log(session.appId, `website dispose failed: ${errorMessage(error)}`)
      })
    })
  }

  async function content(
    appId: AppId,
    event: 'load' | 'load-failed' | 'document-idle',
    reason?: string,
  ): Promise<void> {
    const session = sessions.get(appId)
    if (session === undefined) return
    if (session.phase !== 'ready' && session.phase !== 'refreshing') return
    const url = session.url ?? session.defaultUrl
    const info = {
      url,
      generation: session.generation,
      ...reason === undefined ? {} : { reason },
    }
    await enqueue(session, async () => {
      if (!sessions.has(session.appId)) return
      try {
        await withCtx(session, async (ctx) => {
          const hooks = session.driver.content
          if (hooks === undefined) return
          if (event === 'load' && hooks.onLoad !== undefined) {
            await hooks.onLoad(ctx, info)
            return
          }
          if (event === 'load-failed' && hooks.onLoadFailed !== undefined) {
            await hooks.onLoadFailed(ctx, info)
            return
          }
          if (event === 'document-idle' && hooks.onDocumentIdle !== undefined) {
            await hooks.onDocumentIdle(ctx, info)
          }
        })
      } catch (error) {
        ports.log(session.appId, `website content ${event} failed: ${errorMessage(error)}`)
      }
    })
  }

  async function disposeAll(): Promise<void> {
    const ids = [...sessions.keys()] as AppId[]
    await Promise.all(ids.map(id => dispose(id)))
  }

  function fail(session: SessionRecord, error: unknown, code: string, output?: string): void {
    session.phase = 'failing'
    const failed = toError(
      error,
      code,
      output ?? ports.websiteOutput?.(session.appId),
    )
    session.error = failed
    publish(session)
    ports.log(session.appId, `website ${code}: ${failed.message}`)
  }

  return { ensure, refresh, retry, dispose, content, get, disposeAll, snapshotEvent: websiteSnapshotEvent }
}

function pickUrl(
  result: void | { url?: string },
  defaultUrl: string,
  previous: string | undefined,
): string {
  if (
    result !== undefined
    && typeof result === 'object'
    && typeof result.url === 'string'
    && result.url.length > 0
  ) {
    return result.url
  }
  return previous ?? defaultUrl
}

function nonEmptyDetail(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined
  return value
}

function toError(
  error: unknown,
  fallbackCode: string,
  registryOutput?: string,
): NonNullable<WebsiteSnapshot['error']> {
  const detail = error instanceof SpawnError
    ? nonEmptyDetail(error.detail) ?? nonEmptyDetail(registryOutput)
    : nonEmptyDetail(registryOutput)
  const withDetail = detail === undefined ? {} : { detail }
  if (error instanceof SpawnError) {
    return { code: error.code, message: error.message, ...withDetail }
  }
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : fallbackCode
    return { code, message: error.message, ...withDetail }
  }
  return { code: fallbackCode, message: errorMessage(error), ...withDetail }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'failed'
}
