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
import { createSpawnRegistry, SpawnError } from './spawn.ts'

export interface WebsiteSessionPorts {
  readonly buildCapabilities: (appId: AppId) => Promise<CallCapabilities> | CallCapabilities
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
  readonly spawn: ReturnType<typeof createSpawnRegistry>
  chain: Promise<void>
}

/**
 * One SiteSession per website app id while a tab (or owner open) holds it.
 * Spawn children are registered here and killed on dispose.
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
    const capabilities = await ports.buildCapabilities(session.appId)
    const controller = new AbortController()
    const base = contextFor(capabilities, controller.signal)
    const ctx: AppContext = {
      ...base,
      spawn: (file, args, options) => session.spawn.spawn(file, args, options),
    }
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

  async function ensure(input: {
    readonly appId: AppId
    readonly defaultUrl: string
    readonly driver: WebsiteDriver
    readonly appDir: string
  }): Promise<WebsiteSnapshot> {
    const existing = sessions.get(input.appId)
    if (existing !== undefined) {
      existing.driver = input.driver
      return snapshotOf(existing)
    }
    const session: SessionRecord = {
      appId: input.appId,
      defaultUrl: input.defaultUrl,
      driver: input.driver,
      phase: 'ensuring',
      generation: 0,
      spawn: createSpawnRegistry({ cwd: input.appDir }),
      chain: Promise.resolve(),
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
        await session.spawn.dispose().catch(() => undefined)
        if (!sessions.has(session.appId)) return
        fail(session, error, 'website-ensure-failed')
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
        await session.spawn.dispose().catch(() => undefined)
        const result = await withCtx(session, ctx => session.driver.ensure(ctx))
        if (!sessions.has(session.appId)) return
        session.url = pickUrl(result, session.defaultUrl, session.url)
        session.phase = 'ready'
        session.generation += 1
        session.error = undefined
        publish(session)
      } catch (error) {
        await session.spawn.dispose().catch(() => undefined)
        if (!sessions.has(session.appId)) return
        fail(session, error, 'website-ensure-failed')
      }
    })
    return snapshotOf(session)
  }

  async function dispose(appId: AppId): Promise<void> {
    const session = sessions.get(appId)
    if (session === undefined) return
    // Remove first so concurrent ensure/refresh exit cleanly.
    sessions.delete(appId)
    await enqueue(session, async () => {
      session.phase = 'disposing'
      publish(session)
      try {
        if (session.driver.dispose !== undefined) {
          await withCtx(session, (ctx) => {
            if (session.driver.dispose === undefined) return undefined
            return session.driver.dispose(ctx)
          }).catch((error: unknown) => {
            ports.log(session.appId, `website dispose failed: ${errorMessage(error)}`)
          })
        }
      } finally {
        await session.spawn.dispose().catch(() => undefined)
      }
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

  function fail(session: SessionRecord, error: unknown, code: string): void {
    session.phase = 'failing'
    const failed = toError(error, code)
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

function toError(error: unknown, fallbackCode: string): NonNullable<WebsiteSnapshot['error']> {
  if (error instanceof SpawnError) return { code: error.code, message: error.message }
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : fallbackCode
    return { code, message: error.message }
  }
  return { code: fallbackCode, message: errorMessage(error) }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'failed'
}
