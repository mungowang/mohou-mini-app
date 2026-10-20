import { Download, Hash, Loader2, Package, PackageSearch, Store, Tag, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { MarketList, MarketPack, MarketRow } from '../gallery/client.ts'
import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { ThemePreviewCard } from '../theme/card.tsx'
import type { ThemeDualTokens } from '../theme/preview.tsx'

/**
 * Market tab. Apps and themes are separate grids. The card click confirms before a replace.
 * @param props - catalog client and chrome locale
 */
export function MarketView(props: {
  readonly list?: (() => Promise<MarketList>) | undefined
  readonly install?: ((id: string, confirm: boolean) => Promise<void>) | undefined
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  /** Bumped when chrome asks for a refresh, so the catalog is read again. */
  readonly refreshTick?: number
  /** Fires when a catalog read settles, including the chrome-driven refresh. */
  readonly onCatalogSettled?: () => void
  readonly onInstalled: () => void
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const [rows, setRows] = useState<readonly MarketRow[]>([])
  const [packs, setPacks] = useState<readonly MarketPack[]>([])
  const [error, setError] = useState<string>()
  const [kind, setKind] = useState<'app' | 'theme'>('app')
  const [filter, setFilter] = useState('all')
  const [status, setStatus] = useState<'all' | 'missing' | 'update' | 'installed'>('all')
  const [tag, setTag] = useState<string>()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string>()
  const [busy, setBusy] = useState<string>()
  // Optimistic mark until a catalog read lands. A later read clears it so a new catalog version can show Update.
  const [done, setDone] = useState<string>()
  const [loading, setLoading] = useState(false)
  const loadGeneration = useRef(0)

  function load(): void {
    if (props.list === undefined) {
      setError(label('market-unavailable'))
      props.onCatalogSettled?.()
      return
    }
    const generation = loadGeneration.current + 1
    loadGeneration.current = generation
    setLoading(true)
    void props.list().then((next) => {
      if (generation !== loadGeneration.current) return
      setRows(next.rows)
      setPacks(next.packs)
      // Host answer owns the install button. Keep `done` only while this read is still in flight.
      setDone(undefined)
      setError(undefined)
      if (!next.rows.some(row => row.kind === 'app') && next.rows.some(row => row.kind === 'theme')) setKind('theme')
    }).catch((failure) => {
      if (generation !== loadGeneration.current) return
      setError(failure instanceof Error ? failure.message : label('market-failed'))
    }).finally(() => {
      if (generation !== loadGeneration.current) return
      setLoading(false)
      props.onCatalogSettled?.()
    })
  }

  useEffect(() => { load() }, [props.list, props.refreshTick])

  const kinds = useMemo(() => {
    const set = new Set(rows.map(row => row.kind))
    return [...set]
  }, [rows])

  // Bundles come from Host and already hold only packs with a visible row. No hue bucket remains.

  const byKind = useMemo(() => rows.filter(row => row.kind === kind), [rows, kind])
  const byStatus = useMemo(() => byKind.filter(row => matchesStatus(row, status)), [byKind, status])
  const byType = useMemo(() => byStatus.filter(row => matchesType(row, kind, filter)), [byStatus, kind, filter])

  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const row of byType) {
      if (row.kind !== 'app') continue
      for (const item of row.tags ?? []) set.add(item)
    }
    return [...set].sort()
  }, [byType])

  const kindCount = useMemo(() => {
    let apps = 0
    let themes = 0
    for (const row of rows) {
      if (row.kind === 'app') apps += 1
      else themes += 1
    }
    return { apps, themes }
  }, [rows])

  const statusCount = useMemo(() => {
    let missing = 0
    let update = 0
    let installed = 0
    for (const row of byKind) {
      const state = installState(row)
      if (state === 'missing') missing += 1
      else if (state === 'update') update += 1
      else installed += 1
    }
    return { all: byKind.length, missing, update, installed }
  }, [byKind])

  const typeCount = useMemo(() => {
    const byPack = new Map<string, number>()
    let none = 0
    let mini = 0
    let workbench = 0
    for (const row of byStatus) {
      if (row.kind === 'theme') {
        if (row.themePackId === undefined) none += 1
        else byPack.set(row.themePackId, (byPack.get(row.themePackId) ?? 0) + 1)
        continue
      }
      if (row.appKind === 'workbench') workbench += 1
      else mini += 1
    }
    return { all: byStatus.length, mini, workbench, byPack, none }
  }, [byStatus])

  const tagCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of byType) {
      for (const item of row.tags ?? []) counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    return { all: byType.length, counts }
  }, [byType])

  const visible = byType
    .filter(row => tag === undefined || row.tags?.includes(tag) === true)
    .filter(row => matchesQuery(row, query))

  async function run(row: MarketRow, confirm: boolean) {
    if (props.install === undefined) return
    setBusy(row.id)
    setPending(undefined)
    setError(undefined)
    try {
      await props.install(row.id, confirm)
      setDone(row.id)
      // The lock is on disk now, so the rows and the filter counts are read again.
      load()
      props.onInstalled()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : label('market-failed'))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="h-full overflow-auto px-8 py-8" data-market="">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {label('market')}
          {loading && rows.length > 0 ? <Loader2 size={16} className="animate-spin text-muted-foreground" aria-label={label('market-refreshing')} /> : null}
        </h1>
        <input
          className="h-9 w-56 rounded-lg border bg-background px-3 text-sm text-foreground outline-none"
          value={query}
          placeholder={label('market-search')}
          onChange={event => setQuery(event.target.value)}
          data-market-search=""
        />
      </div>
      {error === undefined ? null : <p className="mt-4 text-sm text-destructive" data-market-error="">{error}</p>}
      <div className="mt-6 space-y-4" data-market-filters="">
        {kinds.length > 1 ? (
          <FilterRow caption={label('market-filter-kind')} level="primary">
            <Seg
              active={kind === 'app'}
              level="primary"
              count={kindCount.apps}
              onClick={() => { setKind('app'); setFilter('all'); setTag(undefined) }}
            >
              {label('market-apps')}
            </Seg>
            <Seg
              active={kind === 'theme'}
              level="primary"
              count={kindCount.themes}
              onClick={() => { setKind('theme'); setFilter('all'); setTag(undefined) }}
            >
              {label('market-themes')}
            </Seg>
          </FilterRow>
        ) : null}
        <FilterRow caption={label('market-filter-status')} level="secondary">
          <Seg active={status === 'all'} level="secondary" count={statusCount.all} onClick={() => setStatus('all')}>{label('market-status-all')}</Seg>
          <Seg active={status === 'missing'} level="secondary" count={statusCount.missing} onClick={() => setStatus('missing')}>{label('market-status-missing')}</Seg>
          <Seg active={status === 'update'} level="secondary" count={statusCount.update} onClick={() => setStatus('update')}>{label('market-status-update')}</Seg>
          <Seg active={status === 'installed'} level="secondary" count={statusCount.installed} onClick={() => setStatus('installed')}>{label('market-status-installed')}</Seg>
        </FilterRow>
        <FilterRow caption={kind === 'theme' ? label('market-filter-pack') : label('market-filter-type')} level="secondary">
          <Seg active={filter === 'all'} level="secondary" count={typeCount.all} onClick={() => setFilter('all')}>{label('market-all')}</Seg>
          {kind === 'app' ? (
            <>
              <Seg active={filter === 'app'} level="secondary" count={typeCount.mini} onClick={() => setFilter('app')}>{label('market-mini')}</Seg>
              <Seg active={filter === 'workbench'} level="secondary" count={typeCount.workbench} onClick={() => setFilter('workbench')}>{label('market-workbench')}</Seg>
            </>
          ) : (
            <>
              {packs.map(pack => (
                <Seg key={pack.id} active={filter === pack.id} level="secondary" count={typeCount.byPack.get(pack.id) ?? 0} onClick={() => setFilter(pack.id)}>{packLabel(props.locale, pack)}</Seg>
              ))}
              {/* An empty group is not offered, the same rule a bundle follows. */}
              {typeCount.none > 0 ? (
                <Seg active={filter === UNGROUPED} level="secondary" count={typeCount.none} onClick={() => setFilter(UNGROUPED)}>{label('market-pack-none')}</Seg>
              ) : null}
            </>
          )}
        </FilterRow>
        {kind === 'app' && tags.length > 0 ? (
          <FilterRow caption={label('market-filter-tags')} level="tertiary">
            <Seg active={tag === undefined} level="tertiary" count={tagCount.all} onClick={() => setTag(undefined)}>{label('market-all')}</Seg>
            {tags.map(item => (
              <Seg key={item} active={tag === item} level="tertiary" count={tagCount.counts.get(item) ?? 0} onClick={() => setTag(item)}>{item}</Seg>
            ))}
          </FilterRow>
        ) : null}
      </div>
      {visible.length === 0 && error === undefined ? (
        <EmptyState
          label={label}
          filtered={rows.some(row => row.kind === kind)}
          onClear={() => {
            setStatus('all')
            setFilter('all')
            setTag(undefined)
            setQuery('')
          }}
        />
      ) : (
        <div className="mt-7 grid grid-cols-2 gap-5">
          {visible.map(row => (
            <Card
              key={row.id}
              row={row}
              locale={props.locale}
              pending={pending === row.id}
              busy={busy === row.id}
              done={done === row.id}
              label={label}
              onAsk={() => setPending(row.id)}
              onCancel={() => setPending(undefined)}
              onRun={confirm => void run(row, confirm)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState(props: {
  readonly label: (key: string) => string
  readonly filtered: boolean
  readonly onClear: () => void
}): ReactNode {
  return (
    <div className="mt-16 flex flex-col items-center justify-center px-6 py-10 text-center" data-market-empty="">
      <div className="relative mb-5 flex size-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-muted/70" />
        <span className="absolute inset-3 rounded-full border border-dashed border-border/80" />
        <PackageSearch size={40} strokeWidth={1.5} className="relative text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="m-0 text-base font-semibold tracking-tight text-foreground">
        {props.filtered ? props.label('market-empty-filtered') : props.label('market-empty')}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {props.filtered ? props.label('market-empty-filtered-hint') : props.label('market-empty-hint')}
      </p>
      {props.filtered ? (
        <button
          type="button"
          className="mt-5 rounded-full border bg-background px-4 py-1.5 text-sm text-foreground hover:bg-muted"
          onClick={props.onClear}
        >
          {props.label('market-empty-clear')}
        </button>
      ) : null}
    </div>
  )
}

function Card(props: {
  readonly row: MarketRow
  readonly locale: PanelLocale
  readonly pending: boolean
  readonly busy: boolean
  readonly done: boolean
  readonly label: (key: string) => string
  readonly onAsk: () => void
  readonly onCancel: () => void
  readonly onRun: (confirm: boolean) => void
}): ReactNode {
  const row = props.row
  const notice = row.modified === true
    ? props.label('market-overwrite')
    : row.tracked === false
      ? props.label('market-untracked')
      : undefined
  const noticeExtra = row.tracked === false && row.localVersion !== undefined
    ? props.label('market-local-version').replace('{v}', row.localVersion)
    : undefined
  // Theme cards share ThemePreviewCard with Settings. App cards keep the prose-first layout.
  if (row.kind === 'theme') {
    const tokens = marketPreviewTokens(row)
    return (
      <ThemePreviewCard
        key={row.id}
        data-market-card={row.id}
        title={rowLabel(props.locale, row, 'name')}
        description={rowLabel(props.locale, row, 'description')}
        badge={<SourceIcon source={row.source} label={props.label} />}
        headerEnd={(
          <>
            {notice === undefined ? null : (
              <span className="max-w-24 truncate text-right text-[11px] leading-snug text-muted-foreground" title={[notice, noticeExtra].filter(Boolean).join(' · ')} data-market-notice="">
                {row.tracked === false ? props.label('market-untracked-short') : props.label('market-overwrite-short')}
              </span>
            )}
            <Action {...props} />
          </>
        )}
        {...(tokens === undefined ? {} : { tokens })}
        {...(row.colors === undefined ? {} : { colors: row.colors })}
        lightLabel={props.label('market-light')}
        darkLabel={props.label('market-dark')}
        primaryLabel={props.label('market-preview-primary')}
        secondaryLabel={props.label('market-preview-secondary')}
        footer={(
          <span className="contents" data-market-meta="">
            <span className="tabular-nums">{`v${row.version}`}</span>
            {row.official === true ? <OfficialMark label={props.label('market-official')} /> : null}
            <span className="inline-flex min-w-0 items-center gap-1" data-market-id={row.id}>
              <Hash size={11} strokeWidth={2} className="shrink-0 opacity-70" aria-label={props.label('market-id')} />
              <span className="truncate font-mono text-[10.5px]">{row.id}</span>
            </span>
            {noticeExtra === undefined ? null : <span className="truncate text-[10.5px]">{noticeExtra}</span>}
            {row.downloads === undefined ? null : (
              <span className="ml-auto inline-flex items-center gap-1 tabular-nums">
                <Download size={11} strokeWidth={2} />
                {row.downloads}
              </span>
            )}
          </span>
        )}
      />
    )
  }

  return (
    <article key={row.id} className="flex min-h-44 flex-col rounded-2xl border bg-card px-5 pt-4" data-market-card={row.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="m-0 truncate text-lg font-semibold tracking-tight">{rowLabel(props.locale, row, 'name')}</h2>
            <SourceIcon source={row.source} label={props.label} />
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1" data-market-id={row.id}>
              <Hash size={12} strokeWidth={2} className="shrink-0 opacity-70" aria-label={props.label('market-id')} />
              <span className="truncate font-mono text-[11px]">{row.id}</span>
            </span>
            {row.author === undefined ? null : (
              <span className="inline-flex min-w-0 items-center gap-1">
                <User size={12} strokeWidth={2} className="shrink-0 opacity-70" aria-label={props.label('market-author')} />
                <span className="truncate">{row.author}</span>
                {row.official === true ? <OfficialMark label={props.label('market-official')} /> : null}
              </span>
            )}
            {row.author === undefined && row.official === true ? (
              <OfficialMark label={props.label('market-official')} />
            ) : null}
          </div>
          {row.appKind === 'workbench' ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">{props.label('market-workbench')}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {notice === undefined ? null : (
            <span className="max-w-28 truncate text-right text-[11px] leading-snug text-muted-foreground" title={[notice, noticeExtra].filter(Boolean).join(' · ')} data-market-notice="">
              {row.tracked === false ? props.label('market-untracked-short') : props.label('market-overwrite-short')}
            </span>
          )}
          <Action {...props} />
        </div>
      </div>
      <p className="mt-2.5 text-sm leading-6 text-foreground/90">{rowLabel(props.locale, row, 'description')}</p>
      {row.tags === undefined || row.tags.length === 0 ? null : (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-5 text-muted-foreground">
          <Tag size={13} strokeWidth={2} className="shrink-0 opacity-70" aria-label={props.label('market-topics')} />
          {row.tags.map((tag, index) => (
            <span key={tag} className="inline-flex items-center">
              {index > 0 ? <span className="mr-1.5 text-muted-foreground/35" aria-hidden="true">·</span> : null}
              <span>{tag}</span>
            </span>
          ))}
        </p>
      )}
      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 border-t border-border/70 pt-3 pb-3 text-xs text-muted-foreground" data-market-meta="">
          <span className="tabular-nums">{`v${row.version}`}</span>
          {row.requires === undefined ? null : (
            <span className="rounded-md border border-border/80 px-1.5 py-0.5 text-[11px] tabular-nums">{`mohou ≥ ${row.requires}`}</span>
          )}
          {noticeExtra === undefined ? null : <span className="text-[11px]">{noticeExtra}</span>}
          {row.downloads === undefined ? null : (
            <span className="ml-auto inline-flex items-center gap-1 tabular-nums">
              <Download size={12} strokeWidth={2} />
              {row.downloads}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

function Action(props: {
  readonly row: MarketRow
  readonly pending: boolean
  readonly busy: boolean
  readonly done: boolean
  readonly label: (key: string) => string
  readonly onAsk: () => void
  readonly onCancel: () => void
  readonly onRun: (confirm: boolean) => void
}): ReactNode {
  if (props.busy) {
    return <button type="button" className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background" disabled>{props.label('market-installing')}</button>
  }
  // Market lock equal to catalog version. A directory without a lock is not "installed" here.
  if (props.done || (props.row.tracked === true && props.row.installedVersion === props.row.version && props.row.modified !== true)) {
    return <button type="button" className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground" disabled>{props.label('market-installed')}</button>
  }
  if (props.row.installable === false) {
    return <button type="button" className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground" disabled>{props.label('market-requires')}</button>
  }
  const needsConfirm = props.row.modified === true || props.row.tracked === false
  const update = props.row.tracked === true && props.row.installedVersion !== undefined
  if (props.pending) {
    return (
      <span className="flex items-center gap-2">
        <button type="button" className="text-sm text-muted-foreground" onClick={props.onCancel}>{props.label('market-cancel')}</button>
        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-sm text-background" onClick={() => props.onRun(true)}>
          <Download size={14} />
          {props.label('market-confirm')}
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-sm text-background"
      onClick={() => needsConfirm ? props.onAsk() : props.onRun(false)}
    >
      {update ? null : <Download size={14} />}
      {update ? props.label('market-update') : props.row.tracked === false ? props.label('market-replace') : props.label('market-install')}
    </button>
  )
}

function marketPreviewTokens(row: MarketRow): ThemeDualTokens | undefined {
  if (row.preview !== undefined) return row.preview
  if (row.colors === undefined || row.colors.length < 4) return undefined
  const [lp, lb, dp, db] = row.colors
  if (lp === undefined || lb === undefined || dp === undefined || db === undefined) return undefined
  return {
    light: { primary: lp, background: lb, foreground: lp },
    dark: { primary: dp, background: db, foreground: dp },
  }
}

function SourceIcon(props: {
  readonly source: MarketRow['source']
  readonly label: (key: string) => string
}): ReactNode {
  if (props.source === 'local') {
    const text = props.label('market-source-local')
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md border border-border/80 px-1 py-0.5 text-muted-foreground"
        title={text}
        aria-label={text}
      >
        <Package size={11} strokeWidth={2} />
        <span className="text-[10px] leading-none font-medium">{text}</span>
      </span>
    )
  }
  const text = props.label('market-source-npm')
  return (
    <span className="inline-flex text-muted-foreground" title={text} aria-label={text}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3 3h18v18H3V3zm2.25 2.25v13.5h6.75V8.25H15v10.5h3.75V5.25H5.25z" />
      </svg>
    </span>
  )
}

function OfficialMark(props: { readonly label: string }): ReactNode {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-muted-foreground/80"
      title={props.label}
      aria-label={props.label}
    >
      <span className="inline-flex size-3 items-center justify-center rounded-full border border-current text-[7px] leading-none">M</span>
      <span className="text-[10px] leading-none">{props.label}</span>
    </span>
  )
}

function matchesQuery(row: MarketRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  const hay = [row.name, row.nameZh, row.description, row.descriptionZh, row.id, ...(row.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(needle)
}

/** Install state from the market lock. Untracked local copies count as missing. */
function matchesStatus(row: MarketRow, status: 'all' | 'missing' | 'update' | 'installed'): boolean {
  if (status === 'all') return true
  return installState(row) === status
}

/** Filter value for theme rows that no pack claims. Never a pack id: those match `^[a-z0-9-]+$`. */
const UNGROUPED = '__ungrouped__'

function matchesType(row: MarketRow, kind: 'app' | 'theme', filter: string): boolean {
  if (filter === 'all') return true
  if (kind === 'app' && filter === 'workbench') return row.appKind === 'workbench'
  if (kind === 'app' && filter === 'app') return row.appKind !== 'workbench'
  if (filter === UNGROUPED) return row.themePackId === undefined
  return row.themePackId === filter
}

/** Theme/app row labels: zh fields win under zh-CN when present. */
function rowLabel(locale: PanelLocale, row: MarketRow, field: 'name' | 'description'): string {
  if (locale === 'zh-CN') {
    if (field === 'name' && row.nameZh !== undefined && row.nameZh.length > 0) return row.nameZh
    if (field === 'description' && row.descriptionZh !== undefined && row.descriptionZh.length > 0) return row.descriptionZh
  }
  return field === 'name' ? row.name : row.description
}

/** Pack names are catalog data, so they keep the palette-label rule: zh first when present. */
function packLabel(locale: PanelLocale, pack: MarketPack): string {
  if (locale === 'zh-CN' && pack.nameZh !== undefined && pack.nameZh.length > 0) return pack.nameZh
  return pack.name
}

function installState(row: MarketRow): 'missing' | 'update' | 'installed' {
  if (row.tracked !== true || row.installedVersion === undefined) return 'missing'
  if (row.installedVersion === row.version && row.modified !== true) return 'installed'
  return 'update'
}

function FilterRow(props: {
  readonly caption: string
  readonly level: 'primary' | 'secondary' | 'tertiary'
  readonly children: ReactNode
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-market-filter={props.level}>
      <span className={`w-10 shrink-0 text-[11px] tracking-wide ${props.level === 'primary' ? 'font-semibold text-foreground/80' : 'font-medium text-muted-foreground'}`}>
        {props.caption}
      </span>
      <div className={props.level === 'primary'
        ? 'flex flex-wrap gap-1 rounded-xl bg-muted/70 p-1'
        : 'flex flex-wrap gap-1.5'}
      >
        {props.children}
      </div>
    </div>
  )
}

function Seg(props: {
  readonly active: boolean
  readonly level: 'primary' | 'secondary' | 'tertiary'
  readonly count?: number
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactNode {
  const count = props.count === undefined ? null : (
    <span className={`tabular-nums ${props.active ? 'opacity-80' : 'opacity-55'}`}>
      {props.count}
    </span>
  )
  if (props.level === 'primary') {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${props.active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={props.onClick}
      >
        <span>{props.children}</span>
        {count}
      </button>
    )
  }
  if (props.level === 'secondary') {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors ${props.active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        onClick={props.onClick}
      >
        <span>{props.children}</span>
        {count}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${props.active ? 'border-foreground/20 bg-muted text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}
      onClick={props.onClick}
    >
      <span>{props.children}</span>
      {count}
    </button>
  )
}

export function MarketIcon(): ReactNode {
  return <Store size={16} strokeWidth={2} />
}
