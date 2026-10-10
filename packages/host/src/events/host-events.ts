/** Host stream events. An author UI does not subscribe to this map. */

export type HostEvent =
  | { type: 'app:open'; appId: string; title?: string }
  | { type: 'app:rename'; from: string; to: string }
  | { type: 'workbench:default'; appId: string }
  | { type: 'app:reload'; appId: string }
  | { type: 'storage-size'; appId: string; table: string; keys: string[] }
  /** A market install finished. App installs refresh the library; theme installs refresh palettes. */
  | { type: 'market:install'; kind: 'app' | 'theme'; id: string }
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
 * `app:open` focuses a tab. `app:reload` refetches and does not create one.
 */
export function createHostEvents() {
  const listeners = new Set<(event: HostEvent) => void>()
  return {
    subscribe(listener: (event: HostEvent) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(event: HostEvent) {
      for (const listener of [...listeners]) listener(event)
    },
    get connected() {
      return listeners.size > 0
    },
  }
}
