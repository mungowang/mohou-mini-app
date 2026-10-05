import type { ReactNode } from 'react'
import { Globe, HardDrive, Terminal } from 'lucide-react'

import type { PanelUpdateCheck, PanelUpdateSource } from './client.ts'

/** The source a check named, when it named a complete one. */
export function checkSource(check: PanelUpdateCheck): PanelUpdateSource | undefined {
  if (check.channel === 'registry') return { channel: 'registry', registry: check.registry ?? 'https://registry.npmjs.org' }
  if (check.channel === 'tarball' && check.tarballDir !== undefined) {
    return { channel: 'tarball', tarballDir: check.tarballDir }
  }
  return undefined
}

/**
 * One chip naming where the next update would install from.
 * @param props - the source, and the label lookup
 */
export function UpdateSourceChip(props: {
  readonly source: PanelUpdateSource
  readonly label: (key: string) => string
}): ReactNode {
  const Icon = props.source.channel === 'registry' ? Globe : props.source.channel === 'tarball' ? HardDrive : Terminal
  const title = sourceTitle(props.source)
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none text-muted-foreground"
      {...title.length === 0 ? {} : { title }}
    >
      <Icon size={12} className="shrink-0" aria-hidden />
      <span className="shrink-0">{props.label('update-source')}</span>
      <span className="truncate font-mono">{sourceText(props.source, props.label)}</span>
    </span>
  )
}

function sourceText(source: PanelUpdateSource, label: (key: string) => string): string {
  if (source.channel === 'registry') return hostOf(source.registry)
  if (source.channel === 'tarball') return `${label('update-source-tarball')} · ${collapseHome(source.tarballDir)}`
  return label('update-source-none')
}

/** The full value, for the hover title. Empty when the source is a sentence already. */
function sourceTitle(source: PanelUpdateSource): string {
  if (source.channel === 'registry') return source.registry
  return source.channel === 'tarball' ? source.tarballDir : ''
}

/** `https://registry.npmjs.org/` reads as `registry.npmjs.org`. */
function hostOf(registry: string): string {
  return registry.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** `/Users/name/.mini-app/packages` reads as `~/.mini-app/packages`. */
function collapseHome(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}
