import { LayoutGrid } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { GalleryApp } from '../gallery/list.ts'
import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { rankPalette, type PaletteWhy } from './rank.ts'

/**
 * Full-window mask and the command field. The library search box opens this; it does not filter the grid.
 * @param props - the current list and the open tabs
 */
export function CommandPalette(props: {
  readonly apps: readonly GalleryApp[]
  readonly openIds: ReadonlySet<string>
  readonly currentId?: string
  readonly error?: string
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly onClose: () => void
  readonly onOpen: (app: GalleryApp) => void
  readonly onLibrary: () => void
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const rows = rankPalette(props.apps, query, props.openIds, [
    panelText('en', 'palette-library', props.mode),
    panelText('zh-CN', 'palette-library', props.mode),
  ])
  const selected = Math.min(cursor, Math.max(rows.length - 1, 0))

  useEffect(() => { field.current?.focus() }, [])

  function choose(index: number) {
    const row = rows[index]
    if (row === undefined) return
    if (row.kind === 'library') props.onLibrary()
    else props.onOpen(row.hit.app)
  }

  return (
    <div
      data-palette=""
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}
    >
      <div
        role="dialog"
        aria-label={label('palette-placeholder')}
        className="mx-auto mt-[14vh] w-[min(580px,calc(100vw-32px))] overflow-hidden rounded-xl border bg-card shadow-lg"
      >
        <div className="flex items-center gap-3 border-b px-3.5 py-3">
          <input
            ref={field}
            data-palette-query=""
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            placeholder={label('palette-placeholder')}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => { setQuery(event.target.value); setCursor(0) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose() }
              else if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(Math.min(selected + 1, Math.max(rows.length - 1, 0))) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(Math.max(selected - 1, 0)) }
              else if (event.key === 'Enter') { event.preventDefault(); choose(selected) }
            }}
          />
        </div>
        <div className="max-h-96 overflow-auto p-1.5">
          {props.error !== undefined ? <p className="px-2 py-6 text-center text-sm text-destructive">{props.error}</p> : null}
          {props.error === undefined && rows.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">{label('palette-empty')}</p> : null}
          {props.error === undefined ? rows.map((row, index) => {
            const on = index === selected
            if (row.kind === 'library') {
              return (
                <PaletteRow
                  key="library"
                  on={on}
                  mark={<LayoutGrid size={14} strokeWidth={2} />}
                  name={label('palette-library')}
                  detail={label('palette-library-hint')}
                  meta={label('palette-page')}
                  onPick={() => choose(index)}
                  onPoint={() => setCursor(index)}
                />
              )
            }
            const app = row.hit.app
            const meta = props.currentId === app.id
              ? label('palette-current')
              : props.openIds.has(app.id) ? label('palette-open') : ''
            return (
              <PaletteRow
                key={app.id}
                on={on}
                mark={app.acronym.slice(0, 2)}
                name={app.name}
                detail={app.description}
                {...query.trim().length === 0 ? {} : { why: label(whyKey(row.hit.why)) }}
                meta={meta}
                onPick={() => choose(index)}
                onPoint={() => setCursor(index)}
              />
            )
          }) : null}
        </div>
        <div className="flex gap-4 border-t px-3.5 py-2 text-[11px] text-muted-foreground">
          <span>{label('palette-move')}</span>
          <span>{label('palette-enter')}</span>
          <span>{label('palette-esc')}</span>
        </div>
      </div>
    </div>
  )
}

function PaletteRow(props: {
  readonly on: boolean
  readonly mark: ReactNode
  readonly name: string
  readonly detail: string
  readonly why?: string
  readonly meta: string
  readonly onPick: () => void
  readonly onPoint: () => void
}): ReactNode {
  return (
    <button
      type="button"
      data-palette-row=""
      data-on={props.on ? '' : undefined}
      className={props.on
        ? 'grid w-full grid-cols-[28px_1fr_auto] items-center gap-2.5 rounded-lg bg-accent px-2 py-2 text-left text-accent-foreground'
        : 'grid w-full grid-cols-[28px_1fr_auto] items-center gap-2.5 rounded-lg px-2 py-2 text-left'}
      onMouseDown={(event) => { event.preventDefault(); props.onPick() }}
      onMouseMove={props.onPoint}
    >
      <span className="grid size-7 place-items-center rounded-md bg-foreground/8 text-[11px] font-semibold">{props.mark}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{props.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{props.detail}</span>
        {props.why === undefined ? null : <span className="block text-[11px] text-muted-foreground">{props.why}</span>}
      </span>
      <span className="text-[11px] text-muted-foreground">{props.meta}</span>
    </button>
  )
}

function whyKey(why: PaletteWhy): string {
  if (why === 'acronym') return 'palette-why-acronym'
  if (why === 'id') return 'palette-why-id'
  if (why === 'description') return 'palette-why-description'
  if (why === 'tag') return 'palette-why-tag'
  if (why === 'pinyin') return 'palette-why-pinyin'
  if (why === 'initials') return 'palette-why-initials'
  if (why === 'version') return 'palette-why-version'
  return 'palette-why-name'
}
