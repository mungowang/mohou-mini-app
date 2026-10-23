import type { GalleryApp } from './list.ts'

/** Host calls the view may make. No route string lives here. */
export interface PanelClient {
  list(): Promise<readonly GalleryApp[]>
  open(appId: string, title?: string): Promise<void>
  deleteApp(appId: string): Promise<void>
  reload?(appId: string): Promise<void>
  /** Take a view-session reference when opening a new app tab. */
  enterView?(appId: string): Promise<void>
  /** Drop a view-session reference when an app tab closes (all kinds). */
  releaseView?(appId: string): Promise<void>
  /** @deprecated Use releaseView. */
  closeWebsite?(appId: string): Promise<void>
  listTrash?(): Promise<readonly GalleryApp[]>
  undeleteApp?(appId: string): Promise<void>
  listMarket?(): Promise<MarketList>
  installMarket?(id: string, confirm: boolean): Promise<void>
  uninstallMarket?(id: string, kind: 'app' | 'theme', confirm: boolean): Promise<void>
}

/** One market read: rows with local state, plus the bundles that still have a row. */
export interface MarketList {
  readonly rows: readonly MarketRow[]
  readonly packs: readonly MarketPack[]
}

/** A market bundle. Presentation only: it installs nothing and has no version. */
export interface MarketPack {
  readonly id: string
  readonly name: string
  readonly nameZh?: string
  readonly description?: string
  readonly descriptionZh?: string
  readonly author?: string
  readonly official?: boolean
}

/** One catalog row plus local lock state. */
export interface MarketRow {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Optional Chinese display name (themes). */
  readonly nameZh?: string
  /** Optional Chinese description (themes). */
  readonly descriptionZh?: string
  readonly package: string
  readonly version: string
  readonly kind: 'app' | 'theme'
  readonly appKind?: 'workbench'
  readonly tags?: readonly string[]
  readonly requires?: string
  readonly author?: string
  readonly downloads?: number
  readonly official?: boolean
  readonly source: 'npm' | 'local'
  readonly colors?: readonly string[]
  /** The `MarketPack` this theme belongs to. Absent means ungrouped. */
  readonly themePackId?: string
  readonly installedVersion?: string
  readonly localVersion?: string
  readonly modified?: boolean
  readonly tracked?: boolean
  readonly installable?: boolean
  readonly preview?: {
    readonly light: ThemeModePreview
    readonly dark: ThemeModePreview
  }
}

export interface ThemeModePreview {
  readonly background?: string
  readonly foreground?: string
  readonly card?: string
  readonly border?: string
  readonly muted?: string
  readonly 'muted-foreground'?: string
  readonly secondary?: string
  readonly 'secondary-foreground'?: string
  readonly primary?: string
  readonly 'primary-foreground'?: string
  readonly accent?: string
  readonly 'accent-foreground'?: string
  readonly destructive?: string
  readonly 'destructive-foreground'?: string
  readonly input?: string
}

/** A client failure the view can tell from an empty list. */
export class PanelClientError extends Error {
  readonly code: 'unreachable' | 'failed'

  /**
   * @param code - `unreachable` is not an empty gallery
   * @param message - human text
   */
  constructor(code: 'unreachable' | 'failed', message: string) {
    super(message)
    this.name = 'PanelClientError'
    this.code = code
  }
}
