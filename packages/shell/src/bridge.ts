import type { HostEvent } from '@mohou/host'

/** Parent frame poster. The target origin is explicit. Shell does not read the frame. */
export interface FramePoster {
  post(message: unknown, targetOrigin: string): void
}

/** What Shell tells the panel. No route string lives here. */
export interface PanelBridge {
  showApp(appId: string, title?: string): void
  showNotice(appId: string, table: string): void
  unavailable(appId: string): void
  setWorkbench(appId: string): void
  renameApp(from: string, to: string): void
  marketInstalled(kind: 'app' | 'theme', id: string): void
  marketUninstalled(kind: 'app' | 'theme', id: string): void
  appChanged(event: { readonly appId: string; readonly change: 'created' | 'updated' | 'deleted' | 'restored' | 'renamed'; readonly from?: string }): void
}

/**
 * Posts to one frame. The theme message is first, so the frame learns the origin before any query.
 * @param frame - parent poster
 * @param origin - explicit target origin
 */
export function createFrameBridge(frame: FramePoster, origin: string) {
  let themed = false
  let variables: Record<string, string> = {}
  return {
    postTheme(next: Record<string, string>) {
      variables = next
      frame.post({ type: 'theme', variables }, origin)
      themed = true
    },
    post(message: unknown) {
      if (!themed) throw new Error('theme message must be first')
      frame.post(message, origin)
    },
  }
}

export type FrameBridge = ReturnType<typeof createFrameBridge>

/**
 * Apply one host event. Open tells the panel. Reload and eval go to the frame.
 * A missing frame reports unavailable and does not invent a route.
 * @param event - host stream event
 * @param panel - panel commands
 * @param frame - frame bridge, absent when no iframe is mounted
 */
export function applyHostEvent(event: HostEvent, panel: PanelBridge, frame?: FrameBridge): void {
  switch (event.type) {
    case 'app:open':
      panel.showApp(event.appId, event.title)
      return
    case 'workbench:default':
      panel.setWorkbench(event.appId)
      return
    case 'app:rename':
      panel.renameApp(event.from, event.to)
      return
    case 'storage-size':
      panel.showNotice(event.appId, event.table)
      return
    case 'market:install':
      panel.marketInstalled(event.kind, event.id)
      return
    case 'market:uninstall':
      panel.marketUninstalled(event.kind, event.id)
      return
    case 'app:changed':
      panel.appChanged({
        appId: event.appId,
        change: event.change,
        ...event.from === undefined ? {} : { from: event.from },
      })
      return
    case 'app:reload':
    case 'app:eval':
      if (frame === undefined) {
        panel.unavailable(event.appId)
        return
      }
      frame.post(event)
      return
    default:
      return event satisfies never
  }
}
