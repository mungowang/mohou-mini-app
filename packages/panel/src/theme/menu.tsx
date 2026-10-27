import { useEffect, useState, type ReactNode } from 'react'

import { galleryHue } from '../chrome/hue.ts'
import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import type { PanelPolicy, PanelSettingsClient } from '../settings/client.ts'
import type { PaletteChip, ThemeClient, ThemePin } from './client.ts'

/**
 * Theme menu in the toolbar. Global scope writes host appearance.
 * App scope writes that app's pin. The pressed row is the current choice.
 * Appearance (light/dark/system) is always host-global; only palette can be per-app.
 * @param props - theme client, settings client, the open app, and chrome locale
 */
export function ThemeMenu(props: {
  readonly theme?: ThemeClient
  readonly settings?: PanelSettingsClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly appId?: string
  readonly appTitle?: string
  readonly hostPolicy?: PanelPolicy
  readonly onHostPolicy?: (policy: PanelPolicy) => void
  /** Bumps when a market theme install finishes so the menu refetches palettes. */
  readonly paletteTick?: number
}): ReactNode {
  const [palettes, setPalettes] = useState<readonly PaletteChip[]>([])
  const [failed, setFailed] = useState('')
  const [scope, setScope] = useState<'global' | 'app'>('global')
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system')
  const [paletteId, setPaletteId] = useState('')
  const [pin, setPin] = useState<ThemePin>({ kind: 'default' })
  const [appFile, setAppFile] = useState(false)
  const [appTheme, setAppTheme] = useState<{ name?: string; nameZh?: string; swatch?: string; style?: string } | null>(null)
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const appScope = props.appId !== undefined && scope === 'app'
  useEffect(() => {
    if (props.theme === undefined) return
    void props.theme.listPalettes().then(
      listed => setPalettes(listed.palettes),
      (error: unknown) => setFailed(error instanceof Error && error.message.length > 0 ? error.message : label('theme-save-failed')),
    )
  }, [props.theme, props.paletteTick])
  useEffect(() => {
    if (props.settings === undefined) return
    void props.settings.readPolicy().then((policy) => {
      if (policy.theme === 'light' || policy.theme === 'dark' || policy.theme === 'system') setAppearance(policy.theme)
      setPaletteId(policy.palette)
    }).catch(() => undefined)
  }, [props.settings])
  useEffect(() => {
    if (props.hostPolicy === undefined) return
    if (props.hostPolicy.theme === 'light' || props.hostPolicy.theme === 'dark' || props.hostPolicy.theme === 'system') {
      setAppearance(props.hostPolicy.theme)
    }
    setPaletteId(props.hostPolicy.palette)
  }, [props.hostPolicy])
  useEffect(() => {
    if (props.theme === undefined || props.appId === undefined) return
    const appId = props.appId
    if (props.theme.readPin !== undefined) {
      void props.theme.readPin(appId).then(setPin).catch(() => setPin({ kind: 'default' }))
    }
    if (props.theme.appFile !== undefined) {
      void props.theme.appFile(appId).then(setAppFile).catch(() => setAppFile(false))
    }
    if (props.theme.readAppTheme !== undefined) {
      void props.theme.readAppTheme(appId).then(setAppTheme).catch(() => setAppTheme(null))
    }
  }, [props.theme, props.appId])
  return (
    <>
      {props.appId === undefined ? null : (
        <>
          <p className="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">{label('theme')}</p>
          <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
            <Seg label={label('scope-global')} on={scope === 'global'} onClick={() => setScope('global')} />
            <Seg label={props.appTitle ?? label('scope-app')} on={scope === 'app'} onClick={() => setScope('app')} />
          </div>
        </>
      )}
      {appScope ? null : (
        <>
          <p className="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">{label('appearance')}</p>
          <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
            {(['system', 'light', 'dark'] as const).map(theme => (
              <Seg
                key={theme}
                label={label(themeKey(theme))}
                on={appearance === theme}
                onClick={() => { void writeTheme(props.settings, theme, setAppearance, setFailed, label, props.onHostPolicy) }}
              />
            ))}
          </div>
        </>
      )}
      <p className="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">{label('palette')}</p>
      {appScope ? <p className="mb-2 text-[11px] leading-4 text-muted-foreground">{label('theme-app-hint')}</p> : null}
      <div className="flex max-h-64 flex-col gap-1 overflow-auto">
        {appScope ? (
          <Swatch
            label={label('follow-global')}
            swatch="linear-gradient(135deg,#888,#ddd)"
            on={pin.kind === 'follow-host' || pin.kind === 'default'}
            onClick={() => { void writePin(props.theme, props.appId, { kind: 'follow-host' }, setPin, setFailed, label, palettes.find(item => item.id === paletteId)?.style) }}
          />
        ) : null}
        {palettes.map(palette => (
          <Swatch
            key={palette.id}
            label={paletteLabel(props.locale, palette)}
            swatch={palette.swatch ?? `hsl(${galleryHue(palette.id)} 55% 48%)`}
            badge={label(palette.origin === 'custom' ? 'chip-custom' : 'chip-system')}
            on={paletteOn(appScope, pin, paletteId, palette.id)}
            onClick={() => { void choosePalette(props, appScope, palette, setPaletteId, setPin, setFailed, label) }}
          />
        ))}
        {appScope && (appFile || appTheme !== null) ? (
          <Swatch
            label={appTheme?.name !== undefined && appTheme.name.length > 0 ? paletteLabel(props.locale, { id: 'app', name: appTheme.name, ...appTheme.nameZh === undefined ? {} : { nameZh: appTheme.nameZh } }) : label('app-file')}
            swatch={appTheme?.swatch ?? 'linear-gradient(135deg,var(--primary),var(--muted))'}
            badge={label('chip-app')}
            on={pin.kind === 'app-file'}
            onClick={() => { void writePin(props.theme, props.appId, { kind: 'app-file' }, setPin, setFailed, label, appTheme?.style) }}
          />
        ) : null}
      </div>
      {failed.length > 0 ? <p className="mt-2 text-xs text-destructive">{failed}</p> : null}
    </>
  )
}

function Seg(props: { readonly label: string; readonly on: boolean; readonly onClick: () => void }): ReactNode {
  return (
    <button type="button" className="h-7 flex-1 truncate rounded-md px-2 text-xs transition-colors duration-150 hover:bg-card data-[on=1]:bg-card data-[on=1]:font-semibold data-[on=1]:shadow-sm" data-on={props.on ? '1' : '0'} aria-pressed={props.on} onClick={props.onClick}>
      {props.label}
    </button>
  )
}

function Swatch(props: {
  readonly label: string
  readonly swatch: string
  readonly badge?: string
  readonly on: boolean
  readonly onClick: () => void
}): ReactNode {
  return (
    <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-muted data-[on=1]:bg-muted data-[on=1]:font-semibold" data-on={props.on ? '1' : '0'} aria-pressed={props.on} onClick={props.onClick}>
      <i className="size-3.5 shrink-0 rounded-full border" style={{ background: props.swatch }} />
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.badge === undefined ? null : <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{props.badge}</span>}
    </button>
  )
}

function paletteOn(appScope: boolean, pin: ThemePin, paletteId: string, id: string): boolean {
  if (appScope) return pin.kind === 'palette' && pin.id === id
  return paletteId === id
}

function paletteLabel(locale: PanelLocale, palette: PaletteChip): string {
  if (locale === 'zh-CN' && palette.nameZh !== undefined && palette.nameZh.length > 0) return palette.nameZh
  return palette.name
}

function themeKey(theme: 'system' | 'light' | 'dark'): 'theme-system' | 'theme-light' | 'theme-dark' {
  if (theme === 'light') return 'theme-light'
  if (theme === 'dark') return 'theme-dark'
  return 'theme-system'
}

async function choosePalette(
  props: {
    readonly theme?: ThemeClient
    readonly settings?: PanelSettingsClient
    readonly appId?: string
    readonly onHostPolicy?: (policy: PanelPolicy) => void
  },
  appScope: boolean,
  palette: PaletteChip,
  setPaletteId: (id: string) => void,
  setPin: (pin: ThemePin) => void,
  setFailed: (message: string) => void,
  label: (key: string) => string,
): Promise<void> {
  if (appScope) {
    await writePin(props.theme, props.appId, { kind: 'palette', id: palette.id }, setPin, setFailed, label, palette.style)
    return
  }
  await writePalette(props.settings, palette.id, setPaletteId, setFailed, label, palette.style, props.onHostPolicy)
}

async function writeTheme(
  settings: PanelSettingsClient | undefined,
  theme: 'system' | 'light' | 'dark',
  setAppearance: (theme: 'system' | 'light' | 'dark') => void,
  setFailed: (message: string) => void,
  label: (key: string) => string,
  onHostPolicy?: (policy: PanelPolicy) => void,
): Promise<void> {
  if (settings === undefined) return
  try {
    const current = await settings.readPolicy()
    const written = await settings.writePolicy({ ...current, theme })
    applyDocumentMode(theme)
    setAppearance(theme)
    onHostPolicy?.(written.policy)
    setFailed('')
  } catch (error) {
    setFailed(error instanceof Error && error.message.length > 0 ? error.message : label('theme-save-failed'))
  }
}

async function writePalette(
  settings: PanelSettingsClient | undefined,
  palette: string,
  setPaletteId: (id: string) => void,
  setFailed: (message: string) => void,
  label: (key: string) => string,
  style?: string,
  onHostPolicy?: (policy: PanelPolicy) => void,
): Promise<void> {
  if (settings === undefined) return
  try {
    const current = await settings.readPolicy()
    const written = await settings.writePolicy({ ...current, palette })
    setPaletteId(palette)
    onHostPolicy?.(written.policy)
    setFailed('')
    if (style !== undefined) paintStyle(style)
  } catch (error) {
    setFailed(error instanceof Error && error.message.length > 0 ? error.message : label('theme-save-failed'))
  }
}

async function writePin(
  theme: ThemeClient | undefined,
  appId: string | undefined,
  pin: ThemePin,
  setPin: (pin: ThemePin) => void,
  setFailed: (message: string) => void,
  label: (key: string) => string,
  style?: string,
): Promise<void> {
  if (theme === undefined || appId === undefined) return
  try {
    setPin(await theme.setPin(appId, pin))
    setFailed('')
    if (style !== undefined) paintStyle(style, appId)
  } catch (error) {
    setFailed(error instanceof Error && error.message.length > 0 ? error.message : label('theme-save-failed'))
  }
}

function paintStyle(style: string, appId?: string): void {
  if (typeof document === 'undefined') return
  if (appId === undefined) {
    const node = document.getElementById('mma-theme')
    if (node) node.textContent = style
  }
  const frames = appId === undefined
    ? [...document.querySelectorAll('iframe')]
    : [document.querySelector(`iframe[data-app-id="${CSS.escape(appId)}"]`)]
  for (const frame of frames) {
    if (frame instanceof HTMLIFrameElement) frame.contentWindow?.postMessage({ type: 'theme', style, variables: {} }, window.location.origin)
  }
}

/** Host-wide palette CSS preview (panel + all app iframes). */
export function paintHostStyle(style: string): void {
  paintStyle(style)
}

/** Paint `data-mode` on the panel document. `system` follows the OS. */
export function applyDocumentMode(theme: 'system' | 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  const mode = theme === 'system' ? systemDocumentMode() : theme
  document.documentElement.dataset.mode = mode
  for (const frame of document.querySelectorAll('iframe')) {
    if (!(frame instanceof HTMLIFrameElement)) continue
    frame.contentWindow?.postMessage({ type: 'theme', mode, variables: {} }, window.location.origin)
  }
}

function systemDocumentMode(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
