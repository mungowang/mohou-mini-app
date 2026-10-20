import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  appThemeCss,
  appThemePin,
  createAppRegistry,
  createHostEvents,
  createThemePins,
  reloadView,
} from '../src/index.ts'

const good = `
/* name: Moss */
:root[data-mode="light"] { --background: white; --foreground: black; --primary: blue; }
:root[data-mode="dark"] { --background: black; --foreground: white; --primary: blue; }
`

const files = {
  'manifest.json': JSON.stringify({
    id: 'com.example.app',
    name: 'Example',
    description: 'One line',
    version: '1',
    entry: 'ui.tsx',
  }),
  'ui.tsx': 'export {}',
  'main.api.ts': 'export {}\n',
}

describe('theme pin', () => {
  it('lists palettes, stores a follow-host pin, and does not delete theme.css', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-theme-'))
    const themes = join(root, 'themes')
    const registry = createAppRegistry(root)
    await registry.register('com.example.app', files)
    const app = await registry.get('com.example.app')
    await mkdir(themes)
    await writeFile(join(themes, 'theme-moss.css'), good)
    await writeFile(join(themes, 'notes.txt'), 'nope')
    await writeFile(join(themes, 'theme-no_good.css'), good)
    await writeFile(join(themes, 'theme-bad.css'), ':root[data-mode="light"] { --background: white; }')
    await writeFile(join(themes, 'theme-plain.css'), good.replace('/* name: Moss */', '/* name: */'))
    const pins = createThemePins(registry, themes)
    expect(await pins.appFile('com.example.app')).toBe(false)
    expect(await pins.readAppTheme('com.example.app')).toBeNull()
    await writeFile(appThemeCss(app.directory), good)
    expect(await pins.appFile('com.example.app')).toBe(true)
    expect(await pins.readAppTheme('com.example.app')).toEqual(expect.objectContaining({ name: 'Moss', swatch: 'blue' }))
    await writeFile(appThemeCss(app.directory), ':root { }')
    expect(await pins.appFile('com.example.app')).toBe(false)
    expect(await pins.readAppTheme('com.example.app')).toBeNull()
    await writeFile(appThemeCss(app.directory), good.replace('/* name: Moss */', '/* name: Moss */\n/* name-zh-CN: 苔 */'))
    expect(await pins.readAppTheme('com.example.app')).toEqual(expect.objectContaining({ name: 'Moss', nameZh: '苔' }))
    await writeFile(appThemeCss(app.directory), good.replace('/* name: Moss */\n', ''))
    expect((await pins.readAppTheme('com.example.app'))?.name).toBeUndefined()
    await writeFile(appThemeCss(app.directory), good)
    const listed = await pins.listPalettes()
    expect(listed.palettes).toContainEqual(expect.objectContaining({ id: 'moss', name: 'Moss', swatch: 'blue', origin: 'custom' }))
    expect(listed.palettes.find(item => item.id === 'moss')?.style).toContain('--primary:blue')
    expect(listed.palettes).toContainEqual(expect.objectContaining({ id: 'plain', name: 'plain', swatch: 'blue' }))
    expect(listed.palettes).toContainEqual(expect.objectContaining({
      id: 'slate',
      name: 'Graphite',
      nameZh: '石墨',
      swatch: '#27272a',
      origin: 'builtin',
    }))
    await writeFile(join(themes, 'theme-tokyo.css'), good.replace('Moss', 'Night'))
    expect((await pins.listPalettes()).palettes).toContainEqual(expect.objectContaining({ id: 'tokyo', name: 'Night', swatch: 'blue', origin: 'custom' }))
    expect(listed.ignored.map(item => item.file).sort()).toEqual(['notes.txt', 'theme-bad.css', 'theme-no_good.css'])
    await writeFile(appThemeCss(app.directory), good)
    expect(await pins.setPin('com.example.app', { kind: 'follow-host' })).toEqual({ kind: 'follow-host' })
    expect(await readFile(appThemeCss(app.directory), 'utf8')).toContain('--background')
    expect(await pins.readPin('com.example.app')).toEqual({ kind: 'follow-host' })
    await expect(pins.setPin('com.example.app', { kind: 'palette', id: 'nope' })).rejects.toMatchObject({ code: 'theme-invalid' })
    expect(await pins.readPin('com.example.app')).toEqual({ kind: 'follow-host' })
    expect(await pins.setPin('com.example.app', { kind: 'palette', id: 'moss' })).toEqual({ kind: 'palette', id: 'moss' })
    expect(await pins.setPin('com.example.app', { kind: 'default' })).toEqual({ kind: 'default' })
    await expect(readFile(appThemePin(app.directory), 'utf8')).rejects.toThrow()
    const events = createHostEvents()
    const seen: string[] = []
    events.subscribe((event) => {
      if (event.type === 'app:reload') seen.push(event.appId)
    })
    await reloadView(registry, (event) => {
      events.publish(event)
    }, 'com.example.app')
    expect(seen).toEqual(['com.example.app'])
    await expect(reloadView(registry, () => undefined, 'com.example.missing')).rejects.toMatchObject({ code: 'app-not-registered' })
    expect(await pins.setPin('com.example.app', { kind: 'app-file' })).toEqual({ kind: 'app-file' })
    expect(await pins.setPin('com.example.app', { kind: 'palette', id: 'slate' })).toEqual({ kind: 'palette', id: 'slate' })
    await writeFile(appThemePin(app.directory), 'not-json')
    expect(await pins.readPin('com.example.app')).toEqual({ kind: 'default' })
    await writeFile(appThemePin(app.directory), '{ "palette": 1 }\n')
    expect(await pins.readPin('com.example.app')).toEqual({ kind: 'default' })
    await writeFile(appThemePin(app.directory), 'null\n')
    expect(await pins.readPin('com.example.app')).toEqual({ kind: 'default' })
    const empty = createThemePins(registry, join(root, 'missing-themes'))
    expect((await empty.listPalettes()).palettes.some(item => item.id === 'verdant')).toBe(true)
    await writeFile(appThemeCss(app.directory), ':root { --background: white; }')
    await expect(pins.setPin('com.example.app', { kind: 'app-file' })).rejects.toMatchObject({ code: 'theme-invalid' })
    await writeFile(appThemeCss(app.directory), good)
    await writeFile(appThemePin(app.directory), `${JSON.stringify({ palette: 'moss' })}\n`)
    await chmod(appThemePin(app.directory), 0o444)
    await expect(pins.setPin('com.example.app', { kind: 'follow-host' })).rejects.toThrow()
    await chmod(appThemePin(app.directory), 0o644)
    expect(await readFile(appThemePin(app.directory), 'utf8')).toContain('moss')
    await rm(appThemePin(app.directory), { force: true })
    await mkdir(appThemePin(app.directory))
    await expect(pins.setPin('com.example.app', { kind: 'follow-host' })).rejects.toThrow()
    await rm(appThemePin(app.directory), { recursive: true, force: true })
    const locked = join(themes, 'theme-locked.css')
    await writeFile(locked, good.replace('Moss', 'Locked'))
    await chmod(locked, 0)
    const afterLock = await pins.listPalettes()
    expect(afterLock.palettes.some(item => item.id === 'locked')).toBe(false)
    expect(afterLock.ignored.some(item => item.file === 'theme-locked.css')).toBe(true)
    await chmod(locked, 0o644)
    await writeFile(join(themes, 'theme-drop-me.css'), good.replace('Moss', 'Drop'))
    expect((await pins.listPalettes()).palettes.some(item => item.id === 'drop-me')).toBe(true)
    await pins.deletePalette('drop-me')
    expect((await pins.listPalettes()).palettes.some(item => item.id === 'drop-me')).toBe(false)
    await expect(pins.deletePalette('default')).rejects.toMatchObject({ code: 'theme-invalid' })
    await expect(pins.deletePalette('drop-me')).rejects.toMatchObject({ code: 'theme-invalid' })
  })
})
