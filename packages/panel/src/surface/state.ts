export const panelSections = ['gallery', 'settings', 'history', 'storage'] as const

export type PanelSection = (typeof panelSections)[number]

export interface SurfaceState {
  readonly section: PanelSection
  /** Palette popover is independent of the main pane so settings stays open. */
  readonly themeOpen: boolean
  readonly focus?: { readonly appId: string; readonly title?: string }
  readonly notice?: string
  readonly unavailable?: string
  readonly renamed?: { readonly from: string; readonly to: string }
}

export type SurfaceAction =
  | { readonly type: 'section'; readonly section: PanelSection }
  | { readonly type: 'toggle-theme' }
  | { readonly type: 'close-theme' }
  | { readonly type: 'show-app'; readonly appId: string; readonly title?: string }
  /** Gallery tab switch. Updates focus only — does not force the gallery section or close storage. */
  | { readonly type: 'select-app'; readonly appId?: string; readonly title?: string }
  | { readonly type: 'show-notice'; readonly appId: string; readonly table: string }
  | { readonly type: 'unavailable'; readonly appId: string }
  | { readonly type: 'rename-app'; readonly from: string; readonly to: string }

/** The gallery section is first. */
export function surfaceState(): SurfaceState {
  return { section: 'gallery', themeOpen: false }
}

/**
 * Which pane is visible, and which app the host asked to show.
 * Theme popover does not replace settings / history / storage.
 * @param state - current surface
 * @param action - a section change or a host event applied by Shell
 */
export function reduceSurface(state: SurfaceState, action: SurfaceAction): SurfaceState {
  switch (action.type) {
    case 'section':
      return {
        ...state,
        section: action.section,
        // Opening another full pane dismisses the palette popover.
        themeOpen: action.section === 'gallery' ? state.themeOpen : false,
      }
    case 'toggle-theme':
      return { ...state, themeOpen: !state.themeOpen }
    case 'close-theme':
      return { ...state, themeOpen: false }
    case 'show-app':
      return {
        ...withoutUnavailable(state),
        section: 'gallery',
        themeOpen: false,
        focus: action.title === undefined ? { appId: action.appId } : { appId: action.appId, title: action.title },
      }
    case 'select-app':
      if (action.appId === undefined) {
        const { focus: gone, ...rest } = state
        void gone
        return rest
      }
      if (state.focus?.appId === action.appId
        && (action.title === undefined ? state.focus.title === undefined : state.focus.title === action.title)) {
        return state
      }
      return {
        ...state,
        focus: action.title === undefined ? { appId: action.appId } : { appId: action.appId, title: action.title },
      }
    case 'show-notice':
      return {
        ...state,
        section: 'storage',
        themeOpen: false,
        notice: action.table,
        focus: state.focus?.appId === action.appId ? state.focus : { appId: action.appId },
      }
    case 'unavailable':
      return { ...state, section: 'gallery', themeOpen: false, unavailable: action.appId }
    case 'rename-app':
      return {
        ...state,
        renamed: { from: action.from, to: action.to },
        ...renamedFocus(state.focus, action.from, action.to),
      }
    default:
      return action satisfies never
  }
}

function renamedFocus(
  focus: SurfaceState['focus'],
  from: string,
  to: string,
): { focus: { appId: string; title?: string } } | Record<string, never> {
  if (focus?.appId !== from) return {}
  return {
    focus: {
      appId: to,
      ...focus.title === undefined ? {} : { title: focus.title },
    },
  }
}

function withoutUnavailable(state: SurfaceState): Omit<SurfaceState, 'unavailable'> {
  const { unavailable: gone, ...rest } = state
  void gone
  return rest
}
