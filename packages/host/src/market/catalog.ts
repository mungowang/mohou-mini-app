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
  /** A `themePacks` entry this theme belongs to. Absent means ungrouped. */
  readonly themePackId?: string
}

/**
 * A market bundle: presentation only.
 * It is not an install unit, it has no version, and it never reaches the theme layout.
 */
export interface ThemePack {
  readonly id: string
  readonly name: string
  readonly nameZh?: string
  readonly description?: string
  readonly descriptionZh?: string
  readonly author?: string
  readonly official?: true
}

export interface Catalog {
  readonly version: string
  readonly apps: readonly CatalogRow[]
  readonly themePacks: readonly ThemePack[]
}

const SEMVER = /^\d+\.\d+\.\d+$/
const PACK_ID = /^[a-z0-9-]+$/

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
  const block = mohou as Record<string, unknown>
  if (!Array.isArray(block.apps)) throw new MarketError('market-catalog', 'catalog apps is missing')
  const apps = block.apps.map(resolveRow)
  const themePacks = resolveThemePacks(block.themePacks)
  assertUniqueIds(apps.map(row => row.id), 'row')
  assertPackRefs(apps, themePacks)
  return { version, apps, themePacks }
}

/**
 * A theme pack is a bundle of theme rows.
 * Only a `theme` row may point at one, and the entry must exist.
 * @param value - `mohou.themePacks`
 */
function resolveThemePacks(value: unknown): ThemePack[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new MarketError('market-catalog', 'catalog themePacks is invalid')
  const packs = value.map(resolveThemePack)
  assertUniqueIds(packs.map(pack => pack.id), 'theme pack')
  return packs
}

function resolveThemePack(raw: unknown): ThemePack {
  if (typeof raw !== 'object' || raw === null) throw new MarketError('market-catalog', 'catalog theme pack is not an object')
  const pack = raw as Record<string, unknown>
  const id = text(pack.id, 'theme pack id')
  if (!PACK_ID.test(id)) throw new MarketError('market-catalog', `catalog theme pack id is invalid: ${id}`)
  const name = text(pack.name, 'theme pack name')
  const nameZh = optionalText(pack.nameZh, 'theme pack nameZh')
  const description = optionalText(pack.description, 'theme pack description')
  const descriptionZh = optionalText(pack.descriptionZh, 'theme pack descriptionZh')
  const author = optionalText(pack.author, 'theme pack author')
  return {
    id,
    name,
    ...nameZh === undefined ? {} : { nameZh },
    ...description === undefined ? {} : { description },
    ...descriptionZh === undefined ? {} : { descriptionZh },
    ...author === undefined ? {} : { author },
    ...pack.official === true ? { official: true as const } : {},
  }
}

function assertUniqueIds(ids: readonly string[], what: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      continue
    }
    // Flat install paths give one id one file and one lock. A duplicate cannot hold two provenances.
    throw new MarketError('market-catalog', `catalog ${what} id is duplicated: ${id}`)
  }
}

function assertPackRefs(rows: readonly CatalogRow[], packs: readonly ThemePack[]): void {
  const known = new Set(packs.map(pack => pack.id))
  for (const row of rows) {
    if (row.themePackId === undefined) continue
    if (known.has(row.themePackId)) continue
    throw new MarketError('market-catalog', `catalog row ${row.id} names an unknown theme pack: ${row.themePackId}`)
  }
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
  const themePackId = optionalText(row.themePackId, 'themePackId')
  if (themePackId !== undefined) {
    if (kind !== 'theme') throw new MarketError('market-catalog', `catalog themePackId is only valid on a theme row: ${id}`)
    if (!PACK_ID.test(themePackId)) throw new MarketError('market-catalog', `catalog themePackId is invalid: ${themePackId}`)
  }
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
    ...themePackId === undefined ? {} : { themePackId },
  }
}

/** A present-but-empty optional string is a catalog error; an absent one is not a field. */
function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) throw new MarketError('market-catalog', `catalog ${field} is invalid`)
  return value
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
