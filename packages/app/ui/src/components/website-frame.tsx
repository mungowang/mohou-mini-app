import { useEffect, useState, type ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon, CopyIcon } from 'lucide-react'

import { Button } from './button.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible.tsx'
import { Spinner } from './spinner.tsx'
import { writeClipboard } from '../lib/clipboard.ts'
import { cn } from '../lib/utils.ts'
import { useLabels } from '../i18n/context.tsx'
import { useWebsite } from '../sdk/use-website.ts'

const SLOW_ENSURE_MS = 3_000

export interface WebsiteFrameProps {
  readonly className?: string
  readonly children?: ReactNode
  /** Short name in the starting title. Defaults to kit copy without a name. */
  readonly name?: string
  /**
   * Prefer local-service wording while ensuring.
   * Default true (most website apps spawn a local process).
   */
  readonly localService?: boolean
  /** Override starting title. */
  readonly loadingLabel?: string
  /** Override retry label. */
  readonly retryLabel?: string
}

/**
 * Default website chrome: lifecycle states around the content iframe.
 * Authors may skip this and compose with `useWebsite` instead.
 * @family Surface
 */
export function WebsiteFrame(props: WebsiteFrameProps) {
  const site = useWebsite()
  const labels = useLabels('websiteFrame')
  const localService = props.localService !== false

  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [slowEnsure, setSlowEnsure] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setIframeLoaded(false)
  }, [site.generation, site.url])

  useEffect(() => {
    if (site.phase !== 'ensuring') {
      setSlowEnsure(false)
      return
    }
    const timer = window.setTimeout(() => setSlowEnsure(true), SLOW_ENSURE_MS)
    return () => window.clearTimeout(timer)
  }, [site.phase, site.generation])

  useEffect(() => {
    if (site.phase !== 'failing') {
      setDetailOpen(false)
      setCopied(false)
    }
  }, [site.phase])

  const showIframe = (site.phase === 'ready' || site.phase === 'refreshing') && site.url !== undefined
  const connecting = showIframe && !iframeLoaded
  const live = showIframe && iframeLoaded
  const starting = site.phase === 'ensuring' || site.phase === 'disposing'
  const trouble = site.phase === 'failing'

  const startingTitle = props.loadingLabel
    ?? (props.name !== undefined && props.name.length > 0
      ? labels.startingNamed(props.name)
      : labels.starting)
  const startingHint = localService ? labels.startingHintLocal : labels.startingHintRemote
  const retryLabel = props.retryLabel ?? labels.retry

  const detailText = site.error === undefined
    ? ''
    : [
        site.error.code.length > 0 ? site.error.code : undefined,
        site.error.message,
        site.error.detail,
      ].filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n\n')

  return (
    <div
      className={cn('relative flex h-full min-h-0 w-full flex-1 flex-col', props.className)}
      data-website-phase={site.phase}
      data-website-loaded={iframeLoaded ? '1' : '0'}
    >
      {props.children}

      {site.phase === 'refreshing' && live ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-primary/20"
          aria-hidden
        >
          <div
            className="h-full w-2/5 bg-primary motion-reduce:translate-x-0"
            style={{ animation: 'website-refresh-bar 1.1s ease-in-out infinite' }}
          />
        </div>
      ) : null}

      {starting ? (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
          <Spinner className="size-5 text-primary" aria-label={startingTitle} />
          <p className="text-sm font-medium text-foreground">{startingTitle}</p>
          <p className="max-w-xs text-xs text-muted-foreground text-balance">
            {site.phase === 'disposing' ? labels.disposing : startingHint}
          </p>
          {site.phase === 'ensuring' && slowEnsure ? (
            <p className="text-[11px] text-muted-foreground/80">{labels.startingSlow}</p>
          ) : null}
        </div>
      ) : null}

      {trouble ? (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div
            className="flex size-7 items-center justify-center rounded-full border border-destructive/35 bg-destructive/10 text-sm text-destructive"
            aria-hidden
          >
            !
          </div>
          <div className="flex max-w-sm flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{labels.trouble}</p>
            <p className="text-xs text-muted-foreground text-balance">{labels.troubleHint}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" size="sm" onClick={() => void site.retry()}>
              {retryLabel}
            </Button>
          </div>
          {detailText.length > 0 ? (
            <Collapsible open={detailOpen} onOpenChange={setDetailOpen} className="w-full max-w-md">
              <CollapsibleTrigger
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                type="button"
              >
                <ChevronDownIcon
                  className={cn('size-3.5 transition-transform', detailOpen && 'rotate-180')}
                  aria-hidden
                />
                {detailOpen ? labels.collapseDetail : labels.expandDetail}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="relative rounded-lg border border-border bg-muted/40 px-3 py-2 text-left">
                  <pre className="max-h-32 overflow-auto pr-8 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                    {detailText}
                  </pre>
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={copied ? labels.copied : labels.copyDetail}
                    title={copied ? labels.copied : labels.copyDetail}
                    onClick={() => {
                      void writeClipboard(detailText).then((ok) => {
                        if (!ok) return
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 1500)
                      })
                    }}
                  >
                    {copied
                      ? <CheckIcon className="size-3.5 text-primary" aria-hidden />
                      : <CopyIcon className="size-3.5" aria-hidden />}
                  </button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : null}

      {showIframe ? (
        <div className="relative min-h-0 w-full flex-1">
          <iframe
            key={site.generation}
            title={props.name ?? 'website'}
            src={site.url}
            className="absolute inset-0 size-full border-0 bg-background"
            data-website-generation={site.generation}
            onLoad={() => {
              setIframeLoaded(true)
              void site.reportContent('load')
              window.setTimeout(() => {
                void site.reportContent('document-idle')
              }, 0)
            }}
            onError={() => {
              void site.reportContent('load-failed', { reason: 'iframe error' })
            }}
          />
          {connecting ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-background/80 p-6 text-center backdrop-blur-[2px]">
              <Spinner className="size-5 text-primary" aria-label={labels.connecting} />
              <p className="text-sm font-medium text-foreground">{labels.connecting}</p>
              {site.url !== undefined ? (
                <p className="max-w-sm truncate rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {site.url}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <style>{`
@keyframes website-refresh-bar {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
`}</style>
    </div>
  )
}
