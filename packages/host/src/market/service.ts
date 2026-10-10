import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

import { homeThemesDir } from '../host/layout.ts'
import { aboutInfo } from '../http/ports.ts'
import type { Catalog, CatalogRow } from './catalog.ts'
import { versionCompared } from './catalog.ts'
import { extractTarball, fetchCatalog, fetchPackage, marketDir, readLocalCatalog } from './fetch.ts'
import { MarketError } from './error.ts'
import {
  installAppTree,
  installThemeFile,
  readLock,
  readThemeCss,
  themeLockPath,
  themePreview,
  themesPackageSum,
  type ThemePreview,
} from './install.ts'
import { sourceSum } from './sum.ts'
import { toneOf, type ThemeTone } from './tone.ts'

export interface MarketListRow extends CatalogRow {
  readonly tone?: ThemeTone
  readonly installedVersion?: string
  /** Manifest version when the app dir exists without a market lock. */
  readonly localVersion?: string
  readonly modified?: boolean
  readonly tracked?: boolean
  readonly installable?: boolean
  readonly preview?: ThemePreview
}

/**
 * Catalog plus local lock state. A missing registry is an empty error for the panel.
 * @param input - registry and runtime root
 */
export async function listMarket(input: {
  readonly registry: string
  readonly runtimeRoot: string
  readonly localDist: boolean
  readonly env?: NodeJS.ProcessEnv
  readonly home?: string
}): Promise<MarketListRow[]> {
  const local = input.localDist ? readLocalCatalog(marketDir(input.env)) : undefined
  const catalog = local ?? await fetchCatalog(input.registry)
  const rows = catalog.apps.filter(row => input.localDist || row.source !== 'local')
  const product = aboutInfo().current
  const themesDir = homeThemesDir(input.home ?? homedir())
  const previews = await themePreviews(rows, input)
  return rows.map(row => withLocal(row, input.runtimeRoot, themesDir, product, previews.get(row.id)))
}

/**
 * Install one catalog row. Confirm is required when local source would be replaced.
 * @param input - the row id and whether the panel confirmed
 */
export async function installMarket(input: {
  readonly registry: string
  readonly runtimeRoot: string
  readonly id: string
  readonly confirm: boolean
  readonly localDist: boolean
  readonly env?: NodeJS.ProcessEnv
  readonly home?: string
}): Promise<{ id: string; kind: 'app' | 'theme' }> {
  const dir = marketDir(input.env)
  const local = input.localDist ? readLocalCatalog(dir) : undefined
  const catalog: Catalog = local ?? await fetchCatalog(input.registry)
  const row = catalog.apps.find(item => item.id === input.id)
  if (row === undefined) throw new MarketError('market-catalog', 'catalog row is missing')
  assertLocalSource(row.source, input.localDist)
  if (row.kind === 'theme') {
    const { css, packageSum, expectedSum } = await loadThemePackage(row, input.registry, dir)
    installThemeFile({
      themesDir: homeThemesDir(input.home ?? homedir()),
      fileName: `theme-${row.id}.css`,
      css,
      row,
      packageSum,
      expectedSum,
      confirm: input.confirm,
    })
    return { id: row.id, kind: 'theme' }
  }
  const packageRoot = row.source === 'local'
    ? extractTarball(path.join(dir, row.file ?? ''))
    : await fetchPackage(input.registry, row.package)
  const meta = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { mohou?: { sum?: string } }
  const expectedSum = meta.mohou?.sum
  if (expectedSum === undefined) throw new MarketError('market-sum', 'package sum is missing')
  await installAppTree({
    runtimeRoot: input.runtimeRoot,
    packageRoot,
    row,
    expectedSum,
    confirm: input.confirm,
  })
  return { id: row.id, kind: 'app' }
}

/** A registry install cannot install a tarball row. */
export function assertLocalSource(source: CatalogRow['source'], localDist: boolean): void {
  if (source === 'local' && !localDist) throw new MarketError('market-catalog', 'local source is only available in a local dist')
}

function withLocal(
  row: CatalogRow,
  runtimeRoot: string,
  themesDir: string,
  product: string,
  preview: ThemePreview | undefined,
): MarketListRow {
  const installable = row.requires === undefined || versionCompared(product, row.requires) !== 'less'
  const base = {
    ...row,
    ...installable ? {} : { installable: false as const },
    ...preview === undefined ? {} : { preview },
  }
  if (row.kind === 'theme') {
    const tone = row.colors?.[0] === undefined ? undefined : toneOf(row.colors[0])
    const dest = path.join(themesDir, `theme-${row.id}.css`)
    const lockPath = themeLockPath(themesDir, row.id)
    if (!existsSync(dest)) return { ...base, ...tone === undefined ? {} : { tone } }
    const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) as { version?: string; sum?: string } : undefined
    if (lock === undefined) {
      return { ...base, tracked: false, ...tone === undefined ? {} : { tone } }
    }
    const sum = createHash('sha256').update(readFileSync(dest)).digest('hex')
    return {
      ...base,
      ...typeof lock.version === 'string' ? { installedVersion: lock.version } : {},
      tracked: true,
      modified: sum !== lock.sum,
      ...tone === undefined ? {} : { tone },
    }
  }
  const dir = path.join(runtimeRoot, 'apps', row.id)
  if (!existsSync(dir)) return base
  const lock = readLock(dir)
  if (lock === undefined) {
    const localVersion = readManifestVersion(dir)
    return {
      ...base,
      tracked: false,
      ...localVersion === undefined ? {} : { localVersion },
    }
  }
  const modified = sourceSum(path.join(runtimeRoot, 'apps', row.id)) !== lock.sum
  return { ...base, installedVersion: lock.version, tracked: true, modified }
}

function readManifestVersion(appDir: string): string | undefined {
  const file = path.join(appDir, 'manifest.json')
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }
    return typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : undefined
  } catch {
    return undefined
  }
}

async function themePreviews(
  rows: readonly CatalogRow[],
  input: { readonly registry: string; readonly localDist: boolean; readonly env?: NodeJS.ProcessEnv },
): Promise<Map<string, ThemePreview>> {
  const out = new Map<string, ThemePreview>()
  const dir = marketDir(input.env)
  const roots = new Map<string, string>()
  for (const row of rows) {
    if (row.kind !== 'theme') continue
    try {
      let packageRoot = roots.get(row.package)
      let css: string
      if (packageRoot === undefined) {
        const loaded = await loadThemePackage(row, input.registry, dir)
        packageRoot = loaded.packageRoot
        roots.set(row.package, packageRoot)
        css = loaded.css
      } else {
        css = readThemeCss(packageRoot, `theme-${row.id}.css`)
      }
      const preview = themePreview(css)
      if (preview !== undefined) out.set(row.id, preview)
    } catch {
      // Catalog list still works when a theme file is missing.
    }
  }
  return out
}

async function loadThemePackage(row: CatalogRow, registry: string, dir: string): Promise<{
  css: string
  packageRoot: string
  packageSum: string
  expectedSum: string
}> {
  if (row.source === 'local') {
    // A lone css file is a local-dist convenience. A tarball is the published shape.
    if (row.file !== undefined && row.file.endsWith('.css')) {
      const css = readFileSync(path.join(dir, row.file), 'utf8')
      const packageSum = createHash('sha256').update(`theme-${row.id}.css`).update(css).digest('hex')
      return { css, packageRoot: dir, packageSum, expectedSum: packageSum }
    }
    const tarName = row.file?.endsWith('.tgz') ? row.file : 'themes.tgz'
    const packageRoot = extractTarball(path.join(dir, tarName))
    const expectedSum = readPackageSum(packageRoot)
    return {
      css: readThemeCss(packageRoot, `theme-${row.id}.css`),
      packageRoot,
      packageSum: themesPackageSum(packageRoot),
      expectedSum,
    }
  }
  const packageRoot = await fetchPackage(registry, row.package)
  const expectedSum = readPackageSum(packageRoot)
  return {
    css: readThemeCss(packageRoot, `theme-${row.id}.css`),
    packageRoot,
    packageSum: themesPackageSum(packageRoot),
    expectedSum,
  }
}

function readPackageSum(packageRoot: string): string {
  const meta = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { mohou?: { sum?: string } }
  const sum = meta.mohou?.sum
  if (sum === undefined) throw new MarketError('market-sum', 'package sum is missing')
  return sum
}
