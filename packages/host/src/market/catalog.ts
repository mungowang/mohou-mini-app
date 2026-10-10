import { MarketError } from './error.ts'

export const marketKinds = ['app', 'theme'] as const
export type MarketKind = (typeof marketKinds)[number]

export const marketSources = ['npm', 'local'] as const
export type MarketSource = (typeof marketSources)[number]

/** One catalog row. Optional facts are omitted, not filled with a default. */
export interface CatalogRow {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly package: string
  readonly version: string
  readonly kind: MarketKind
  readonly appKind?: 'workbench'
  readonly tags?: readonly string[]
  readonly requires?: string
  readonly author?: string
  readonly downloads?: number
  readonly official?: boolean
  readonly source: MarketSource
  readonly file?: string
  readonly colors?: readonly string[]
}

export interface Catalog {
  readonly version: string
  readonly apps: readonly CatalogRow[]
}

const SEMVER = /^\d+\.\d+\.\d+$/

/** Greater catalog version is an update. Equal is not. A non-semver pair does not compare. */
export function versionCompared(catalog: string, installed: string): 'greater' | 'equal' | 'less' | 'invalid' {
  if (!SEMVER.test(catalog) || !SEMVER.test(installed)) return 'invalid'
  const left = catalog.split('.').map(Number)
  const right = installed.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a > b) return 'greater'
    if (a < b) return 'less'
  }
  return 'equal'
}

/**
 * Admit a catalog packument. Throws {@link MarketError} `market-catalog`.
 * @param raw - `GET /@mohou-apps/catalog/latest`
 */
export function resolveCatalog(raw: unknown): Catalog {
  if (typeof raw !== 'object' || raw === null) throw new MarketError('market-catalog', 'catalog is not an object')
  const body = raw as Record<string, unknown>
  const version = typeof body.version === 'string' ? body.version : ''
  const mohou = body.mohou
  if (typeof mohou !== 'object' || mohou === null) throw new MarketError('market-catalog', 'catalog mohou is missing')
  const apps = (mohou as Record<string, unknown>).apps
  if (!Array.isArray(apps)) throw new MarketError('market-catalog', 'catalog apps is missing')
  return { version, apps: apps.map(resolveRow) }
}

function resolveRow(raw: unknown): CatalogRow {
  if (typeof raw !== 'object' || raw === null) throw new MarketError('market-catalog', 'catalog row is not an object')
  const row = raw as Record<string, unknown>
  const id = text(row.id, 'id')
  const name = text(row.name, 'name')
  const description = text(row.description, 'description')
  const packageName = text(row.package, 'package')
  const version = text(row.version, 'version')
  const kind = row.kind === undefined ? 'app' : row.kind
  if (kind !== 'app' && kind !== 'theme') throw new MarketError('market-catalog', 'catalog kind is invalid')
  const source = row.source === undefined ? 'npm' : row.source
  if (source !== 'npm' && source !== 'local') throw new MarketError('market-catalog', 'catalog source is invalid')
  if (source === 'local' && typeof row.file !== 'string') throw new MarketError('market-catalog', 'local catalog row has no file')
  return {
    id,
    name,
    description,
    package: packageName,
    version,
    kind,
    source,
    ...row.appKind === 'workbench' ? { appKind: 'workbench' as const } : {},
    ...stringList(row.tags),
    ...typeof row.requires === 'string' ? { requires: row.requires } : {},
    ...typeof row.author === 'string' ? { author: row.author } : {},
    ...typeof row.downloads === 'number' ? { downloads: row.downloads } : {},
    ...row.official === true ? { official: true } : {},
    ...typeof row.file === 'string' ? { file: row.file } : {},
    ...colorList(row.colors),
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new MarketError('market-catalog', `catalog ${field} is missing`)
  return value
}

function stringList(value: unknown): { tags: string[] } | Record<string, never> {
  if (value === undefined) return {}
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new MarketError('market-catalog', 'catalog tags are invalid')
  }
  return { tags: value as string[] }
}

function colorList(value: unknown): { colors: string[] } | Record<string, never> {
  if (value === undefined) return {}
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new MarketError('market-catalog', 'catalog colors are invalid')
  }
  return { colors: value as string[] }
}
