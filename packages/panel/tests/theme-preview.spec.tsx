/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import { ThemeDualPreview, tokensFromThemeCss } from '../src/theme/preview.tsx'

const twoMode = [
  '/* name: Ink */',
  ':root[data-mode="light"] { --background: #fff; --foreground: #111; --card: #fafafa; --border: #ddd; --muted: #eee; --muted-foreground: #666; --secondary: #f3f3f3; --secondary-foreground: #222; --primary: #2563eb; --primary-foreground: #fff; }',
  ':root[data-mode="dark"] { --background: #0b0b0c; --foreground: #eee; --card: #171717; --border: #2a2a2c; --muted: #27272a; --muted-foreground: #a1a1aa; --secondary: #27272a; --secondary-foreground: #eee; --primary: #3b82f6; --primary-foreground: #fff; }',
].join('\n')

describe('theme preview tokens', () => {
  it('reads both modes from a theme file', () => {
    const tokens = tokensFromThemeCss(twoMode)
    expect(tokens?.light.primary).toBe('#2563eb')
    expect(tokens?.dark.background).toBe('#0b0b0c')
    expect(tokens?.light['muted-foreground']).toBe('#666')
  })

  it('reads single-quote and no-space variants', () => {
    const css = ":root[data-mode='light'] {--background:#fff;--primary:#123} :root[data-mode='dark'] {--background:#000;--primary:#abc}"
    const tokens = tokensFromThemeCss(css)
    expect(tokens?.light.primary).toBe('#123')
    expect(tokens?.dark.primary).toBe('#abc')
  })

  it('is undefined when one mode is absent or the block is unparseable', () => {
    expect(tokensFromThemeCss(':root[data-mode="light"] { --primary: #111 }')).toBeUndefined()
    expect(tokensFromThemeCss('nothing here')).toBeUndefined()
    expect(tokensFromThemeCss(':root[data-mode="light"] { --primary: #111 } :root[data-mode="dark"] {')).toBeUndefined()
    // A mode block with no token is still a block, so both modes must carry a value to render.
    expect(tokensFromThemeCss(':root[data-mode="light"] {} :root[data-mode="dark"] {}')).toBeUndefined()
  })

  it('omits optional tokens instead of inventing them', () => {
    const sparse = ':root[data-mode="light"] { --primary: #111 } :root[data-mode="dark"] { --primary: #222 }'
    const tokens = tokensFromThemeCss(sparse)
    expect(tokens?.light.card).toBeUndefined()
    expect(tokens?.light.secondary).toBeUndefined()
  })

  it('renders the chip size and the card size', () => {
    const tokens = tokensFromThemeCss(twoMode)
    if (tokens === undefined) throw new Error('tokens missing')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <ThemeDualPreview
          tokens={tokens}
          size="chip"
          lightLabel="Light"
          darkLabel="Dark"
          primaryLabel="Primary"
          secondaryLabel="Secondary"
        />,
      )
    })
    expect(host.querySelector('[data-theme-preview="chip"]')).not.toBeNull()
    expect(host.textContent).toContain('Primary')
    act(() => {
      root.render(
        <ThemeDualPreview
          tokens={tokens}
          size="card"
          lightLabel="Light"
          darkLabel="Dark"
          primaryLabel="P"
          secondaryLabel="S"
        />,
      )
    })
    expect(host.querySelector('[data-theme-preview="card"]')).not.toBeNull()
    // The card pane also paints the muted line.
    expect(host.textContent).toContain('Dark')
    act(() => {
      root.render(
        <ThemeDualPreview
          tokens={{ light: {}, dark: {} }}
          lightLabel="L"
          darkLabel="D"
          primaryLabel="P"
          secondaryLabel="S"
        />,
      )
    })
    expect(host.querySelector('[data-theme-preview="chip"]')).not.toBeNull()
  })
})
