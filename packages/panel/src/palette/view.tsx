import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { GalleryApp } from '../gallery/list.ts'
import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'

import { rankPalette, type PaletteWhy } from './rank.ts'

/** One open panel tab shown on the palette rail. */
export interface PaletteOpenTab {
  readonly key: string
  readonly title: string
  readonly kind: 'gallery' | 'app' | 'market'
  readonly appId?: string
}

/**
 * Full-window mask and the command field. The library search box opens this; it does not filter the grid.
 * Search stays first focus. Open tabs sit on a numbered rail under the field; Ctrl+Shift+←/→ moves that rail.
 * @param props - the current list and the open tabs
 */
export function CommandPalette(props: {
  readonly apps: readonly GalleryApp[]
  readonly openIds: ReadonlySet<string>
  readonly openTabs: readonly PaletteOpenTab[]
  readonly activeOpenIndex: number
  readonly currentId?: string
  readonly error?: string
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly onClose: () => void
  readonly onOpen: (app: GalleryApp) => void
  readonly onLibrary: () => void
  readonly onSelectOpenTab: (index: number) => void
  readonly onRegisterTabNav?: (navigate: ((direction: 'prev' | 'next') => void) | undefined) => void
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [openFocus, setOpenFocus] = useState(() => clampIndex(props.activeOpenIndex, props.openTabs.length))
  const [zone, setZone] = useState<'list' | 'open'>('list')
  const field = useRef<HTMLInputElement>(null)
  const openFocusRef = useRef(openFocus)
  openFocusRef.current = openFocus
  const rows = rankPalette(props.apps, query, props.openIds, [
    panelText('en', 'palette-library', props.mode),
    panelText('zh-CN', 'palette-library', props.mode),
  ])
  const selected = Math.min(cursor, Math.max(rows.length - 1, 0))

  useEffect(() => { field.current?.focus() }, [])

  useEffect(() => {
    setOpenFocus(clampIndex(props.activeOpenIndex, props.openTabs.length))
  }, [props.activeOpenIndex, props.openTabs.length])

  function syncListFromOpen(index: number) {
    const tab = props.openTabs[index]
    if (tab === undefined) return
    if (tab.kind === 'gallery') {
      const at = rows.findIndex(row => row.kind === 'library')
      if (at >= 0) setCursor(at)
      return
    }
    if (tab.kind === 'app' && tab.appId !== undefined) {
      const at = rows.findIndex(row => row.kind === 'app' && row.hit.app.id === tab.appId)
      if (at >= 0) setCursor(at)
    }
  }

  function moveOpen(direction: 'prev' | 'next') {
    const total = props.openTabs.length
    if (total === 0) return
    const delta = direction === 'next' ? 1 : -1
    const next = (openFocusRef.current + delta + total) % total
    setOpenFocus(next)
    setZone('open')
    syncListFromOpen(next)
  }

  const moveOpenRef = useRef(moveOpen)
  moveOpenRef.current = moveOpen
  useEffect(() => {
    const navigate = (direction: 'prev' | 'next') => { moveOpenRef.current(direction) }
    props.onRegisterTabNav?.(navigate)
    return () => props.onRegisterTabNav?.(undefined)
  }, [props.onRegisterTabNav])

  function choose(index: number) {
    const row = rows[index]
    if (row === undefined) return
    if (row.kind === 'library') props.onLibrary()
    else props.onOpen(row.hit.app)
  }

  function confirm() {
    if (zone === 'open') {
      if (props.openTabs[openFocus] !== undefined) props.onSelectOpenTab(openFocus)
      return
    }
    choose(selected)
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
            onChange={(event) => { setQuery(event.target.value); setCursor(0); setZone('list') }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose() }
              else if (event.key === 'ArrowLeft' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault()
                moveOpen('prev')
              }
              else if (event.key === 'ArrowRight' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault()
                moveOpen('next')
              }
              else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setZone('list')
                setCursor(Math.min(selected + 1, Math.max(rows.length - 1, 0)))
              }
              else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setZone('list')
                setCursor(Math.max(selected - 1, 0))
              }
              else if (event.key === 'Enter') { event.preventDefault(); confirm() }
            }}
          />
        </div>
        {props.openTabs.length > 0 ? (
          <OpenTabsRail
            tabs={props.openTabs}
            focus={openFocus}
            label={label}
            onFocus={(index) => {
              setOpenFocus(index)
              setZone('open')
              syncListFromOpen(index)
            }}
            onPick={index => props.onSelectOpenTab(index)}
            onStep={moveOpen}
          />
        ) : null}
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
                  onPoint={() => { setCursor(index); setZone('list') }}
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
                onPoint={() => { setCursor(index); setZone('list') }}
              />
            )
          }) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3.5 py-2 text-[11px] text-muted-foreground">
          <span>{label('palette-open-move')}</span>
          <span>{label('palette-move')}</span>
          <span>{label('palette-enter')}</span>
          <span>{label('palette-esc')}</span>
        </div>
      </div>
    </div>
  )
}

function OpenTabsRail(props: {
  readonly tabs: readonly PaletteOpenTab[]
  readonly focus: number
  readonly label: (key: string) => string
  readonly onFocus: (index: number) => void
  readonly onPick: (index: number) => void
  readonly onStep: (direction: 'prev' | 'next') => void
}): ReactNode {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => {
    const node = itemRefs.current[props.focus]
    if (node !== null && node !== undefined && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [props.focus])
  return (
    <div data-palette-open-tabs="" className="border-b bg-foreground/[0.025] px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between px-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span>{props.label('palette-open-tabs')}</span>
        <span className="font-medium tracking-normal normal-case text-muted-foreground/80">{props.label('palette-open-keys')}</span>
      </div>
      <div className="flex items-center gap-1 rounded-[10px] border border-border/80 bg-background/40 p-1">
        <button
          type="button"
          data-palette-open-prev=""
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background/60 text-muted-foreground hover:text-foreground"
          aria-label={props.label('palette-tab-prev')}
          onMouseDown={(event) => { event.preventDefault(); props.onStep('prev') }}
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {props.tabs.map((tab, index) => {
            const on = index === props.focus
            return (
              <button
                key={tab.key}
                type="button"
                ref={(node) => { itemRefs.current[index] = node }}
                data-palette-open-tab=""
                data-on={on ? '' : undefined}
                className={on
                  ? 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-semibold text-accent-foreground'
                  : 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70 hover:text-foreground'}
                onMouseDown={(event) => {
                  event.preventDefault()
                  props.onPick(index)
                }}
                onMouseMove={() => props.onFocus(index)}
              >
                <span className={on
                  ? 'grid size-3.5 place-items-center rounded-[4px] bg-accent-foreground/20 text-[9.5px] leading-none'
                  : 'grid size-3.5 place-items-center rounded-[4px] bg-foreground/10 text-[9.5px] leading-none text-muted-foreground'}>
                  {index + 1}
                </span>
                <span className="max-w-[7.5rem] truncate">{tab.title}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          data-palette-open-next=""
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background/60 text-muted-foreground hover:text-foreground"
          aria-label={props.label('palette-tab-next')}
          onMouseDown={(event) => { event.preventDefault(); props.onStep('next') }}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
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
  // muted-foreground and a foreground wash assume the card. A light accent hides both.
  const quiet = props.on ? 'text-accent-foreground/80' : 'text-muted-foreground'
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
      <span className={props.on
        ? 'grid size-7 place-items-center rounded-md bg-accent-foreground text-[11px] font-semibold text-accent'
        : 'grid size-7 place-items-center rounded-md bg-foreground/8 text-[11px] font-semibold'}>{props.mark}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{props.name}</span>
        <span className={`block truncate text-xs ${quiet}`}>{props.detail}</span>
        {props.why === undefined ? null : <span className={`block text-[11px] ${quiet}`}>{props.why}</span>}
      </span>
      <span className={`text-[11px] ${quiet}`}>{props.meta}</span>
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

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}
