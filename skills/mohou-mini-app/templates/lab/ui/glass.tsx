import type { CSSProperties } from 'react'

/**
 * Glass Island is authored inline: Tailwind drops multi-layer inset shadows, and the look's
 * identity is the stack of them. Values are tokens only — a hex here would break the host
 * palette and both modes.
 */
/**
 * A chip in this app is a raw `<button>`, not the kit's `Button`. Preflight leaves buttons with
 * `appearance: button`, so the system draws a button face on interaction that no background-color
 * removes; the reset is here. With no background of its own the browser paints its default face
 * too — invisible on a white card, a white band on the translucent wells this app uses.
 *
 * Each chip states its background in every branch (`bg-primary` when selected, `bg-transparent`
 * when not) which also keeps the two from competing: the order of classes in the attribute does
 * not decide which wins, the order in the stylesheet does.
 */
export const CHIP =
  'appearance-none border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50'

export const GLASS: CSSProperties = {
  borderRadius: 'var(--radius)',
  backgroundColor: 'color-mix(in oklch, var(--card) 34%, transparent)',
  boxShadow:
    'inset 0 1px 0 color-mix(in oklch, var(--card) 60%, transparent),' +
    'inset 0 -1px 0 color-mix(in oklch, var(--card) 22%, transparent),' +
    'inset 0 0 24px color-mix(in oklch, var(--card) 14%, transparent),' +
    '0 14px 36px -10px var(--shadow)',
  border: '1px solid color-mix(in oklch, var(--card) 28%, transparent)',
  // Chromium bends the backdrop through the SVG displacement filter; other engines fall back to
  // plain frost, and the `backdropFilter` declaration is simply ignored there.
  backdropFilter: 'blur(2px) saturate(160%)',
  WebkitBackdropFilter: 'blur(2px) saturate(160%)',
}

/**
 * The working set is a soft card, NOT liquid glass. The look wants the cluster to float in the
 * sky, which only reads if the large interiors stay opaque.
 */
export const WORK: CSSProperties = {
  borderRadius: 'calc(var(--radius) - 8px)',
  backgroundColor: 'color-mix(in oklch, var(--surface) 92%, transparent)',
  border: '1px solid color-mix(in oklch, var(--border) 70%, transparent)',
  boxShadow: '0 10px 30px -18px var(--shadow)',
}

/** A quieter inset for inputs and small wells inside a soft card. */
export const WELL: CSSProperties = {
  borderRadius: 'calc(var(--radius) - 14px)',
  backgroundColor: 'color-mix(in oklch, var(--muted) 55%, transparent)',
  border: '1px solid color-mix(in oklch, var(--border) 60%, transparent)',
}

/**
 * ⭐ The SVG displacement filter the glass references. Rendered once by the root, hidden, and
 * addressed by `url(#mma-lab-liquid)` in `GLASS.backdropFilter`.
 */
export function LiquidFilter() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0">
      <defs>
        <filter id="mma-lab-liquid" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale={45} xChannelSelector="R" yChannelSelector="B" />
        </filter>
      </defs>
    </svg>
  )
}

/**
 * The haze sky: large soft orbs plus a grain layer. Without grain the lens bends a flat field and
 * the glass reads as plain frost, so the grain is not decoration here.
 */
export function Sky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-24 -left-16 size-[26rem] rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in oklch, var(--primary) 34%, transparent)' }}
      />
      <div
        className="absolute top-1/4 -right-24 size-[30rem] rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in oklch, var(--accent) 62%, transparent)' }}
      />
      <div
        className="absolute -bottom-32 left-1/4 size-[22rem] rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in oklch, var(--secondary) 70%, transparent)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}

/** ms → a short human string. Used on every record row and every step. */
export function ms(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.floor(value / 60_000)}m${Math.round((value % 60_000) / 1000)}s`
}

export function clock(at: number | null | undefined): string {
  if (!at) return '—'
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false })
}

export function stamp(at: number | null | undefined): string {
  if (!at) return '—'
  const d = new Date(at)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${clock(at)}`
}

export function clip(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** Try to read text as JSON so the viewer can tree it; otherwise it is shown verbatim. */
export function asJson(text: string): unknown {
  const raw = text.trim()
  if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
