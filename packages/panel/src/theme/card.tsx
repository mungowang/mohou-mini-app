import type { KeyboardEvent, ReactNode } from 'react'

import { ThemeColorStrip, ThemeDualPreview, type ThemeDualTokens } from './preview.tsx'

/**
 * Shared theme body for the market theme row and the Settings palette picker.
 * Strip + workbench own the height; title and actions sit above.
 */
export function ThemePreviewCard(props: {
  readonly title: string
  readonly description?: string
  readonly badge?: ReactNode
  readonly headerEnd?: ReactNode
  readonly tokens?: ThemeDualTokens
  readonly colors?: readonly string[]
  /** Painted when tokens are missing (one-mode files, bare swatches). */
  readonly fallback?: ReactNode
  readonly lightLabel: string
  readonly darkLabel: string
  readonly primaryLabel: string
  readonly secondaryLabel: string
  readonly footer?: ReactNode
  readonly overlay?: ReactNode
  readonly selected?: boolean
  /** Shown next to the title when selected (Settings palette). */
  readonly selectedLabel?: string
  readonly disabled?: boolean
  readonly onSelect?: () => void
  readonly 'data-palette'?: string
  readonly 'data-market-card'?: string
}): ReactNode {
  const selected = props.selected === true
  const className = [
    'relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left outline-none transition-[box-shadow,border-color,background-color]',
    props.onSelect === undefined ? '' : 'w-full hover:border-foreground/25',
    selected
      ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-background'
      : 'border-border',
  ].filter(Boolean).join(' ')
  const body = (
    <>
      <div className={`flex items-start gap-3 px-4 pt-3.5 pb-2 ${selected ? 'border-b border-primary/15' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="m-0 truncate text-[15px] font-semibold tracking-tight">{props.title}</h2>
            {props.badge}
            {selected && props.selectedLabel !== undefined && props.selectedLabel.length > 0 ? (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground">
                {props.selectedLabel}
              </span>
            ) : null}
          </div>
          {props.description === undefined || props.description.length === 0 ? null : (
            <p className="mt-0.5 truncate text-[12px] leading-5 text-muted-foreground">{props.description}</p>
          )}
        </div>
        {props.headerEnd === undefined ? null : (
          <div className="flex shrink-0 items-center gap-2" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
            {props.headerEnd}
          </div>
        )}
      </div>
      <div className="px-4">
        <ThemeColorStrip
          {...(props.tokens?.light === undefined ? {} : { tokens: props.tokens.light })}
          {...(props.colors === undefined ? {} : { colors: props.colors })}
        />
      </div>
      <div className="mt-2.5 px-4">
        {props.tokens !== undefined ? (
          <ThemeDualPreview
            size="workbench"
            tokens={props.tokens}
            lightLabel={props.lightLabel}
            darkLabel={props.darkLabel}
            primaryLabel={props.primaryLabel}
            secondaryLabel={props.secondaryLabel}
          />
        ) : props.fallback !== undefined ? (
          props.fallback
        ) : null}
      </div>
      {/* Same bottom pad as the market theme card, with or without meta. */}
      <div className="mt-auto flex min-h-10 items-center gap-2.5 px-4 pt-2.5 pb-3 text-[11px] text-muted-foreground">
        {props.footer}
      </div>
      {props.overlay}
    </>
  )
  const selectable = props.onSelect !== undefined && props.disabled !== true
  const selectProps = selectable
    ? {
      role: 'button' as const,
      tabIndex: 0,
      onClick: props.onSelect,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onSelect?.()
        }
      },
    }
    : {}
  return (
    <article
      className={`${className}${selectable ? ' cursor-pointer' : ''}`}
      data-on={selected ? '1' : '0'}
      {...(props['data-palette'] === undefined ? {} : { 'data-palette': props['data-palette'] })}
      {...(props['data-market-card'] === undefined ? {} : { 'data-market-card': props['data-market-card'] })}
      {...selectProps}
    >
      {body}
    </article>
  )
}
