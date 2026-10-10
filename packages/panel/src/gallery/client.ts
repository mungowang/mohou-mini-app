import type { GalleryApp } from './list.ts'

/** Host calls the view may make. No route string lives here. */
export interface PanelClient {
  list(): Promise<readonly GalleryApp[]>
  open(appId: string, title?: string): Promise<void>
  deleteApp(appId: string): Promise<void>
  reload?(appId: string): Promise<void>
  listTrash?(): Promise<readonly GalleryApp[]>
  undeleteApp?(appId: string): Promise<void>
  listMarket?(): Promise<readonly MarketRow[]>
  installMarket?(id: string, confirm: boolean): Promise<void>
}

/** One catalog row plus local lock state. */
export interface MarketRow {
  readonly id: string
  readonly name: string
  readonly description: string
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
  readonly tone?: string
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
