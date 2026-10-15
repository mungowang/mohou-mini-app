import { diagnosticUrl } from '@mohou/host/diagnostics'
import { httpLayout, runnerPath } from '@mohou/host/http'
import { PanelSurface, isPanelLocale } from '@mohou/panel'
import { createRoot } from 'react-dom/client'

import { createFrameBus } from './frame-bus.ts'
import { appFrameSandbox } from './frame.ts'
import { openHostEventsStream } from './host-events-stream.ts'
import { httpPanelClients } from './http-client.ts'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const clients = httpPanelClients('')
const policy = await clients.readPolicy()
const about = record(await fetch(httpLayout.about).then(response => response.json()))
const root = document.getElementById('root')
const frames = createFrameBus(postToAppFrame)

const stream = openHostEventsStream(httpLayout.events, {
  onAppEvent: (event) => {
    frames.push(event)
  },
  onAppGap: (appId, since) => {
    frames.gap(appId, since)
  },
  onAppReload: (appId) => {
    postToAppFrame(appId, { type: 'app:reload', appId })
  },
  onAppEval: (event) => {
    const appId = event.appId
    if (typeof appId !== 'string') return
    if (!postToAppFrame(appId, event)) reportAbsent(appId)
  },
})

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
        stream.setControls(next)
      }}
    />,
  )
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
