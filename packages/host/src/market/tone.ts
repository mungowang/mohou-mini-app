/** Groups computed from the first color. Bounds are host policy. */
export const themeTones = ['dark', 'red', 'warm', 'green', 'blue', 'neutral'] as const
export type ThemeTone = (typeof themeTones)[number]

/**
 * One group from the primary color. A bad color is `neutral`.
 * @param hex - `#rgb` or `#rrggbb`
 */
export function toneOf(hex: string): ThemeTone {
  const hsl = toHsl(hex)
  if (hsl === undefined) return 'neutral'
  if (hsl.l <= 0.2) return 'dark'
  if (hsl.s < 0.2) return 'neutral'
  const hue = hsl.h
  if (hue <= 15 || hue >= 345) return 'red'
  if (hue < 50) return 'warm'
  if (hue >= 70 && hue <= 160) return 'green'
  if (hue >= 190 && hue <= 250) return 'blue'
  return 'neutral'
}

function toHsl(hex: string): { h: number; s: number; l: number } | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (match === null || match[1] === undefined) return undefined
  const digits = match[1].length === 3
    ? match[1].split('').map(char => char + char).join('')
    : match[1]
  const r = Number.parseInt(digits.slice(0, 2), 16) / 255
  const g = Number.parseInt(digits.slice(2, 4), 16) / 255
  const b = Number.parseInt(digits.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r
    ? ((g - b) / d) % 6
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}
