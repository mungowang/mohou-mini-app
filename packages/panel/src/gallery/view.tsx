import { WorkbenchLibrary, workbenchEntries } from '@mohou/app-view'
import { ArrowUpRight, Palette, Pin, RefreshCw, Search, Settings, Trash2 } from 'lucide-react'
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactElement, type ReactNode } from 'react'

import type { PanelLabelMode, PanelLocale } from '../labels.ts'
import { panelText } from '../labels.ts'
import { Dialog } from '../ui/dialog.tsx'
import { Tooltip } from '../ui/tooltip.tsx'
import { readCardStyle, writeCardStyle } from './card-style.ts'
import { DeskBar } from './desk.tsx'
import type { PanelClient } from './client.ts'
import { type GalleryApp, galleryCardStyles, isGalleryCardStyle, type GalleryCardStyle, type GalleryKind } from './list.ts'
import { loadGallery,
  loadTrash,
  galleryState,
  reduceGallery,
  viewKind,
  visibleApps,
  type GalleryAction,
  type PanelShell,
  type GalleryState } from './state.ts'

/** What settings needs from the gallery. Card style is panel-local. */
export interface GalleryChrome {
  readonly cardStyle: GalleryCardStyle
  setCard(style: GalleryCardStyle): void
}

export type ThemeSlot = ReactNode | ((app: { readonly id: string; readonly title: string } | undefined) => ReactNode)

function themeNode(theme: ThemeSlot | undefined, app: { readonly id: string; readonly title: string } | undefined): ReactNode {
  if (typeof theme === 'function') return theme(app)
  return theme
}

/**
 * Gallery and tabs. The frame contents are injected. This package does not name a host route.
 * @param props - client, chrome locale, and who embeds the panel
 */
export function PanelGallery(props: {
  readonly client: PanelClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly shell: PanelShell
  readonly frame?: (appId: string) => ReactNode
  readonly focus?: { readonly appId: string; readonly title?: string }
  readonly onClosePanel?: () => void
  readonly tools?: ReactNode
  readonly themeOpen?: boolean
  readonly onToggleTheme?: () => void
  readonly theme?: ThemeSlot
  readonly onToggleSettings?: () => void
  readonly overlay?: (chrome: GalleryChrome) => ReactNode
  readonly defaultWorkbenchId?: string
  readonly onSetDefaultWorkbench?: (id: string) => void
}): ReactNode {
  const [state, dispatch] = useReducer(reduceGallery, props.shell, (shell: PanelShell) => ({
    ...galleryState(shell),
    cardStyle: readCardStyle(),
  }))
  useEffect(() => {
    void loadGallery(props.client, dispatch)
    void loadTrash(props.client, dispatch)
  }, [props.client])
  useEffect(() => {
    if (props.focus === undefined) return
    dispatch({ type: 'open', appId: props.focus.appId, ...props.focus.title === undefined ? {} : { title: props.focus.title } })
  }, [props.focus])
  return (
    <GalleryBody
      state={state}
      dispatch={dispatch}
      client={props.client}
      locale={props.locale}
      mode={props.mode}
      {...props.frame === undefined ? {} : { frame: props.frame }}
      {...props.onClosePanel === undefined ? {} : { onClosePanel: props.onClosePanel }}
      {...props.tools === undefined ? {} : { tools: props.tools }}
      {...props.themeOpen === undefined ? {} : { themeOpen: props.themeOpen }}
      {...props.onToggleTheme === undefined ? {} : { onToggleTheme: props.onToggleTheme }}
      {...props.theme === undefined ? {} : { theme: props.theme }}
      {...props.onToggleSettings === undefined ? {} : { onToggleSettings: props.onToggleSettings }}
      {...props.defaultWorkbenchId === undefined ? {} : { defaultWorkbenchId: props.defaultWorkbenchId }}
      {...props.onSetDefaultWorkbench === undefined ? {} : { onSetDefaultWorkbench: props.onSetDefaultWorkbench }}
      {...props.overlay === undefined ? {} : { overlay: props.overlay({ cardStyle: state.cardStyle, setCard: (style) => { writeCardStyle(style); dispatch({ type: 'card', cardStyle: style }) } }) }}
    />
  )
}

/** Render one view state. Tests pass a state instead of waiting for an effect. */
export function GalleryBody(props: {
  readonly state: GalleryState
  readonly dispatch: (action: GalleryAction) => void
  readonly client: PanelClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly frame?: (appId: string) => ReactNode
  readonly onClosePanel?: () => void
  readonly tools?: ReactNode
  readonly themeOpen?: boolean
  readonly onToggleTheme?: () => void
  readonly theme?: ThemeSlot
  readonly onToggleSettings?: () => void
  readonly overlay?: ReactNode
  readonly defaultWorkbenchId?: string
  readonly onSetDefaultWorkbench?: (id: string) => void
}): ReactNode {
  const { state, dispatch } = props
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const active = state.tabs.tabs[state.tabs.active]
  const kind = viewKind(state)
  const appTab = active?.kind === 'app'
  const openRecord = appTab ? state.apps.find(app => app.id === active.appId) : undefined
  const workbenchTab = openRecord?.kind === 'workbench'
  const homePinned = openRecord?.kind === 'workbench' && props.defaultWorkbenchId === openRecord.id
  const desk = state.apps.find(app => app.id === props.defaultWorkbenchId && app.kind === 'workbench')
  const desks = workbenchEntries(state.apps, props.defaultWorkbenchId, label('workbench-builtin'))
  const deskId = desks.find(entry => entry.default)?.id ?? 'default'
  const [refreshing, setRefreshing] = useState(false)
  const rail = useRef<HTMLDivElement>(null)
  const [glide, setGlide] = useState<{ left: number; width: number } | undefined>(undefined)
  const tabKey = state.tabs.tabs.map(tab => tab.kind === 'gallery' ? 'gallery' : `${tab.appId}:${tab.title ?? ''}`).join('|')
  useLayoutEffect(() => {
    const root = rail.current
    if (root === null) return
    const current = root.querySelector('[data-active="1"]')
    if (!(current instanceof HTMLElement)) return
    setGlide({ left: current.offsetLeft, width: current.offsetWidth })
  }, [state.tabs.active, tabKey])
  return (
    <section id="mma-host" className="mma-command relative flex h-full min-h-full flex-col text-foreground" data-shell={state.shell} data-card={state.cardStyle} data-cardstyle={state.cardStyle}>
      <header className="mma-chrome">
        <div ref={rail} className="mma-pill-rail">
          {glide === undefined ? null : (
            <span className="mma-pill-glide" style={{ width: glide.width, transform: `translateX(${glide.left}px)` }} />
          )}
          {state.tabs.tabs.map((tab, index) => (
            <button
              key={tab.kind === 'gallery' ? 'gallery' : tab.appId}
              type="button"
              className="mma-pill"
              data-active={index === state.tabs.active ? '1' : '0'}
              onClick={() => dispatch({ type: 'switch', index })}
            >
              <span>{tab.kind === 'gallery' ? label('gallery') : tab.title ?? tab.appId}</span>
              {tab.kind === 'app' ? (
                <span
                  className="ml-1.5 text-[13px] leading-none text-muted-foreground hover:text-foreground"
                  role="button"
                  aria-label={label('close-tab')}
                  onClick={(event) => {
                    event.stopPropagation()
                    dispatch({ type: 'close', index })
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {appTab ? null : (
          <DeskBar
            label={label('desk-switch')}
            choices={desks.map((entry) => {
              if (entry.builtin) return { id: entry.id, name: entry.name, icon: 'library' as const }
              const app = state.apps.find(item => item.id === entry.id)
              return { id: entry.id, name: entry.name, mark: app?.acronym ?? entry.name.slice(0, 2) }
            })}
            selected={deskId}
            onSelect={(id) => {
              if (id === deskId) return
              props.onSetDefaultWorkbench?.(id)
            }}
          />
        )}
        {appTab ? (
          <div className="mma-toolbar">
            {workbenchTab ? (
              <Tooltip text={homePinned ? label('clear-default-workbench') : label('set-default-workbench')}>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] leading-none font-semibold hover:bg-muted"
                  data-default-workbench={active.appId}
                  data-current={homePinned ? '1' : '0'}
                  aria-label={homePinned ? label('clear-default-workbench') : label('set-default-workbench')}
                  onClick={() => props.onSetDefaultWorkbench?.(homePinned ? 'default' : active.appId)}
                >
                  <Pin size={14} strokeWidth={2} className="shrink-0" fill={homePinned ? 'currentColor' : 'none'} />
                  <span className="leading-none">{homePinned ? label('current-default-workbench') : label('set-default-workbench')}</span>
                </button>
              </Tooltip>
            ) : null}
            {workbenchTab ? <span className="mma-toolbar-rule" aria-hidden="true" /> : null}
            <Tooltip text={label('delete')}>
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-destructive transition-colors duration-150 hover:bg-muted" aria-label={label('delete')} onClick={() => dispatch({ type: 'ask-delete', appId: active.appId })}>
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </Tooltip>
          </div>
        ) : null}
        <div className="mma-toolbar">
          <Tooltip text={appTab ? label('reload') : label('refresh')}>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-muted"
              aria-label={appTab ? label('reload') : label('refresh')}
              onClick={() => {
                void refreshList(props.client, appTab && active?.kind === 'app' ? active.appId : undefined, !appTab ? desk?.id : undefined, dispatch, setRefreshing)
              }}
            >
              <span className="sr-only">{appTab ? label('reload') : label('refresh')}</span>
              <RefreshCw size={16} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
          {props.onToggleTheme === undefined ? null : (
            <div className="relative z-30">
              <Tooltip text={label('theme')} align="end">
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-muted" aria-label={label('theme')} onClick={props.onToggleTheme}>
                  <span className="sr-only">{label('theme')}</span>
                  <Palette size={18} strokeWidth={1.75} />
                </button>
              </Tooltip>
              <div className={props.themeOpen === true ? 'absolute top-11 right-0 z-30 max-h-[70vh] w-72 origin-top-right animate-in overflow-auto rounded-xl border bg-card p-3 shadow-lg duration-150 fade-in-0 zoom-in-95' : 'hidden'} onPointerDown={event => event.stopPropagation()}>{themeNode(props.theme, active?.kind === 'app' ? { id: active.appId, title: active.title ?? active.appId } : undefined)}</div>
            </div>
          )}

          {appTab ? props.tools : null}
          {props.onToggleSettings === undefined ? null : (
            <Tooltip text={label('settings')} align="end">
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-muted" aria-label={label('settings')} onClick={props.onToggleSettings}>
                <span className="sr-only">{label('settings')}</span>
                <Settings size={16} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          {state.shell === 'overlay' && props.onClosePanel !== undefined ? (
            <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted" onClick={() => props.onClosePanel?.()}>{label('close-panel')}</button>
          ) : null}
        </div>
      </header>
      {props.themeOpen === true && props.onToggleTheme !== undefined ? (
        <button type="button" aria-label={label('pane-close')} data-theme-scrim="" className="fixed inset-0 z-30 cursor-default bg-transparent" onPointerDown={(event) => { event.preventDefault(); props.onToggleTheme?.() }} />
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {appTab ? null : (
          <div className="mma-status">
            <span className="mma-dot" data-status={statusDot(kind)} />
            <span>{kind === 'unreachable' || kind === 'failed' ? label('host-unreachable') : label('status-ready')}</span>
            <span>{label('gallery-count').replaceAll('{n}', String(state.apps.length))}</span>
            {desk === undefined ? null : (
              <Tooltip text={label('open-workbench-tab-hint')} align="end">
                <button
                  type="button"
                  className="mma-status-action"
                  data-open-workbench={desk.id}
                  aria-label={label('open-workbench-tab')}
                  onClick={() => {
                    const open = state.tabs.tabs.some(tab => tab.kind === 'app' && tab.appId === desk.id)
                    void openApp(props.client, desk.id, desk.name, dispatch, open)
                  }}
                >
                  <span>{label('open-workbench-tab-now')}</span>
                  <span className="mma-status-split" aria-hidden="true" />
                  <span className="mma-status-more">{label('open-workbench-tab-more')}</span>
                  <span className="mma-status-go" aria-hidden="true"><ArrowUpRight size={12} strokeWidth={2} /></span>
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {state.tabs.tabs.map(tab => tab.kind === 'app' ? (
            <div key={tab.appId} className={stageClass(active?.kind === 'app' && active.appId === tab.appId, 'flex flex-col')}>
              {active?.kind === 'app' && active.appId === tab.appId && state.frameError !== undefined ? <p className="px-6 py-2 text-sm text-destructive">{state.frameError.length > 0 ? state.frameError : label('reload-failed')}</p> : null}
              <div className="mma-stage">
                <AppFrame appId={tab.appId} pending={label('frame-pending')} {...props.frame === undefined ? {} : { frame: props.frame }} />
              </div>
            </div>
          ) : null)}
          <div className={stageClass(!appTab, 'flex flex-col')}>
            <div className="mma-stage mma-app-frame">
              {desk !== undefined ? (
                <div className="mma-frame [&_iframe]:block [&_iframe]:size-full [&_iframe]:border-0">
                  {props.frame?.(desk.id) ?? <div data-app-id={desk.id} data-workbench-slot="" />}
                </div>
              ) : (
                <div className="mma-frame">
                  <div className="mma-library">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="m-0 text-3xl font-extrabold tracking-tight">{label('gallery-title')}</h2>
                        <div className="mt-3 w-fit">
                          <DeskBar
                            label={label('card-style')}
                            fit
                            choices={galleryCardStyles.map(style => ({ id: style, name: label(cardLabel(style)) }))}
                            selected={state.cardStyle}
                            onSelect={(id) => {
                              if (!isGalleryCardStyle(id)) return
                              writeCardStyle(id)
                              dispatch({ type: 'card', cardStyle: id })
                            }}
                          />
                        </div>
                      </div>
                      <TrashButton
                        apps={state.trash}
                        failed={state.trashFailed}
                        live={state.apps}
                        label={label}
                        onRestore={async (app) => {
                          // Names are not identity to the host, but two cards with one name is what a
                          // person would call a failed restore. The id conflict is the host's own.
                          if (state.apps.some(other => other.name === app.name)) {
                            return `${label('restore-name-conflict')}「${app.name}」· ${label('restore-name-conflict-help')}`
                          }
                          const failure = await restoreApp(props.client, app.id, dispatch)
                          return failure === undefined ? undefined : label('restore-id-conflict')
                        }}
                      />
                      <div className="mma-search relative w-full max-w-xs">
                        <Search size={18} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="h-11 w-full rounded-[14px] border border-foreground/10 bg-card/60 pr-4 pl-10 text-sm text-foreground outline-none backdrop-blur-md placeholder:text-muted-foreground focus:border-primary focus:bg-card"
                          type="search"
                          aria-label={label('search')}
                          placeholder={label('search-placeholder')}
                          value={state.query}
                          onChange={event => dispatch({ type: 'search', query: event.target.value })}
                        />
                      </div>
                    </div>
                    {state.openError !== undefined ? <p className="px-6 py-2 text-sm text-destructive">{state.openError.length > 0 ? state.openError : label('open-failed')}</p> : null}
                    {kind === 'unreachable' ? <p className="px-6 py-2 text-sm text-destructive">{label('host-unreachable')}</p> : null}
                    {kind === 'failed' ? <p className="px-6 py-2 text-sm text-destructive">{state.failed !== undefined && state.failed.length > 0 ? state.failed : label('list-failed')}</p> : null}
                    {kind === 'empty' ? <p className="px-6 py-4 text-sm text-muted-foreground">{label('gallery-empty')}</p> : null}
                    {kind === 'none' ? <p className="px-6 py-4 text-sm text-muted-foreground">{label('search-empty')}</p> : null}
                    {kind === 'ready' ? (
                      <WorkbenchLibrary
                        apps={visibleApps(state)}
                        cardStyle={state.cardStyle}
                        openLabel={label('open')}
                        openAppIds={state.tabs.tabs.flatMap(tab => tab.kind === 'app' ? [tab.appId] : [])}
                        openApp={(id, title) => {
                          const open = state.tabs.tabs.some(tab => tab.kind === 'app' && tab.appId === id)
                          void openApp(props.client, id, title ?? id, dispatch, open)
                        }}
                      />
                    ) : null}

                  </div>
                </div>
              )}
            </div>
          </div>
          {state.deletePrompt === 'confirm' ? (
            <Dialog width="sm" onClose={() => dispatch({ type: 'cancel-delete' })}>
              <h3>{label('delete')}</h3>
              <p>{label('delete-confirm')}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => dispatch({ type: 'cancel-delete' })}>{label('cancel')}</button>
                <button type="button" className="go" onClick={() => { void removeApp(props.client, state.pendingDeleteId, dispatch) }}>{label('delete')}</button>
              </div>
            </Dialog>
          ) : null}
          {state.deletePrompt === 'failed' ? <p className="px-6 py-2 text-sm text-destructive">{state.deleteError !== undefined && state.deleteError.length > 0 ? state.deleteError : label('delete-failed')}</p> : null}
        </div>
        {props.overlay}
      </div>
    </section>
  )
}

function openApp(
  client: PanelClient,
  appId: string,
  title: string,
  dispatch: (action: GalleryAction) => void,
  open: boolean,
): void {
  dispatch({ type: 'open', appId, title })
  void notifyOpen(client, appId, title, dispatch, open)
}

async function notifyOpen(
  client: PanelClient,
  appId: string,
  title: string,
  dispatch: (action: GalleryAction) => void,
  open: boolean,
): Promise<void> {
  try {
    await client.open(appId, title)
    if (!open && client.reload !== undefined) await client.reload(appId)
  } catch (error) {
    dispatch({ type: 'drop-app', appId })
    dispatch({ type: 'open-failed', ...thrown(error) })
  }
}

function AppFrame(props: {
  readonly appId: string
  readonly frame?: (appId: string) => ReactNode
  readonly pending: string
}): ReactNode {
  const [ready, setReady] = useState(false)
  const node = props.frame?.(props.appId)
  const iframe = isValidElement(node) && node.type === 'iframe'
  const framed = iframe
    ? cloneElement(node as ReactElement<{ onLoad?: () => void }>, { onLoad: () => setReady(true) })
    : node
  return (
    <div className="relative size-full">
      <div className="mma-frame size-full [&_iframe]:block [&_iframe]:size-full [&_iframe]:border-0">
        {framed ?? <div data-app-id={props.appId} />}
      </div>
      {iframe && !ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground" data-frame-pending={props.appId}>
          {props.pending}
        </div>
      ) : null}
    </div>
  )
}

async function reloadApp(client: PanelClient, appId: string, dispatch: (action: GalleryAction) => void): Promise<void> {
  if (client.reload === undefined) return
  try {
    await client.reload(appId)
  } catch (error) {
    dispatch({ type: 'frame-error', message: error instanceof Error ? error.message : '' })
  }
}

/** Restore one trashed app. A refusal comes back as a message: it is about this row, not the view. */
async function restoreApp(client: PanelClient, appId: string, dispatch: (action: GalleryAction) => void): Promise<string | undefined> {
  if (client.undeleteApp === undefined) return undefined
  try {
    await client.undeleteApp(appId)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  dispatch({ type: 'undeleted', appId })
  return undefined
}

async function removeApp(client: PanelClient, appId: string | undefined, dispatch: (action: GalleryAction) => void): Promise<void> {
  if (appId === undefined) return
  try {
    await client.deleteApp(appId)
  } catch (error) {
    dispatch({ type: 'delete-failed', ...thrown(error) })
    return
  }
  dispatch({ type: 'deleted', appId })
}

async function refreshList(
  client: PanelClient,
  appId: string | undefined,
  workbenchId: string | undefined,
  dispatch: (action: GalleryAction) => void,
  setRefreshing: (value: boolean) => void,
): Promise<void> {
  setRefreshing(true)
  const started = Date.now()
  try {
    if (appId !== undefined && client.reload !== undefined) await reloadApp(client, appId, dispatch)
    else {
      await loadGallery(client, dispatch)
      if (workbenchId !== undefined) await reloadApp(client, workbenchId, dispatch)
    }
  } finally {
    const wait = 400 - (Date.now() - started)
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    setRefreshing(false)
  }
}

function statusDot(kind: GalleryKind): 'ready' | 'failed' | 'down' {
  if (kind === 'unreachable') return 'down'
  if (kind === 'failed') return 'failed'
  return 'ready'
}

function stageClass(shown: boolean, extra: string): string {
  const place = shown
    ? 'absolute inset-0 z-10 opacity-100'
    : 'pointer-events-none absolute inset-0 z-0 opacity-0'
  return `${place} transition-opacity duration-200 ease-out ${extra}`
}

function cardLabel(style: GalleryCardStyle): 'card-hero' | 'card-stamp' | 'card-etch' | 'card-pulse' | 'card-list' | 'card-glass' {
  if (style === 'stamp') return 'card-stamp'
  if (style === 'etch') return 'card-etch'
  if (style === 'pulse') return 'card-pulse'
  if (style === 'list') return 'card-list'
  if (style === 'glass') return 'card-glass'
  return 'card-hero'
}

function thrown(error: unknown): { message: string } | Record<string, never> {
  const message = error instanceof Error ? error.message : ''
  return message.length > 0 ? { message } : {}
}

/**
 * The trash, behind a glyph that only shows itself on hover. Deleted apps are a side errand, so the
 * library's first screen is apps only: this opens a small panel rather than replacing the grid.
 * A refused restore stays on its own row, because it is about that row and not about the view.
 */
function TrashButton({ apps, failed, label, onRestore }: {
  apps: readonly GalleryApp[]
  failed: boolean
  live: readonly GalleryApp[]
  label: (key: string) => string
  onRestore: (app: GalleryApp) => Promise<string | undefined>
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [refusal, setRefusal] = useState<{ id: string; message: string } | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        data-trash-open=""
        aria-label={label('trash-open')}
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
        className="text-muted-foreground/60 hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-muted/60"
      >
        <Trash2 size={16} strokeWidth={2} />
      </button>
      {!open ? null : (
        <div
          data-trash-panel=""
          className="absolute top-10 right-0 z-30 max-h-[70vh] w-80 origin-top-right overflow-auto rounded-xl border bg-card p-3 shadow-lg"
        >
          <p className="text-muted-foreground m-0 mb-2 px-1 text-xs">
            {label('trash-open')}{apps.length === 0 ? '' : ` · ${apps.length}`}
          </p>
          {failed ? <p className="text-destructive m-0 px-1 py-2 text-xs">{label('trash-failed')}</p> : null}
          {!failed && apps.length === 0 ? (
            <p className="text-muted-foreground m-0 px-1 py-2 text-xs">{label('trash-empty')}</p>
          ) : null}
          {apps.map(app => (
            <div key={app.id} className="flex flex-col gap-1 rounded-lg px-1 py-1.5" data-trash={app.id}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{app.name}</span>
                <button
                  type="button"
                  data-restore={app.id}
                  className="hover:bg-muted shrink-0 rounded-md px-2 py-1 text-xs"
                  onClick={() => {
                    void onRestore(app).then((message) => { setRefusal(message === undefined ? undefined : { id: app.id, message }) })
                  }}
                >
                  {label('trash-restore')}
                </button>
              </div>
              {refusal !== undefined && refusal.id === app.id ? <p className="text-destructive m-0 text-[11px] leading-snug">{refusal.message}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
