/** Panel chrome labels. Not the app's own strings. @module @mohou/panel */

export const packageId = '@mohou/panel' as const

export {
  isPanelLocale,
  panelLocales,
  panelText,
  type PanelLabelKey,
  type PanelLabelMode,
  type PanelLocale,
} from './labels.ts'
export { admitPanelPort, panelLanguageFields, panelPortBound, type PanelPortResult } from './settings/form.ts'
export {
  filterGallery,
  galleryCardStyles,
  galleryKind,
  isGalleryCardStyle,
  type GalleryApp,
  type GalleryCardStyle,
  type GalleryKind,
} from './gallery/list.ts'
export {
  closeTab,
  deletePrompt,
  initialTabs,
  openAppTab,
  switchTab,
  type AppTab,
  type DeletePrompt,
  type PanelTab,
  type PanelTabs,
  type TabChange,
} from './gallery/tabs.ts'
export { PanelClientError, type PanelClient } from './gallery/client.ts'
export {
  loadGallery,
  loadTrash,
  galleryState,
  reduceGallery,
  viewKind,
  visibleApps,
  type GalleryAction,
  type PanelShell,
  type GalleryState,
} from './gallery/state.ts'
export { PanelGallery } from './gallery/view.tsx'
export type { McpCheckResult, McpServerDraft, PanelAbout, PanelCredential, PanelCredentials, PanelMcpFailure, PanelMcpList, PanelAuthorMcpAgent, PanelAuthorMcpStatus, PanelPolicy, PanelPolicyWrite, PanelProbe, PanelRuntime, PanelSettingsClient, PanelSkillAgent, PanelSkillStatus, PanelUpdateCheck } from './settings/client.ts'
export { loadSettings, reduceSettings, settingsDraft, settingsState, type SettingsAction, type SettingsState } from './settings/state.ts'
export { PanelSettings } from './settings/view.tsx'
export type { HistoryClient, HistoryCommit, HistoryDetail, HistoryFile } from './history/client.ts'
export { historyState, loadCommit, loadHistory, reduceHistory, type HistoryAction, type HistoryState } from './history/state.ts'
export { PanelHistory } from './history/view.tsx'
export type { StorageClient, StorageSummary, StorageTable } from './storage/client.ts'
export { loadStorage, loadTable, reduceStorage, storageState, type StorageAction, type StorageState } from './storage/state.ts'
export { PanelStorage } from './storage/view.tsx'
export type { IgnoredPalette, PaletteChip, ThemeClient, ThemePin } from './theme/client.ts'
export { loadPalettes, reduceTheme, savePin, themeState, type ThemeAction, type ThemeState } from './theme/state.ts'
export { PanelTheme } from './theme/view.tsx'
export { reduceSurface, surfaceState, panelSections, type PanelSection, type SurfaceAction, type SurfaceState } from './surface/state.ts'
export { PanelSurface, type PanelControls } from './surface/view.tsx'
