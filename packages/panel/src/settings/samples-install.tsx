import { useState, type ReactNode } from 'react'

import type { PanelSamples } from './client.ts'

/**
 * Install the sample apps this product ships. One button, and the host copies only what this
 * library does not have: a library seeded before an app existed, or one whose owner deleted it,
 * can still get it without touching anything else.
 * @param props - the installer, and the chrome labels
 */
export function SamplesInstall(props: {
  readonly label: (key: string) => string
  readonly installSamples?: () => Promise<PanelSamples>
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PanelSamples | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const install = props.installSamples
  if (install === undefined) return null
  return (
    <div className="mt-3 rounded-2xl border bg-card px-4 py-3">
      <p className="m-0 text-sm font-medium">{props.label('samples-install')}</p>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">{props.label('samples-install-help')}</p>
      <button
        type="button"
        className="h-8 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-60"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void install().then(
            (next) => {
              setResult(next)
              setFailed(false)
            },
            () => { setFailed(true) },
          ).finally(() => { setBusy(false) })
        }}
      >
        {busy ? props.label('samples-installing') : props.label('samples-install-action')}
      </button>
      {!failed ? null : <span className="ml-3 text-xs text-destructive">{props.label('samples-install-failed')}</span>}
      {failed || result === undefined ? null : (
        <span className="ml-3 text-xs text-muted-foreground">
          {`${props.label('samples-installed')} ${result.installed.length} · ${props.label('samples-skipped')} ${result.skipped.length}`}
        </span>
      )}
    </div>
  )
}
