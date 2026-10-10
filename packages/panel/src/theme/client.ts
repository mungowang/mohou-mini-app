/** One palette chip. Ignored files are not chips. */
export interface PaletteChip {
  readonly id: string
  /** English (or sole) display name. */
  readonly name: string
  /** Chinese display name when the theme file provides one. */
  readonly nameZh?: string
  readonly swatch?: string
  readonly style?: string
  /** Shipped file, or a file from the themes directory. A user file that replaces a shipped id is custom. */
  readonly origin?: 'builtin' | 'custom'
}

export interface IgnoredPalette {
  readonly file: string
  readonly reason: string
}

/** Pin the owner can set. Clear is `default`, not deletion of `theme.css`. */
export type ThemePin =
  | { readonly kind: 'default' }
  | { readonly kind: 'follow-host' }
  | { readonly kind: 'app-file' }
  | { readonly kind: 'palette'; readonly id: string }

/** Theme reads and pin writes. Absent means the picker is hidden. No route string lives here. */
export interface ThemeClient {
  listPalettes(): Promise<{ palettes: readonly PaletteChip[]; ignored: readonly IgnoredPalette[] }>
  /** Remove a custom theme file. Builtin palettes cannot be deleted. */
  deletePalette?(id: string): Promise<void>
  readPin?(appId: string): Promise<ThemePin>
  setPin(appId: string, pin: ThemePin): Promise<ThemePin>
  appFile?(appId: string): Promise<boolean>
  /** Parsed `theme.css` for this app. Null when the file is missing or ignored. */
  readAppTheme?(appId: string): Promise<{ name?: string; nameZh?: string; swatch?: string; style?: string } | null>
}
