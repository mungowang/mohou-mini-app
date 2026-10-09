export interface AppTab {
  readonly kind: 'app'
  readonly appId: string
  readonly title?: string
}

export interface GalleryTab {
  readonly kind: 'gallery'
}

export type PanelTab = GalleryTab | AppTab

export interface PanelTabs {
  readonly tabs: readonly PanelTab[]
  readonly active: number
}

export interface TabChange {
  readonly tabs: PanelTabs
  /** Tab switch never reloads the document. Opening an already open tab does not either. */
  readonly reload: false
}

/** The gallery tab is always present and is not closable. */
export function initialTabs(): PanelTabs {
  return { tabs: [{ kind: 'gallery' }], active: 0 }
}

/**
 * Open or focus an app tab. Does not reload a document that is already open.
 * @param state - current tabs
 * @param appId - app to show
 * @param title - optional tab title
 */
export function openAppTab(state: PanelTabs, appId: string, title?: string): TabChange {
  const existing = state.tabs.findIndex(tab => tab.kind === 'app' && tab.appId === appId)
  if (existing >= 0) {
    const next = title === undefined
      ? state.tabs
      : state.tabs.map((tab, index) => index === existing && tab.kind === 'app' ? { ...tab, title } : tab)
    return { tabs: { tabs: next, active: existing }, reload: false }
  }
  const tab: AppTab = title === undefined ? { kind: 'app', appId } : { kind: 'app', appId, title }
  return { tabs: { tabs: [...state.tabs, tab], active: state.tabs.length }, reload: false }
}

/**
 * Switch tabs. This never reloads the document.
 * @param state - current tabs
 * @param index - tab index
 */
export function switchTab(state: PanelTabs, index: number): TabChange {
  if (index < 0 || index >= state.tabs.length) return { tabs: state, reload: false }
  return { tabs: { tabs: state.tabs, active: index }, reload: false }
}

/** Point an open tab at a renamed app. The document is not reloaded here. */
export function renameAppTab(state: PanelTabs, from: string, to: string): PanelTabs {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.kind !== 'app' || tab.appId !== from) return tab
      if (tab.title === undefined || tab.title === from) return { kind: 'app', appId: to }
      return { kind: 'app', appId: to, title: tab.title }
    }),
  }
}

/** Remove one app tab after a failed open. The gallery tab stays. */
export function dropAppTab(state: PanelTabs, appId: string): PanelTabs {
  const index = state.tabs.findIndex(tab => tab.kind === 'app' && tab.appId === appId)
  if (index < 0) return state
  return closeTab(state, index)
}

/**
 * Close an app tab. The gallery tab stays.
 * @param state - current tabs
 * @param index - tab index
 */
export function closeTab(state: PanelTabs, index: number): PanelTabs {
  const tab = state.tabs[index]
  if (tab === undefined || tab.kind === 'gallery') return state
  const tabs = state.tabs.filter((_, item) => item !== index)
  const active = Math.min(state.active, tabs.length - 1)
  return { tabs, active }
}

export type DeletePrompt = 'idle' | 'confirm' | 'failed'

/** Delete asks before the operation. Cancel returns to idle. A failure stays visible. */
export function deletePrompt(current: DeletePrompt, action: 'ask' | 'cancel' | 'fail'): DeletePrompt {
  if (action === 'ask') return 'confirm'
  if (action === 'cancel') return 'idle'
  if (current === 'confirm') return 'failed'
  return current
}
