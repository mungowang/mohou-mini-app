import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { homeDir } from '../host/layout.ts'
import { MarketError } from './error.ts'
import { resolveCatalog, type Catalog } from './catalog.ts'

/** Local catalog and tarballs. `MINI_APP_MARKET_DIR` overrides `~/.mini-app/market`. */
export function marketDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const override = env.MINI_APP_MARKET_DIR?.trim()
  return override !== undefined && override.length > 0 ? override : path.join(homeDir(home), 'market')
}

/** A present `market-catalog.json` is the list. A missing file means use the registry. */
export function readLocalCatalog(dir: string): Catalog | undefined {
  const file = path.join(dir, 'market-catalog.json')
  if (!existsSync(file)) return undefined
  return resolveCatalog(JSON.parse(readFileSync(file, 'utf8')))
}

/** Extract a local tarball. The result is the `package/` directory. */
export function extractTarball(file: string): string {
  if (!existsSync(file)) throw new MarketError('market-package', 'local tarball is missing')
  const dir = mkdtempSync(path.join(tmpdir(), 'mohou-market-'))
  const tar = spawnSync('tar', ['-xzf', file, '-C', dir], { encoding: 'utf8' })
  if (tar.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new MarketError('market-package', 'tarball extract failed')
  }
  return path.join(dir, 'package')
}

/**
 * Read `@mohou-apps/catalog` latest from the update registry.
 * @param registry - registry origin, no trailing slash required
 */
export async function fetchCatalog(registry: string): Promise<Catalog> {
  const url = `${registry.replace(/\/$/, '')}/@mohou-apps%2fcatalog/latest`
  const response = await fetch(url)
  if (!response.ok) throw new MarketError('market-catalog', `catalog fetch failed: ${response.status}`)
  return resolveCatalog(await response.json())
}

/**
 * Download one packument and its tarball, then extract it.
 * @param registry - the same registry the catalog used
 * @param name - package name
 */
export async function fetchPackage(registry: string, name: string): Promise<string> {
  const root = registry.replace(/\/$/, '')
  const packument = await fetch(`${root}/${name.replace('/', '%2f')}/latest`)
  if (!packument.ok) throw new MarketError('market-package', `package fetch failed: ${packument.status}`)
  const body = await packument.json() as { dist?: { tarball?: string } }
  const tarball = body.dist?.tarball
  if (tarball === undefined) throw new MarketError('market-package', 'package tarball is missing')
  const bytes = await fetch(tarball)
  if (!bytes.ok) throw new MarketError('market-package', `tarball fetch failed: ${bytes.status}`)
  const dir = mkdtempSync(path.join(tmpdir(), 'mohou-market-'))
  const file = path.join(dir, 'pack.tgz')
  writeFileSync(file, Buffer.from(await bytes.arrayBuffer()))
  const tar = spawnSync('tar', ['-xzf', file, '-C', dir], { encoding: 'utf8' })
  if (tar.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new MarketError('market-package', 'tarball extract failed')
  }
  return path.join(dir, 'package')
}
