import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { AppSummary } from '../apps/registry.ts'
import { builtinThemesDir, customThemeId, customThemePath, themeLayout, appThemeCss, appThemePin } from './layout.ts'
import { ThemeError } from './codes.ts'
import { styleFromThemeCss } from './paint.ts'
import { parseThemeCss } from './parse.ts'

export type AppPin =
  | { kind: 'default' }
  | { kind: 'follow-host' }
  | { kind: 'app-file' }
  | { kind: 'palette'; id: string }

export interface PaletteList {
  palettes: Array<{ id: string; name: string; nameZh?: string; swatch: string; style: string; origin: 'builtin' | 'custom' }>
  ignored: Array<{ file: string; reason: string }>
}

interface Registry {
  get: (appId: string) => Promise<AppSummary>
}

/**
 * Owner pin and palette list. Panel HTTP calls these through the loopback routes.
 * @param registry - registered apps
 * @param themesDir - host-global custom theme directory; creating it is allowed, listing does not require it
 */
export function createThemePins(registry: Registry, themesDir: string) {
  return {
    listPalettes: () => listPalettes(themesDir),
    deletePalette: (id: string) => deleteCustomPalette(themesDir, id),
    readPin: (appId: string) => readPin(registry, appId),
    appFile: (appId: string) => appFileParsed(registry, appId),
    readAppTheme: (appId: string) => readAppTheme(registry, appId),
    setPin: (appId: string, pin: AppPin) => setPin(registry, themesDir, appId, pin),
  }
}

/** Remove a user theme file. Builtin shipped themes cannot be deleted. */
async function deleteCustomPalette(themesDir: string, id: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new ThemeError('theme-invalid', 'palette id is invalid')
  const file = customThemePath(themesDir, id)
  const text = await readFile(file, 'utf8').catch(() => undefined)
  if (text === undefined) throw new ThemeError('theme-invalid', 'custom palette is missing')
  await rm(file, { force: true })
  await rm(path.join(themesDir, `.market-${id}.lock`), { force: true })
}

async function listPalettes(themesDir: string): Promise<PaletteList> {
  const palettes = await readThemeDir(builtinThemesDir(), [])
  const ignored: PaletteList['ignored'] = []
  const names = await readdir(themesDir).catch(() => [])
  for (const file of names) {
    if (file.startsWith('.') || file.endsWith('.lock')) continue
    const id = customThemeId(file)
    if (id === undefined) {
      ignored.push({ file, reason: 'file name is not theme-<id>.css' })
      continue
    }
    const text = await readFile(customThemePath(themesDir, id), 'utf8').catch(() => undefined)
    if (text === undefined) {
      ignored.push({ file, reason: 'theme file is unreadable' })
      continue
    }
    const parsed = parseThemeCss(text, id)
    if (!parsed.ok) {
      ignored.push({ file, reason: parsed.reason })
      continue
    }
    const at = palettes.findIndex(item => item.id === id)
    if (at >= 0) palettes.splice(at, 1)
    palettes.push(paletteRow(id, parsed.theme, text, 'custom'))
  }
  return { palettes, ignored }
}

async function readThemeDir(dir: string, ignored: PaletteList['ignored']): Promise<PaletteList['palettes']> {
  const palettes: PaletteList['palettes'] = []
  const names = await readdir(dir).catch(() => [])
  for (const file of names) {
    const id = customThemeId(file)
    if (id === undefined) continue
    const text = await readFile(customThemePath(dir, id), 'utf8').catch(() => undefined)
    if (text === undefined) continue
    const parsed = parseThemeCss(text, id)
    if (!parsed.ok) {
      ignored.push({ file, reason: parsed.reason })
      continue
    }
    palettes.push(paletteRow(id, parsed.theme, text, 'builtin'))
  }
  return palettes
}

function paletteRow(
  id: string,
  theme: { name: string; nameZh?: string },
  text: string,
  origin: 'builtin' | 'custom',
): PaletteList['palettes'][number] {
  return {
    id,
    name: theme.name,
    ...theme.nameZh === undefined ? {} : { nameZh: theme.nameZh },
    swatch: swatchOf(text),
    style: styleFromThemeCss(text),
    origin,
  }
}

function swatchOf(css: string): string {
  const light = css.split('[data-mode="dark"]')[0] ?? css
  const match = /--primary:\s*([^;]+)/.exec(light)
  const value = match?.[1]?.trim()
  return value !== undefined && value.length > 0 ? value : '#888'
}

async function readPin(registry: Registry, appId: string): Promise<AppPin> {
  const app = await registry.get(appId)
  const text = await readFile(appThemePin(app.directory), 'utf8').catch(() => undefined)
  if (text === undefined) return { kind: 'default' }
  return admitPin(text)
}

async function setPin(registry: Registry, themesDir: string, appId: string, pin: AppPin): Promise<AppPin> {
  const app = await registry.get(appId)
  const file = appThemePin(app.directory)
  if (pin.kind === 'default') {
    await rm(file, { force: true })
    return { kind: 'default' }
  }
  if (pin.kind === 'palette') await assertPalette(themesDir, pin.id)
  if (pin.kind === 'app-file') await assertAppFile(app.directory)
  const previous = await readFile(file, 'utf8').catch(() => undefined)
  try {
    await writeFile(file, `${JSON.stringify({ palette: stored(pin) })}\n`)
    return pin
  } catch (error) {
    if (previous === undefined) await rm(file, { force: true })
    else await writeFile(file, previous)
    throw error
  }
}

async function assertPalette(themesDir: string, id: string): Promise<void> {
  const listed = await listPalettes(themesDir)
  if (listed.palettes.some(item => item.id === id)) return
  throw new ThemeError('theme-invalid', `unknown palette: ${id}`)
}

async function assertAppFile(appDir: string): Promise<void> {
  const parsed = await readAppFile(appDir)
  if (parsed === undefined) throw new ThemeError('theme-invalid', 'app theme.css is missing')
  if (!parsed.ok) throw new ThemeError('theme-invalid', parsed.reason)
}

async function appFileParsed(registry: Registry, appId: string): Promise<boolean> {
  const app = await registry.get(appId)
  const parsed = await readAppFile(app.directory)
  return parsed?.ok === true
}

async function readAppTheme(registry: Registry, appId: string): Promise<{
  name?: string
  nameZh?: string
  swatch: string
  style: string
} | null> {
  const app = await registry.get(appId)
  const text = await readFile(appThemeCss(app.directory), 'utf8').catch(() => undefined)
  if (text === undefined) return null
  const parsed = parseThemeCss(text, 'app')
  if (!parsed.ok) return null
  const named = parsed.theme.name !== 'app'
  return {
    ...named ? { name: parsed.theme.name } : {},
    ...parsed.theme.nameZh === undefined ? {} : { nameZh: parsed.theme.nameZh },
    swatch: swatchOf(text),
    style: styleFromThemeCss(text),
  }
}

async function readAppFile(appDir: string) {
  const text = await readFile(appThemeCss(appDir), 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  return parseThemeCss(text, themeLayout.appFile)
}

function stored(pin: Exclude<AppPin, { kind: 'default' }>): string {
  if (pin.kind === 'follow-host') return themeLayout.followHost
  if (pin.kind === 'app-file') return themeLayout.appFile
  return pin.id
}

function admitPin(text: string): AppPin {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { kind: 'default' }
  }
  if (typeof parsed !== 'object' || parsed === null || !('palette' in parsed) || typeof parsed.palette !== 'string') {
    return { kind: 'default' }
  }
  if (parsed.palette === themeLayout.followHost) return { kind: 'follow-host' }
  if (parsed.palette === themeLayout.appFile) return { kind: 'app-file' }
  return { kind: 'palette', id: parsed.palette }
}
