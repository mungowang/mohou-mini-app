import { diagnosticUrl } from '@mohou/host/diagnostics'
import { httpLayout, runnerPath } from '@mohou/host/http'
import { PanelSurface, isPanelLocale, type PanelControls } from '@mohou/panel'
import { createRoot } from 'react-dom/client'

import { createFrameBus } from './frame-bus.ts'
import { appFrameSandbox } from './frame.ts'
import { httpPanelClients } from './http-client.ts'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const clients = httpPanelClients('')
const policy = await clients.readPolicy()
const about = record(await fetch(httpLayout.about).then(response => response.json()))
const root = document.getElementById('root')
let controls: PanelControls | undefined
if (root) {
  createRoot(root).render(
    <PanelSurface
      client={clients}
      settings={clients}
      history={clients}
      storage={clients}
      theme={clients}
      locale={isPanelLocale(policy.locale) ? policy.locale : 'en'}
      mode="production"
      shell="standalone"
      frame={appId => (
        <iframe className="block size-full border-0" sandbox={appFrameSandbox} src={runnerPath(appId)} title={appId} />
      )}
      versions={[about.name, about.current].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')}
      onControls={(next) => {
        controls = next
      }}
    />,
  )
}

const frames = createFrameBus(postToAppFrame)

const events = new EventSource(httpLayout.events)
events.onmessage = (event) => {
  const data = JSON.parse(event.data) as {
    type?: string
    appId?: string
    title?: string
    table?: string
    name?: string
    data?: unknown
    seq?: number
    since?: number
    from?: string
    to?: string
  }
  if (data.type === 'app:event' && typeof data.appId === 'string' && typeof data.name === 'string' && typeof data.seq === 'number') {
    frames.push({ appId: data.appId, name: data.name, data: data.data, seq: data.seq })
    return
  }
  if (data.type === 'app:gap' && typeof data.appId === 'string' && typeof data.since === 'number') {
    frames.gap(data.appId, data.since)
    return
  }
  if (data.type === 'app:open' && typeof data.appId === 'string') {
    controls?.showApp(data.appId, data.title)
  }
  if (data.type === 'workbench:default' && typeof data.appId === 'string') {
    controls?.setWorkbench(data.appId)
  }
  if (data.type === 'app:rename' && typeof data.from === 'string' && typeof data.to === 'string') {
    controls?.renameApp(data.from, data.to)
  }
  if (data.type === 'storage-size' && typeof data.appId === 'string' && typeof data.table === 'string') {
    controls?.showNotice(data.appId, data.table)
  }
  if ((data.type === 'app:reload' || data.type === 'app:eval') && typeof data.appId === 'string') {
    if (!postToAppFrame(data.appId, data) && data.type === 'app:eval') reportAbsent(data.appId)
  }
}

/** The panel document holds one iframe per open app, titled with the app id. A missing frame is the panel's to report. */
function postToAppFrame(appId: string, message: unknown): boolean {
  let posted = false
  for (const frame of document.querySelectorAll('iframe')) {
    if (!(frame instanceof HTMLIFrameElement) || frame.title !== appId) continue
    frame.contentWindow?.postMessage(message, window.location.origin)
    posted = true
  }
  return posted
}

/** Tells Host the query has no frame to run in, so its caller gets `not-open` now and not a timeout sentence. */
function reportAbsent(appId: string): void {
  void fetch(diagnosticUrl(appId, 'absent'), { method: 'POST', body: '{}' }).catch(() => undefined)
}

function watchAppFrames(): void {
  const live = new Set<string>()
  for (const frame of document.querySelectorAll('iframe')) {
    if (!(frame instanceof HTMLIFrameElement) || frame.title.length === 0) continue
    live.add(frame.title)
  }
  frames.sync(live)
}

watchAppFrames()
new MutationObserver(watchAppFrames).observe(document.body, { childList: true, subtree: true })
