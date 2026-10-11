import type { HostNotice } from '@mohou/contract'

/** Host stream events. An author UI does not subscribe to this map. */

export type { AppChange, HostNotice } from '@mohou/contract'

export type HostEvent =
  | HostNotice
  | {
    type: 'app:eval'
    appId: string
    requestId: string
    code: string
    budgetMs: number
    maxBytes: number
    maxNodes: number
    maxDepth: number
  }

/**
 * In-process host stream. `GET /api/events` is the HTTP projection.
 * `subscribe` is a panel. `connected` is that panel.
 * `observe` receives the same events and does not count as one.
 * `app:open` focuses a tab. `app:reload` refetches and does not create one.
 */
export function createHostEvents() {
  const listeners = new Set<(event: HostEvent) => void>()
  const panels = new Set<(event: HostEvent) => void>()
  return {
    subscribe(listener: (event: HostEvent) => void) {
      listeners.add(listener)
      panels.add(listener)
      return () => {
        listeners.delete(listener)
        panels.delete(listener)
      }
    },
    observe(listener: (event: HostEvent) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(event: HostEvent) {
      for (const listener of [...listeners]) listener(event)
    },
    get connected() {
      return panels.size > 0
    },
  }
}
