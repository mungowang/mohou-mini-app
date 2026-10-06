import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { appCardCss } from '../src/app-card-css.ts'
import { AppCard, appCardStyles } from '../src/app-card.tsx'

const app = { id: 'com.example.todo', name: 'Todo', description: 'A list', version: '1', acronym: 'TO' }

describe('AppCard', () => {
  it('draws each style, and only glass uses featured', () => {
    for (const type of appCardStyles) {
      const markup = renderToStaticMarkup(createElement(AppCard, {
        type,
        app,
        open: true,
        openLabel: 'Open',
        extra: { featured: type === 'glass' },
        onOpen: () => undefined,
      }))
      expect(markup).toContain(`data-card="${type}"`)
    }
    const glass = renderToStaticMarkup(createElement(AppCard, {
      type: 'glass',
      app,
      extra: { featured: true },
      onOpen: () => undefined,
    }))
    expect(glass).toContain('mma-feature')
    const stamp = renderToStaticMarkup(createElement(AppCard, {
      type: 'stamp',
      app,
      extra: { featured: true },
      onOpen: () => undefined,
    }))
    expect(stamp).not.toContain('mma-feature')
    const regular = renderToStaticMarkup(createElement(AppCard, {
      type: 'glass',
      app,
      onOpen: () => undefined,
    }))
    expect(regular).not.toContain('mma-feature')
    expect(regular).toContain('mma-glass-name')
    expect(regular).toContain('mma-glass-copy')
  })

  it('lifts a glass card on hover without changing what is behind it', () => {
    const from = appCardCss.indexOf('.mma-glass:hover')
    const hover = appCardCss.slice(from, appCardCss.indexOf('}', from) + 1)
    expect(hover).toContain('translateY(-4px)')
    expect(hover).toContain('box-shadow')
    // A background here would sit behind whatever the card holds, since :hover reaches ancestors.
    expect(hover).not.toContain('background:')
  })

  it('paints glass marks with the app hue and a geometric system stack', () => {
    expect(appCardCss).toContain('Avenir Next')
    expect(appCardCss).toContain('Bahnschrift')
    expect(appCardCss).toContain('PingFang SC')
    expect(appCardCss).toContain('DengXian')
    expect(appCardCss).toContain('hsl(var(--h) 48% 46%)')
    expect(appCardCss).toContain('.mma-feature .mma-mark{font-size:48px')
  })
})
