/**
 * Panel host stream. Keeps one EventSource alive and queues control commands until
 * the panel surface has handed over its controls handle.
 */
export type HostStreamControls = {
  showApp(appId: string, title?: string): void
  showNotice(appId: string, table: string): void
  setWorkbench(appId: string): void
  renameApp(from: string, to: string): void
  marketInstalled(kind: 'app' | 'theme', id: string): void
  marketUninstalled(kind: 'app' | 'theme', id: string): void
  appChanged(event: {
    readonly appId: string
    readonly change: 'created' | 'updated' | 'deleted' | 'restored' | 'renamed'
    readonly from?: string
  }): void
}

export type HostStreamHooks = {
  readonly onAppEvent: (event: {
    appId: string
    name: string
    data: unknown
    seq: number
  }) => void
  readonly onAppGap: (appId: string, since: number) => void
  readonly onAppReload: (appId: string) => void
  readonly onAppEval: (event: Record<string, unknown>) => void
}

type Pending =
  | { readonly kind: 'showApp'; readonly appId: string; readonly title?: string }
  | { readonly kind: 'showNotice'; readonly appId: string; readonly table: string }
  | { readonly kind: 'setWorkbench'; readonly appId: string }
  | { readonly kind: 'renameApp'; readonly from: string; readonly to: string }
  | { readonly kind: 'marketInstalled'; readonly marketKind: 'app' | 'theme'; readonly id: string }
  | { readonly kind: 'marketUninstalled'; readonly marketKind: 'app' | 'theme'; readonly id: string }
  | {
    readonly kind: 'appChanged'
    readonly appId: string
    readonly change: 'created' | 'updated' | 'deleted' | 'restored' | 'renamed'
    readonly from?: string
  }

const appChanges = new Set(['created', 'updated', 'deleted', 'restored', 'renamed'])

/** Open the host event stream and apply control commands when the panel is ready. */
export function openHostEventsStream(
  url: string,
  hooks: HostStreamHooks,
  createSource: (href: string) => EventSource = href => new EventSource(href),
): {
  setControls(next: HostStreamControls | undefined): void
  close(): void
} {
  let controls: HostStreamControls | undefined
  let pending: Pending[] = []
  let source: EventSource | undefined
  let closed = false
  let retryMs = 500
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush(): void {
    if (controls === undefined) return
    const batch = pending
    pending = []
    for (const item of batch) applyPending(controls, item)
  }

  function enqueue(item: Pending): void {
    if (controls === undefined) {
      pending.push(item)
      return
    }
    applyPending(controls, item)
  }

  function onMessage(raw: MessageEvent<string>): void {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw.data) as Record<string, unknown>
    } catch {
      return
    }
    const type = data.type
    if (type === 'app:event' && typeof data.appId === 'string' && typeof data.name === 'string' && typeof data.seq === 'number') {
      hooks.onAppEvent({ appId: data.appId, name: data.name, data: data.data, seq: data.seq })
      return
    }
    if (type === 'app:gap' && typeof data.appId === 'string' && typeof data.since === 'number') {
      hooks.onAppGap(data.appId, data.since)
      return
    }
    if (type === 'app:open' && typeof data.appId === 'string') {
      enqueue({
        kind: 'showApp',
        appId: data.appId,
        ...typeof data.title === 'string' ? { title: data.title } : {},
      })
      return
    }
    if (type === 'workbench:default' && typeof data.appId === 'string') {
      enqueue({ kind: 'setWorkbench', appId: data.appId })
      return
    }
    if (type === 'app:rename' && typeof data.from === 'string' && typeof data.to === 'string') {
      enqueue({ kind: 'renameApp', from: data.from, to: data.to })
      return
    }
    if (type === 'storage-size' && typeof data.appId === 'string' && typeof data.table === 'string') {
      enqueue({ kind: 'showNotice', appId: data.appId, table: data.table })
      return
    }
    if (type === 'market:install' && (data.kind === 'app' || data.kind === 'theme') && typeof data.id === 'string') {
      enqueue({ kind: 'marketInstalled', marketKind: data.kind, id: data.id })
      return
    }
    if (type === 'market:uninstall' && (data.kind === 'app' || data.kind === 'theme') && typeof data.id === 'string') {
      enqueue({ kind: 'marketUninstalled', marketKind: data.kind, id: data.id })
      return
    }
    if (type === 'app:changed' && typeof data.appId === 'string' && typeof data.change === 'string' && appChanges.has(data.change)) {
      enqueue({
        kind: 'appChanged',
        appId: data.appId,
        change: data.change as 'created' | 'updated' | 'deleted' | 'restored' | 'renamed',
        ...typeof data.from === 'string' ? { from: data.from } : {},
      })
      return
    }
    if (type === 'app:reload' && typeof data.appId === 'string') {
      hooks.onAppReload(data.appId)
      return
    }
    if (type === 'app:eval' && typeof data.appId === 'string') {
      hooks.onAppEval(data)
    }
  }

  function connect(): void {
    if (closed) return
    source?.close()
    const next = createSource(url)
    source = next
    next.onmessage = onMessage
    next.onopen = () => {
      retryMs = 500
    }
    next.onerror = () => {
      next.close()
      if (closed) return
      const wait = retryMs
      retryMs = Math.min(retryMs * 2, 8_000)
      timer = setTimeout(connect, wait)
    }
  }

  connect()

  return {
    setControls(next) {
      controls = next
      flush()
    },
    close() {
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      source?.close()
      source = undefined
      pending = []
    },
  }
}

function applyPending(controls: HostStreamControls, item: Pending): void {
  switch (item.kind) {
    case 'showApp':
      controls.showApp(item.appId, item.title)
      return
    case 'showNotice':
      controls.showNotice(item.appId, item.table)
      return
    case 'setWorkbench':
      controls.setWorkbench(item.appId)
      return
    case 'renameApp':
      controls.renameApp(item.from, item.to)
      return
    case 'marketInstalled':
      controls.marketInstalled(item.marketKind, item.id)
      return
    case 'marketUninstalled':
      controls.marketUninstalled(item.marketKind, item.id)
      return
    case 'appChanged':
      controls.appChanged({
        appId: item.appId,
        change: item.change,
        ...item.from === undefined ? {} : { from: item.from },
      })
      return
    default: {
      const unreachable: never = item
      void unreachable
    }
  }
}
