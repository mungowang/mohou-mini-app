import type { CSSProperties, ReactNode } from 'react'

/** Tokens one mode needs for a dual preview. Optional keys are omitted when missing. */
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
  readonly accent?: string
  readonly 'accent-foreground'?: string
  readonly destructive?: string
  readonly 'destructive-foreground'?: string
  readonly input?: string
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
 * @param props.size - `chip` is settings; `card` is the legacy short strip; `workbench` is the market theme body
 */
export function ThemeDualPreview(props: {
  readonly tokens: ThemeDualTokens
  readonly lightLabel: string
  readonly darkLabel: string
  readonly primaryLabel: string
  readonly secondaryLabel: string
  readonly size?: 'chip' | 'card' | 'workbench'
}): ReactNode {
  const size = props.size ?? 'chip'
  if (size === 'workbench') {
    return (
      <div
        className="grid min-h-[11.5rem] grid-cols-2 overflow-hidden rounded-xl border"
        data-theme-preview="workbench"
      >
        <WorkbenchPane
          mode={props.lightLabel}
          tokens={props.tokens.light}
          primaryLabel={props.primaryLabel}
          secondaryLabel={props.secondaryLabel}
        />
        <WorkbenchPane
          mode={props.darkLabel}
          tokens={props.tokens.dark}
          primaryLabel={props.primaryLabel}
          secondaryLabel={props.secondaryLabel}
          edge
        />
      </div>
    )
  }
  const chip = size === 'chip'
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

/** Palette strip for the market theme card — filled from preview tokens or catalog colors. */
export function ThemeColorStrip(props: {
  readonly tokens?: ThemeModeTokens
  readonly colors?: readonly string[]
}): ReactNode {
  const swatches = stripColors(props.tokens, props.colors)
  if (swatches.length === 0) return null
  return (
    <div className="flex h-3.5 overflow-hidden rounded-md border border-border/70" data-theme-strip="">
      {swatches.map((hex, index) => (
        <i key={`${hex}-${index}`} className="min-w-0 flex-1" style={{ background: hex }} title={hex} />
      ))}
    </div>
  )
}

function stripColors(tokens: ThemeModeTokens | undefined, colors: readonly string[] | undefined): string[] {
  if (tokens !== undefined) {
    const keys = ['background', 'secondary', 'primary', 'accent', 'muted-foreground'] as const
    const out: string[] = []
    for (const key of keys) {
      const value = tokens[key]
      if (value === undefined || (!value.startsWith('#') && !value.startsWith('rgb'))) continue
      if (out.includes(value)) continue
      out.push(value)
    }
    if (out.length >= 3) return out
  }
  if (colors === undefined) return []
  return colors.filter(c => typeof c === 'string' && c.length > 0)
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

/**
 * Market theme body: light|dark workbench so primary / hover / danger / input all show.
 * Preview-only — no real actions.
 */
function WorkbenchPane(props: {
  readonly mode: string
  readonly tokens: ThemeModeTokens
  readonly primaryLabel: string
  readonly secondaryLabel: string
  readonly edge?: boolean
}): ReactNode {
  const t = props.tokens
  const background = t.background
  const foreground = t.foreground
  const card = t.card ?? background
  const border = t.border ?? 'transparent'
  const muted = t['muted-foreground'] ?? t.muted ?? foreground
  const secondary = t.secondary ?? card
  const secondaryFg = t['secondary-foreground'] ?? foreground
  const primary = t.primary
  const primaryFg = t['primary-foreground'] ?? background
  const accent = t.accent ?? secondary
  const accentFg = t['accent-foreground'] ?? foreground
  const destructive = t.destructive ?? '#c45c5c'
  const destructiveFg = t['destructive-foreground'] ?? '#fff'
  const input = t.input ?? border
  const style = { background, color: foreground } satisfies CSSProperties
  const pill = (bg: string | undefined, fg: string | undefined, label: string) => (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  )
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 p-2.5 text-[11px] leading-tight ${props.edge ? 'border-l border-black/10' : ''}`}
      style={style}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold tracking-[0.14em] uppercase opacity-55">{props.mode}</span>
        <span className="flex-1" />
        {pill(secondary, secondaryFg, props.secondaryLabel)}
        {pill(primary, primaryFg, props.primaryLabel)}
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-0.5 rounded-lg border p-1.5 shadow-sm"
        style={{ background: card, borderColor: border, boxShadow: `0 6px 14px -10px ${foreground ?? '#000'}33` }}
      >
        <Row
          checked
          label="买菜 · 青菜豆腐"
          meta="今天"
          border={border}
          muted={muted}
          {...(primary === undefined ? {} : { fill: primary })}
        />
        <Row
          hover
          label="回消息给小李"
          meta="hover"
          border={border}
          muted={muted}
          {...(primary === undefined ? {} : { fill: primary })}
          {...(accent === undefined ? {} : { accent })}
          {...(accentFg === undefined ? {} : { accentFg })}
        />
        <Row
          label="周末看电影"
          meta="2"
          border={border}
          muted={muted}
          {...(secondary === undefined ? {} : { badgeBg: secondary })}
          {...(secondaryFg === undefined ? {} : { badgeFg: secondaryFg })}
        />
        <div
          className="mt-1 flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px]"
          style={{ borderColor: input, color: muted }}
        >
          <span>随手记</span>
          <span className="h-3 w-px" style={{ background: primary }} />
          <span className="opacity-70">写点什么…</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="underline decoration-from-font underline-offset-2" style={{ color: primary }}>查看全部</span>
          {pill(secondary, secondaryFg, '稍后')}
          {pill(destructive, destructiveFg, '删除')}
          <span className="ml-auto flex items-center gap-1">
            {[primary, accent, destructive, muted].filter(Boolean).map((c, i) => (
              <i key={i} className="size-1.5 rounded-full" style={{ background: c }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

function Row(props: {
  readonly label: string
  readonly meta: string
  readonly border: string
  readonly muted: string | undefined
  readonly checked?: boolean
  readonly hover?: boolean
  readonly fill?: string
  readonly accent?: string
  readonly accentFg?: string
  readonly badgeBg?: string
  readonly badgeFg?: string
}): ReactNode {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-1 py-0.5"
      style={props.hover
        ? { background: props.accent, color: props.accentFg }
        : undefined}
    >
      <span
        className="size-3 shrink-0 rounded-[3px] border"
        style={{
          borderColor: props.checked || props.hover ? (props.fill ?? props.border) : props.border,
          background: props.checked ? props.fill : props.hover ? props.accent : 'transparent',
        }}
      />
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span
        className="shrink-0 text-[10px]"
        style={props.hover
          ? { color: props.accentFg, opacity: 0.85 }
          : props.badgeBg !== undefined
            ? { background: props.badgeBg, color: props.badgeFg, borderRadius: 999, padding: '0 6px', fontWeight: 600 }
            : { color: props.muted }}
      >
        {props.meta}
      </span>
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
    ...pick('accent'),
    ...pick('accent-foreground'),
    ...pick('destructive'),
    ...pick('destructive-foreground'),
    ...pick('input'),
  }
}

function modeBlock(css: string, mode: string): string {
  const match = new RegExp(`data-mode=["']${mode}["'][^{]*\\{([^}]*)\\}`).exec(css)
  if (match?.[1] !== undefined) return match[1]
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
