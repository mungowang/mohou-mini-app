import type { PanelClient, PanelClientError } from './client.ts'
import {
  type GalleryApp,
  type GalleryCardStyle,
  galleryKind,
  type GalleryKind,
  filterGallery,
} from './list.ts'
import { appSortings, sortApps } from './sort.ts'
import {
  closeTab,
  dropAppTab,
  deletePrompt,
  initialTabs,
  openAppTab,
  renameAppTab,
  type PanelTabs,
  switchTab,
  type DeletePrompt,
} from './tabs.ts'

export type PanelShell = 'standalone' | 'overlay'

export interface GalleryState {
  readonly shell: PanelShell
  readonly cardStyle: GalleryCardStyle
  readonly query: string
  readonly reachable: boolean
  readonly failed?: string
  readonly apps: readonly GalleryApp[]
  readonly tabs: PanelTabs
  readonly deletePrompt: DeletePrompt
  readonly deleteError?: string
  readonly openError?: string
  readonly pendingDeleteId?: string
  readonly trash: readonly GalleryApp[]
  readonly trashFailed: boolean
  readonly frameError?: string
}

export type GalleryAction =
  | { readonly type: 'unreachable' }
  | { readonly type: 'list-failed'; readonly message: string }
  | { readonly type: 'listed'; readonly apps: readonly GalleryApp[] }
  | { readonly type: 'search'; readonly query: string }
  | { readonly type: 'open'; readonly appId: string; readonly title?: string }
  | { readonly type: 'rename-app'; readonly from: string; readonly to: string }
  | { readonly type: 'open-failed'; readonly message?: string }
  | { readonly type: 'drop-app'; readonly appId: string }
  | { readonly type: 'switch'; readonly index: number }
  | { readonly type: 'close'; readonly index: number }
  | { readonly type: 'ask-delete'; readonly appId: string }
  | { readonly type: 'cancel-delete' }
  | { readonly type: 'delete-failed'; readonly message?: string }
  | { readonly type: 'deleted'; readonly appId: string }
  | { readonly type: 'card'; readonly cardStyle: GalleryCardStyle }
  | { readonly type: 'trash'; readonly apps: readonly GalleryApp[] }
  | { readonly type: 'trash-failed' }
  | { readonly type: 'undeleted'; readonly appId: string }
  | { readonly type: 'frame-error'; readonly message: string }

/** First view state. The gallery tab is open. */
export function galleryState(shell: PanelShell): GalleryState {
  return {
    shell,
    cardStyle: 'glass',
    query: '',
    reachable: true,
    apps: [],
    tabs: initialTabs(),
    deletePrompt: 'idle',
    trash: [],
    trashFailed: false,
  }
}

/**
 * Panel view transition. Search, tabs, and delete confirmation stay in the existing functions.
 * @param state - current view
 * @param action - one user or client result
 */
export function reduceGallery(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case 'unreachable':
      return { ...state, reachable: false, apps: [] }
    case 'list-failed':
      return { ...state, reachable: true, failed: action.message, apps: [] }
    case 'listed':
      return {
        shell: state.shell,
        cardStyle: state.cardStyle,
        query: state.query,
        reachable: true,
        apps: action.apps,
        tabs: state.tabs,
        deletePrompt: state.deletePrompt,
        trash: state.trash,
        trashFailed: state.trashFailed,
        ...state.pendingDeleteId === undefined ? {} : { pendingDeleteId: state.pendingDeleteId },
      }
    case 'search':
      return { ...state, query: action.query }
    case 'open':
      return { ...omitOpenError(state), tabs: openAppTab(state.tabs, action.appId, action.title).tabs }
    case 'rename-app':
      return {
        ...state,
        apps: state.apps.map(app => app.id === action.from ? { ...app, id: action.to } : app),
        tabs: renameAppTab(state.tabs, action.from, action.to),
        ...state.pendingDeleteId === action.from ? { pendingDeleteId: action.to } : {},
      }
    case 'open-failed':
      return { ...omitOpenError(state), ...action.message ? { openError: action.message } : { openError: '' } }
    case 'drop-app':
      return { ...state, tabs: dropAppTab(state.tabs, action.appId) }
    case 'switch':
      return { ...state, tabs: switchTab(state.tabs, action.index).tabs }
    case 'close':
      return { ...state, tabs: closeTab(state.tabs, action.index) }
    case 'ask-delete':
      return { ...omitDeleteError(state), pendingDeleteId: action.appId, deletePrompt: deletePrompt(state.deletePrompt, 'ask') }
    case 'cancel-delete':
      return { ...omitDeleteError(omitPending(state)), deletePrompt: deletePrompt(state.deletePrompt, 'cancel') }
    case 'delete-failed':
      return {
        ...omitDeleteError(state),
        deletePrompt: deletePrompt(state.deletePrompt, 'fail'),
        ...action.message ? { deleteError: action.message } : {},
      }
    case 'deleted':
      return {
        ...omitPending(state),
        apps: state.apps.filter(app => app.id !== action.appId),
        tabs: closeApp(state.tabs, action.appId),
        deletePrompt: 'idle',
      }
    case 'card':
      return { ...state, cardStyle: action.cardStyle }
    case 'trash':
      return { ...state, trash: action.apps, trashFailed: false }
    case 'trash-failed':
      return { ...state, trashFailed: true }
    case 'undeleted': {
      const restored = state.trash.find(app => app.id === action.appId)
      return {
        ...state,
        trash: state.trash.filter(app => app.id !== action.appId),
        apps: restored === undefined ? state.apps : [...state.apps, restored],
      }
    }
    case 'frame-error':
      return { ...state, frameError: action.message }
    default:
      return action satisfies never
  }
}

/** Cards the gallery should show. Search does not change the host list. */
export function visibleApps(state: GalleryState): GalleryApp[] {
  return filterGallery(state.apps, state.query)
}

/** Gallery chrome state. Unreachable is not empty. */
export function viewKind(state: GalleryState): GalleryKind {
  return galleryKind({
    reachable: state.reachable,
    ...state.failed === undefined ? {} : { failed: state.failed },
    apps: visibleApps(state),
    ...state.query.trim().length === 0 ? {} : { query: state.query },
  })
}

/** Load the gallery. A thrown unreachable error is not an empty list. */
export async function loadGallery(
  client: PanelClient,
  dispatch: (action: GalleryAction) => void,
): Promise<void> {
  try {
    const apps = await client.list()
    dispatch({ type: 'listed', apps: await orderByHeat(client, apps) })
  } catch (error) {
    if (isUnreachable(error)) {
      dispatch({ type: 'unreachable' })
      return
    }
    dispatch({ type: 'list-failed', message: error instanceof Error ? error.message : '' })
  }
}

/** Open count is on each app. An app with no activity counts as zero. */
function orderByHeat(_client: PanelClient, apps: readonly GalleryApp[]): GalleryApp[] {
  const heat: Record<string, { lastOpenedAt: string; openCount: number }> = {}
  for (const app of apps) {
    const row = app.activity
    if (row !== undefined) heat[app.id] = row
  }
  return sortApps([...apps], appSortings.heat, 'desc', heat)
}

function omitOpenError(state: GalleryState): Omit<GalleryState, 'openError'> {
  const { openError: gone, ...rest } = state
  void gone
  return rest
}

function omitDeleteError(state: GalleryState): Omit<GalleryState, 'deleteError'> {
  const { deleteError: gone, ...rest } = state
  void gone
  return rest
}

function omitPending(state: GalleryState): Omit<GalleryState, 'pendingDeleteId'> {
  const { pendingDeleteId: _pending, ...rest } = state
  void _pending
  return rest
}

/** Load trash when the client can list it. */
export async function loadTrash(
  client: PanelClient,
  dispatch: (action: GalleryAction) => void,
): Promise<void> {
  if (client.listTrash === undefined) return
  try {
    dispatch({ type: 'trash', apps: await client.listTrash() })
  } catch {
    dispatch({ type: 'trash-failed' })
  }
}

function closeApp(tabs: PanelTabs, appId: string): PanelTabs {
  const index = tabs.tabs.findIndex(tab => tab.kind === 'app' && tab.appId === appId)
  return index < 0 ? tabs : closeTab(tabs, index)
}

function isUnreachable(error: unknown): error is PanelClientError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'unreachable'
}
