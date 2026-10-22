import type { AppId } from '@mohou/contract'

export type ViewSessionKind = 'view' | 'ephemeral'

/**
 * Holds live backends open.
 * - View refs: tabs + workbench slot. `hasView` gates `onHostEvents`.
 * - Ephemeral refs: tab-less `mini_app_call`. Same teardown when both hit zero.
 */
export function createViewSessions(options: {
  readonly onEnd: (appId: AppId) => Promise<void>
}) {
  const views = new Map<string, number>()
  const ephemerals = new Map<string, number>()
  const ending = new Set<string>()

  function viewCount(appId: string): number {
    return views.get(appId) ?? 0
  }

  function ephemeralCount(appId: string): number {
    return ephemerals.get(appId) ?? 0
  }

  function held(appId: string): boolean {
    return viewCount(appId) > 0 || ephemeralCount(appId) > 0
  }

  async function maybeEnd(appId: AppId): Promise<{ readonly ended: boolean }> {
    if (held(appId)) return { ended: false }
    return end(appId)
  }

  function enter(appId: AppId): { readonly kind: 'view'; readonly created: boolean } {
    const prev = viewCount(appId)
    views.set(appId, prev + 1)
    return { kind: 'view', created: prev === 0 && ephemeralCount(appId) === 0 }
  }

  async function leave(appId: AppId): Promise<{ readonly ended: boolean }> {
    const prev = viewCount(appId)
    if (prev <= 0) return { ended: false }
    if (prev === 1) views.delete(appId)
    else views.set(appId, prev - 1)
    return maybeEnd(appId)
  }

  function beginEphemeral(appId: AppId): { readonly kind: 'ephemeral'; readonly created: boolean } {
    const prev = ephemeralCount(appId)
    ephemerals.set(appId, prev + 1)
    return { kind: 'ephemeral', created: prev === 0 && viewCount(appId) === 0 }
  }

  async function endEphemeral(appId: AppId): Promise<{ readonly ended: boolean }> {
    const prev = ephemeralCount(appId)
    if (prev <= 0) return { ended: false }
    if (prev === 1) ephemerals.delete(appId)
    else ephemerals.set(appId, prev - 1)
    return maybeEnd(appId)
  }

  async function end(appId: AppId): Promise<{ readonly ended: boolean }> {
    if (ending.has(appId)) return { ended: false }
    ending.add(appId)
    views.delete(appId)
    ephemerals.delete(appId)
    try {
      await options.onEnd(appId)
      return { ended: true }
    } finally {
      ending.delete(appId)
    }
  }

  function hasView(appId: string): boolean {
    return viewCount(appId) > 0
  }

  function sessionKind(appId: string): ViewSessionKind {
    return hasView(appId) ? 'view' : 'ephemeral'
  }

  async function endAll(): Promise<void> {
    const ids = new Set<string>([...views.keys(), ...ephemerals.keys()])
    views.clear()
    ephemerals.clear()
    await Promise.all([...ids].map(id => end(id as AppId)))
  }

  return {
    enter,
    leave,
    beginEphemeral,
    endEphemeral,
    end,
    endAll,
    hasView,
    held,
    sessionKind,
    viewCount,
    ephemeralCount,
  }
}

export type ViewSessions = ReturnType<typeof createViewSessions>
