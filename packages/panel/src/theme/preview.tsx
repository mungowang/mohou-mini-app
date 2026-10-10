import type { CSSProperties, ReactNode } from 'react'

/** Tokens one mode needs for a tiny dual preview. */
export interface ThemeModeTokens {
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

export interface ThemeDualTokens {
  readonly light: ThemeModeTokens
  readonly dark: ThemeModeTokens
}

/**
 * Parse light/dark tokens from first-paint theme CSS (or a full theme file).
 * Missing optional tokens are omitted.
 */
export function tokensFromThemeCss(css: string): ThemeDualTokens | undefined {
  const light = modeTokens(css, 'light')
  const dark = modeTokens(css, 'dark')
  if (light === undefined || dark === undefined) return undefined
  return { light, dark }
}

/**
 * Compact light|dark dummy used by the market theme card and Settings palette chips.
 * @param props.size - `chip` is settings; `card` is the market theme strip
 */
export function ThemeDualPreview(props: {
  readonly tokens: ThemeDualTokens
  readonly lightLabel: string
  readonly darkLabel: string
  readonly primaryLabel: string
  readonly secondaryLabel: string
  readonly size?: 'chip' | 'card'
}): ReactNode {
  const chip = props.size !== 'card'
  return (
    <div
      className={chip
        ? 'grid h-12 grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60'
        : 'mb-3 grid h-[4.5rem] grid-cols-2 gap-px overflow-hidden rounded-lg border'}
      data-theme-preview={chip ? 'chip' : 'card'}
    >
      <ModePane
        mode={props.lightLabel}
        tokens={props.tokens.light}
        primaryLabel={props.primaryLabel}
        secondaryLabel={props.secondaryLabel}
        chip={chip}
      />
      <ModePane
        mode={props.darkLabel}
        tokens={props.tokens.dark}
        primaryLabel={props.primaryLabel}
        secondaryLabel={props.secondaryLabel}
        chip={chip}
      />
    </div>
  )
}

function ModePane(props: {
  readonly mode: string
  readonly tokens: ThemeModeTokens
  readonly primaryLabel: string
  readonly secondaryLabel: string
  readonly chip: boolean
}): ReactNode {
  const background = props.tokens.background
  const foreground = props.tokens.foreground
  const card = props.tokens.card ?? background
  const border = props.tokens.border ?? 'transparent'
  const muted = props.tokens['muted-foreground'] ?? props.tokens.muted ?? foreground
  const secondary = props.tokens.secondary ?? 'transparent'
  const secondaryFg = props.tokens['secondary-foreground'] ?? foreground
  const primary = props.tokens.primary
  const primaryFg = props.tokens['primary-foreground'] ?? background
  const style = { background, color: foreground } satisfies CSSProperties
  if (props.chip) {
    return (
      <div className="relative flex flex-col px-1.5 py-1 text-[9px] leading-none" style={style}>
        <span className="opacity-60">{props.mode}</span>
        <div className="mt-0.5 flex min-h-0 flex-1 items-center gap-1">
          <div
            className="min-w-0 flex-1 rounded border px-1 py-0.5"
            style={{ background: card, borderColor: border, color: foreground }}
          >
            <div className="truncate">Aa</div>
          </div>
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[8px] font-medium"
            style={{ background: secondary, color: secondaryFg }}
          >
            {props.secondaryLabel}
          </span>
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[8px] font-medium"
            style={{ background: primary, color: primaryFg }}
          >
            {props.primaryLabel}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="relative flex flex-col px-2 py-1.5 text-[10px] leading-tight" style={style}>
      <span className="opacity-65">{props.mode}</span>
      <div className="mt-1 flex min-h-0 flex-1 items-center gap-1.5">
        <div
          className="min-w-0 flex-1 rounded border px-1.5 py-1"
          style={{ background: card, borderColor: border, color: foreground }}
        >
          <div className="truncate">Aa</div>
          <div className="truncate opacity-80" style={{ color: muted }}>{props.mode}</div>
        </div>
        <span
          className="shrink-0 rounded px-1.5 py-1 text-[9px] font-medium"
          style={{ background: secondary, color: secondaryFg }}
        >
          {props.secondaryLabel}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-1 text-[9px] font-medium"
          style={{ background: primary, color: primaryFg }}
        >
          {props.primaryLabel}
        </span>
      </div>
    </div>
  )
}

function modeTokens(css: string, mode: string): ThemeModeTokens | undefined {
  const block = modeBlock(css, mode)
  if (block.length === 0) return undefined
  const pick = (name: keyof ThemeModeTokens) => {
    const value = token(block, name)
    return value === undefined ? {} : { [name]: value }
  }
  return {
    ...pick('background'),
    ...pick('foreground'),
    ...pick('card'),
    ...pick('border'),
    ...pick('muted'),
    ...pick('muted-foreground'),
    ...pick('secondary'),
    ...pick('secondary-foreground'),
    ...pick('primary'),
    ...pick('primary-foreground'),
  }
}

function modeBlock(css: string, mode: string): string {
  const match = new RegExp(`data-mode=["']${mode}["'][^{]*\\{([^}]*)\\}`).exec(css)
  if (match?.[1] !== undefined) return match[1]
  // First-paint style may use :root[data-mode=...] { long body }
  const at = css.indexOf(`data-mode="${mode}"`)
  const alt = at < 0 ? css.indexOf(`data-mode='${mode}'`) : at
  if (alt < 0) return ''
  const open = css.indexOf('{', alt)
  const close = open < 0 ? -1 : css.indexOf('}', open)
  if (open < 0 || close < 0) return ''
  return css.slice(open + 1, close)
}

function token(block: string, name: string): string | undefined {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+)`).exec(block)
  const value = match?.[1]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}
