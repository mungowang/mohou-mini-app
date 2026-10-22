import type { AppId } from '@mohou/contract'

export type ViewSessionKind = 'view' | 'ephemeral'

/**
 * Refcounted view sessions per app. Workbench slot is one reference.
 * When the count hits zero, `onEnd` runs teardown (spawn kill + unload).
 */
export function createViewSessions(options: {
  readonly onEnd: (appId: AppId) => Promise<void>
}) {
  const counts = new Map<string, number>()
  const ending = new Set<string>()

  function countOf(appId: string): number {
    return counts.get(appId) ?? 0
  }

  async function enter(appId: AppId): Promise<{ readonly kind: 'view'; readonly created: boolean }> {
    const prev = countOf(appId)
    counts.set(appId, prev + 1)
    return { kind: 'view', created: prev === 0 }
  }

  async function leave(appId: AppId): Promise<{ readonly ended: boolean }> {
    const prev = countOf(appId)
    if (prev <= 0) return { ended: false }
    if (prev === 1) {
      counts.delete(appId)
      return end(appId)
    }
    counts.set(appId, prev - 1)
    return { ended: false }
  }

  async function end(appId: AppId): Promise<{ readonly ended: boolean }> {
    if (ending.has(appId)) return { ended: false }
    ending.add(appId)
    counts.delete(appId)
    try {
      await options.onEnd(appId)
      return { ended: true }
    } finally {
      ending.delete(appId)
    }
  }

  function hasView(appId: string): boolean {
    return countOf(appId) > 0
  }

  async function endAll(): Promise<void> {
    const ids = [...counts.keys()] as AppId[]
    counts.clear()
    await Promise.all(ids.map(id => end(id)))
  }

  return { enter, leave, end, endAll, hasView, countOf }
}

export type ViewSessions = ReturnType<typeof createViewSessions>
