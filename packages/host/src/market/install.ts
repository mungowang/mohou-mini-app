import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

import { commitApp } from '../history/store.ts'
import { hostLayout } from '../host/layout.ts'
import { runNpm, type NpmRun } from '../install/install.ts'
import { storageDatabase } from '../storage/layout.ts'
import { parseThemeCss } from '../theme/parse.ts'
import type { CatalogRow } from './catalog.ts'
import { MarketError } from './error.ts'
import { sourceSum } from './sum.ts'

const kept = new Set(['storage', 'logs', 'theme.json', '.git', '.market.lock'])

export interface MarketLock {
  readonly id: string
  readonly package: string
  readonly version: string
  readonly sum: string
  readonly installedAt: string
}

/**
 * Copy `package/app` into the app directory. Refuses before any write.
 * @param input - the extracted package root and the catalog row
 */
export async function installAppTree(input: {
  readonly runtimeRoot: string
  readonly packageRoot: string
  readonly row: CatalogRow
  readonly expectedSum: string
  readonly confirm: boolean
  readonly now?: string
  readonly runNpm?: NpmRun
}): Promise<void> {
  const source = path.join(input.packageRoot, 'app')
  if (!existsSync(path.join(source, 'manifest.json'))) {
    throw new MarketError('market-package', 'app package has no app/manifest.json')
  }
  const sum = sourceSum(source)
  if (sum !== input.expectedSum) throw new MarketError('market-sum', 'app package sum does not match')
  const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8')) as { id?: string }
  if (manifest.id !== input.row.id) throw new MarketError('market-id', 'app package id does not match the catalog')
  const dest = path.join(input.runtimeRoot, hostLayout.apps, input.row.id)
  const lock = readLock(dest)
  if (lock !== undefined && lock.id !== input.row.id) throw new MarketError('market-id', 'installed app id does not match')
  assertSchema(dest, source)
  const modified = existsSync(dest) && sourceSum(dest) !== lock?.sum
  if (existsSync(dest) && (lock === undefined || modified) && !input.confirm) {
    throw new MarketError('market-confirm', 'local source has changes. Confirm to replace it. Records stay. To keep the edits, back up this app history first, then replay them after the update. Or rename this app, install the official id, and merge one into the other.')
  }
  const previousLock = readOptional(path.join(dest, 'package-lock.json'))
  const previousManifest = readOptional(path.join(dest, 'package.json'))
  if (existsSync(dest)) await commitApp(dest, `Keep local edits in ${input.row.id}`)
  mkdirSync(dest, { recursive: true })
  replaceSource(source, dest)
  try {
    await reinstallWhenLockChanged(dest, previousLock, input.runNpm)
  } catch (error) {
    restoreOptional(path.join(dest, 'package.json'), previousManifest)
    restoreOptional(path.join(dest, 'package-lock.json'), previousLock)
    throw error
  }
  await commitApp(dest, `Update ${input.row.id} to ${input.row.version}`)
  writeLock(dest, {
    id: input.row.id,
    package: input.row.package,
    version: input.row.version,
    sum,
    installedAt: input.now ?? new Date().toISOString(),
  })
  rmSync(path.join(dest, '.autogen'), { recursive: true, force: true })
}

/**
 * Copy one theme file. The package holds every theme.
 * @param input - themes directory and the file bytes already checked
 */
export function installThemeFile(input: {
  readonly themesDir: string
  readonly fileName: string
  readonly css: string
  readonly row: CatalogRow
  readonly packageSum: string
  readonly expectedSum: string
  readonly confirm: boolean
  readonly now?: string
}): void {
  if (input.packageSum !== input.expectedSum) throw new MarketError('market-sum', 'theme package sum does not match')
  if (!/^theme-[a-z0-9-]+\.css$/.test(input.fileName)) throw new MarketError('market-id', 'theme file name is invalid')
  if (!/^[a-z0-9-]+$/.test(input.row.id)) throw new MarketError('market-id', 'theme id is invalid')
  const parsed = parseThemeCss(input.css, input.row.id)
  if (!parsed.ok) throw new MarketError('market-package', `theme file is invalid: ${parsed.reason}`)
  const fileSum = createHash('sha256').update(input.css).digest('hex')
  mkdirSync(input.themesDir, { recursive: true })
  const dest = path.join(input.themesDir, input.fileName)
  const lockPath = themeLockPath(input.themesDir, input.row.id)
  const exists = existsSync(dest)
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) as MarketLock : undefined
  if (exists && lock === undefined && !input.confirm) {
    throw new MarketError('market-confirm', 'theme file was not installed from the market. Confirm to replace that file.')
  }
  writeFileSync(dest, input.css)
  writeFileSync(lockPath, `${JSON.stringify({
    id: input.row.id,
    package: input.row.package,
    version: input.row.version,
    sum: fileSum,
    installedAt: input.now ?? new Date().toISOString(),
  })}\n`)
}

/** Sum of every `theme-*.css` under the package, paths sorted. */
export function themesPackageSum(packageRoot: string): string {
  const hash = createHash('sha256')
  for (const file of themeFiles(packageRoot)) {
    hash.update(file.name)
    hash.update(file.css)
  }
  return hash.digest('hex')
}

/** Read one theme file from a themes package. Looks in `themes/` then the package root. */
export function readThemeCss(packageRoot: string, fileName: string): string {
  const nested = path.join(packageRoot, 'themes', fileName)
  if (existsSync(nested)) return readFileSync(nested, 'utf8')
  const root = path.join(packageRoot, fileName)
  if (existsSync(root)) return readFileSync(root, 'utf8')
  throw new MarketError('market-package', `theme file is missing: ${fileName}`)
}

/** Light and dark tokens for a dummy preview. Missing optional tokens are omitted. */
export function themePreview(css: string): ThemePreview | undefined {
  const light = modeTokens(css, 'light')
  const dark = modeTokens(css, 'dark')
  if (light === undefined || dark === undefined) return undefined
  return { light, dark }
}

export interface ThemePreview {
  readonly light: ThemeModePreview
  readonly dark: ThemeModePreview
}

export interface ThemeModePreview {
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

/** Market lock for one installed theme. Hidden so the palette scanner ignores it. */
export function themeLockPath(themesDir: string, id: string): string {
  return path.join(themesDir, `.market-${id}.lock`)
}

export function readLock(appDir: string): MarketLock | undefined {
  const file = path.join(appDir, '.market.lock')
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8')) as MarketLock
}

function writeLock(appDir: string, lock: MarketLock): void {
  writeFileSync(path.join(appDir, '.market.lock'), `${JSON.stringify(lock)}\n`)
}

function replaceSource(source: string, dest: string): void {
  for (const name of readdirSync(dest)) {
    if (kept.has(name)) continue
    if (!existsSync(path.join(source, name))) rmSync(path.join(dest, name), { recursive: true, force: true })
  }
  cpSync(source, dest, {
    recursive: true,
    filter: item => !kept.has(path.basename(item)),
  })
}

function assertSchema(dest: string, source: string): void {
  const dbPath = storageDatabase(dest)
  if (!existsSync(dbPath)) return
  const db = new Database(dbPath, { readonly: true })
  try {
    const applied = db.prepare('SELECT id, checksum FROM schema_migrations').all() as { id: number; checksum: string }[]
    const schemaDir = path.join(source, 'schema')
    const names = existsSync(schemaDir) ? readdirSync(schemaDir) : []
    for (const row of applied) {
      const name = names.find(file => file.startsWith(`${row.id}_`))
      if (name === undefined) throw new MarketError('market-schema', `applied schema file is missing: ${row.id}`)
      const checksum = createHash('sha256').update(readFileSync(path.join(source, 'schema', name))).digest('hex')
      if (checksum !== row.checksum) throw new MarketError('market-schema', `applied schema file changed: ${name}`)
    }
  } finally {
    db.close()
  }
}

/** Light primary, light background, dark primary, dark background. Missing tokens are dropped. */
export function themeColors(css: string): string[] {
  const light = modeBlock(css, 'light')
  const dark = modeBlock(css, 'dark')
  return [token(light, 'primary'), token(light, 'background'), token(dark, 'primary'), token(dark, 'background')]
    .filter((item): item is string => item !== undefined)
}

function modeBlock(css: string, mode: string): string {
  const match = new RegExp(`data-mode="${mode}"[^{]*\\{([^}]*)\\}`).exec(css)
  return match?.[1] ?? ''
}

function token(block: string, name: string): string | undefined {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+)`).exec(block)
  return match?.[1]?.trim()
}

async function reinstallWhenLockChanged(dest: string, previousLock: string | undefined, run: NpmRun | undefined): Promise<void> {
  if (!existsSync(path.join(dest, 'package.json'))) return
  const nextLock = readOptional(path.join(dest, 'package-lock.json'))
  if (nextLock === previousLock) return
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, 120_000)
  try {
    const result = await (run ?? runNpm)(dest, controller.signal)
    if (result.exitCode !== 0) {
      throw new MarketError('market-install', result.stderr || 'npm install failed')
    }
  } catch (error) {
    if (error instanceof MarketError) throw error
    const message = controller.signal.aborted
      ? 'npm install timed out'
      : error instanceof Error ? error.message : 'npm install failed'
    throw new MarketError('market-install', message, { cause: error })
  } finally {
    clearTimeout(timer)
  }
}

function readOptional(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

function restoreOptional(file: string, content: string | undefined): void {
  if (content === undefined) {
    rmSync(file, { force: true })
    return
  }
  writeFileSync(file, content)
}

function themeFiles(packageRoot: string): { name: string; css: string }[] {
  const dirs = [path.join(packageRoot, 'themes'), packageRoot]
  const found = new Map<string, string>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter(file => /^theme-[a-z0-9-]+\.css$/.test(file)).sort()) {
      if (found.has(name)) continue
      found.set(name, readFileSync(path.join(dir, name), 'utf8'))
    }
  }
  return [...found.entries()].map(([name, css]) => ({ name, css }))
}

function modeTokens(css: string, mode: string): ThemeModePreview | undefined {
  const block = modeBlock(css, mode)
  if (block.length === 0) return undefined
  const pick = (name: keyof ThemeModePreview) => {
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
