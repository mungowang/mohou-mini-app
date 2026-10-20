import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { appThemeCss, resolveFirstPaint } from '../src/index.ts'

const css = `
:root[data-mode="light"] { --background: white; --foreground: black; --primary: blue; --card: snow; --radius: ; --bg: ignored; }
:root[data-mode="dark"] { --background: black; --foreground: white; --primary: blue; }
`

describe('first paint', () => {
  it('bakes theme.css unless the pin follows the host', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-paint-'))
    const themes = join(dir, 'themes')
    await writeFile(appThemeCss(dir), css)
    const local = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'default' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(local.source).toBe('app-file')
    expect(local.light['--background']).toBe('white')
    expect(local.light['--card']).toBe('snow')
    expect(local.light).not.toHaveProperty('--bg')
    expect(local.light['--destructive']).toBeUndefined()
    expect(local.style).toContain('--background:white')
    expect(local.style).not.toContain('#')
    const host = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'follow-host' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(host).toMatchObject({ source: 'builtin', paletteId: 'slate' })
    expect(host.light['--background']).toBe('#ececee')
    const named = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'palette', id: 'matcha' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(named).toMatchObject({ source: 'builtin', paletteId: 'matcha' })
    expect(named.light['--background']).toBe('#faf5f3')
    await mkdir(themes)
    await writeFile(join(themes, 'theme-matcha.css'), css)
    const overridden = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'palette', id: 'matcha' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(overridden.source).toBe('custom')
    expect(overridden.light['--background']).toBe('white')
    await writeFile(join(themes, 'theme-moss.css'), css)
    const custom = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'palette', id: 'moss' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(custom.source).toBe('custom')
    expect(custom.light['--foreground']).toBe('black')
    await writeFile(join(themes, 'theme-bad.css'), ':root { --background: white; }')
    const fell = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'palette', id: 'bad' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(fell.source).toBe('app-file')
    expect(fell.ignored).toContain('bad')
    await writeFile(appThemeCss(dir), ':root { --background: white; }')
    const ignored = await resolveFirstPaint({
      appDir: dir,
      pin: { kind: 'app-file' },
      hostPalette: 'slate',
      themesDir: themes,
    })
    expect(ignored).toMatchObject({ source: 'builtin', paletteId: 'slate' })
    expect(ignored.ignored).toContain('theme.css')
    const bare = await mkdtemp(join(tmpdir(), 'mma-paint-bare-'))
    const missing = await resolveFirstPaint({
      appDir: bare,
      pin: { kind: 'palette', id: 'gone' },
      hostPalette: 'default',
      themesDir: themes,
    })
    expect(missing).toMatchObject({ source: 'builtin', paletteId: 'default' })
    expect(missing.ignored).toContain('gone')
    const absent = await resolveFirstPaint({
      appDir: bare,
      pin: { kind: 'follow-host' },
      hostPalette: 'missing-palette',
      themesDir: themes,
    })
    expect(absent).toMatchObject({ source: 'host', paletteId: 'missing-palette', style: '' })
  })
})
