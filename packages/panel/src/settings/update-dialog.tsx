import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { Dialog } from '../ui/dialog.tsx'

import type { PanelUpdateAttempt, PanelUpdateFailureCode, PanelUpdateSource } from './client.ts'
import { UpdateSourceChip } from './update-source.tsx'

/** The one update card. The on-open check and the settings check open this card. */
export type UpdateCard =
  | { readonly kind: 'offer'; readonly current: string; readonly latest: string; readonly channel?: 'registry' | 'tarball'; readonly source?: PanelUpdateSource }
  | { readonly kind: 'installing'; readonly version: string; readonly startedAt: number }
  | { readonly kind: 'failed'; readonly reason: UpdateReason; readonly target?: string; readonly back?: string; readonly log?: string }
  | { readonly kind: 'done'; readonly version: string }

/** A request that never reached the launcher carries its own text. A recorded outcome carries a closed code. */
export type UpdateReason =
  | { readonly code: 'timeout' }
  | { readonly code: 'exit'; readonly exitCode?: number }
  | { readonly code: 'prepare' }
  | { readonly code: 'closed' }
  | { readonly code: 'leftover' }
  | { readonly code: 'verify' }
  | { readonly code: 'boot' }
  | { readonly text: string }

const reasonKeys = {
  timeout: 'update-reason-timeout',
  exit: 'update-reason-exit',
  prepare: 'update-reason-prepare',
  closed: 'update-reason-closed',
  leftover: 'update-reason-leftover',
  verify: 'update-reason-verify',
  boot: 'update-reason-boot',
} as const satisfies Record<PanelUpdateFailureCode, string>

const channelKeys = {
  tarball: 'update-channel-tarball',
  registry: 'update-channel-registry',
} as const

/** What the launcher recorded, as the card shows it. `current` is the version running now. */
export function attemptCard(attempt: PanelUpdateAttempt, current: string): UpdateCard {
  if (attempt.state === 'done') return { kind: 'done', version: attempt.to ?? current }
  return {
    kind: 'failed',
    reason: attempt.code === 'exit'
      ? { code: 'exit', ...attempt.exitCode === undefined ? {} : { exitCode: attempt.exitCode } }
      : { code: attempt.code },
    ...attempt.to === undefined ? {} : { target: attempt.to },
    ...attempt.rolledBack && attempt.from !== undefined ? { back: attempt.from } : {},
    ...attempt.log === undefined ? {} : { log: attempt.log },
  }
}

/**
 * One update card: offer, install in progress, failure, or the version now running.
 * @param props - card state and the two actions the card offers
 */
export function UpdateDialog(props: {
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly card: UpdateCard
  readonly onClose: () => void
  readonly onInstall: (version: string) => void
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  return (
    <div className="fixed inset-0 z-50">
      <Dialog width="md" onClose={props.card.kind === 'installing' ? () => undefined : props.onClose}>
        {props.card.kind === 'offer' ? <Offer card={props.card} label={label} onClose={props.onClose} onInstall={props.onInstall} /> : null}
        {props.card.kind === 'installing' ? <Installing card={props.card} label={label} /> : null}
        {props.card.kind === 'failed' ? <Failed card={props.card} label={label} onClose={props.onClose} onInstall={props.onInstall} /> : null}
        {props.card.kind === 'done' ? <Done card={props.card} label={label} onClose={props.onClose} /> : null}
      </Dialog>
    </div>
  )
}

function Offer(props: {
  readonly card: Extract<UpdateCard, { kind: 'offer' }>
  readonly label: (key: string) => string
  readonly onClose: () => void
  readonly onInstall: (version: string) => void
}): ReactNode {
  return (
    <>
      <h3 className="m-0 text-base font-semibold">{props.label('update-card-title')}</h3>
      <div className="mt-4 flex items-end gap-4">
        <Version caption={props.label('update-card-current')} version={props.card.current} />
        <span className="pb-1.5 text-muted-foreground" aria-hidden>→</span>
        <Version caption={props.label('update-card-latest')} version={props.card.latest} strong />
        {props.card.channel === undefined ? null : (
          <span className="mb-0.5 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            {props.label(channelKeys[props.card.channel])}
          </span>
        )}
      </div>
      {props.card.source === undefined ? null : (
        <div className="mt-3"><UpdateSourceChip source={props.card.source} label={props.label} /></div>
      )}
      <p className="mt-4 text-sm text-muted-foreground">{props.label('update-card-note')}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onClose}>{props.label('cancel')}</button>
        <button
          type="button"
          className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          onClick={() => props.onInstall(props.card.latest)}
        >{props.label('update-install')}</button>
      </div>
    </>
  )
}

function Installing(props: {
  readonly card: Extract<UpdateCard, { kind: 'installing' }>
  readonly label: (key: string) => string
}): ReactNode {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - props.card.startedAt))
  useEffect(() => {
    const started = props.card.startedAt
    const tick = setInterval(() => setElapsed(Math.max(0, Date.now() - started)), 1_000)
    return () => { clearInterval(tick) }
  }, [props.card.startedAt])
  return (
    <>
      <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        {props.label('update-installing-title').replace('{n}', props.card.version)}
      </h3>
      <div className="mt-5 h-0.5 w-full overflow-hidden rounded-full bg-muted">
        <span className="block h-full w-1/3 animate-pulse rounded-full bg-foreground/40" />
      </div>
      <p className="mt-4 font-mono text-sm text-muted-foreground">{props.label('update-installing-elapsed').replace('{n}', clockText(elapsed))}</p>
      <p className="mt-1 text-sm text-muted-foreground">{props.label('update-installing-note')}</p>
    </>
  )
}

function Failed(props: {
  readonly card: Extract<UpdateCard, { kind: 'failed' }>
  readonly label: (key: string) => string
  readonly onClose: () => void
  readonly onInstall: (version: string) => void
}): ReactNode {
  return (
    <>
      <h3 className="m-0 text-base font-semibold">{props.label('update-failed-title')}</h3>
      <p className="mt-3 text-sm">{reasonText(props.card.reason, props.label)}</p>
      {props.card.back === undefined ? null : (
        <p className="mt-1 text-sm text-muted-foreground">{props.label('update-failed-back').replace('{n}', props.card.back)}</p>
      )}
      {props.card.log === undefined ? null : (
        <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">{props.label('update-log').replace('{n}', props.card.log)}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onClose}>{props.label('update-card-close')}</button>
        {props.card.target === undefined ? null : (
          <button
            type="button"
            className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            onClick={() => {
              const target = props.card.target
              if (target !== undefined) props.onInstall(target)
            }}
          >{props.label('update-card-retry')}</button>
        )}
      </div>
    </>
  )
}

function Done(props: {
  readonly card: Extract<UpdateCard, { kind: 'done' }>
  readonly label: (key: string) => string
  readonly onClose: () => void
}): ReactNode {
  return (
    <>
      <h3 className="m-0 text-base font-semibold">{props.label('update-card-done-title').replace('{n}', props.card.version)}</h3>
      <p className="mt-3 text-sm text-muted-foreground">{props.label('update-card-done-note')}</p>
      <div className="mt-5 flex justify-end">
        <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={props.onClose}>
          {props.label('update-card-ok')}
        </button>
      </div>
    </>
  )
}

function Version(props: { readonly caption: string; readonly version: string; readonly strong?: boolean }): ReactNode {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{props.caption}</span>
      <span className={props.strong === true ? 'font-mono text-lg font-semibold' : 'font-mono text-lg'}>{props.version}</span>
    </span>
  )
}

function reasonText(reason: UpdateReason, label: (key: string) => string): string {
  if ('text' in reason) return reason.text
  const text = label(reasonKeys[reason.code])
  if (reason.code !== 'exit') return text
  return reason.exitCode === undefined ? label('update-reason-exit-plain') : text.replace('{n}', String(reason.exitCode))
}

function clockText(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1_000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
