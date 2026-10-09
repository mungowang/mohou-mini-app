import fuzzysort from 'fuzzysort'

import type { GalleryApp } from '../gallery/list.ts'

export type PaletteWhy = 'name' | 'acronym' | 'id' | 'description' | 'tag' | 'pinyin' | 'initials' | 'version'

export interface PaletteHit {
  readonly app: GalleryApp
  readonly why: PaletteWhy
}

export type PaletteEntry =
  | { readonly kind: 'app'; readonly hit: PaletteHit }
  | { readonly kind: 'library' }

interface Candidate {
  readonly kind: 'app' | 'library'
  readonly app?: GalleryApp
  readonly name: string
  readonly open: boolean
  readonly tier: number
  readonly quality: number
  readonly why: PaletteWhy
}

const exact = 4
const prefix = 3
const contains = 2
const fuzzy = 1

/**
 * Rank the palette. A name hit, including that name's pinyin, beats every other field.
 * The library row uses its titles only. Its hint does not match.
 * An empty query lists the library row, then open apps, then the rest.
 * @param apps - the current list
 * @param query - the palette field
 * @param openIds - apps that already have a tab
 * @param libraryTitles - the library row's names, not its hint
 */
export function rankPalette(
  apps: readonly GalleryApp[],
  query: string,
  openIds: ReadonlySet<string>,
  libraryTitles: readonly string[],
): PaletteEntry[] {
  const needle = query.trim()
  if (needle.length === 0) {
    const open = apps.filter(app => openIds.has(app.id))
    const rest = apps.filter(app => !openIds.has(app.id))
    return [
      { kind: 'library' },
      ...[...open, ...rest].map(app => ({ kind: 'app' as const, hit: { app, why: 'name' as const } })),
    ]
  }
  const found = [
    ...apps.flatMap((app) => {
      const candidate = rankApp(app, needle, openIds.has(app.id))
      return candidate === undefined ? [] : [candidate]
    }),
    ...rankLibrary(libraryTitles, needle),
  ]
  found.sort((left, right) =>
    left.tier - right.tier
    || right.quality - left.quality
    || Number(right.open) - Number(left.open)
    || left.name.localeCompare(right.name, 'zh'))
  return found.map(candidate => candidate.kind === 'library' || candidate.app === undefined
    ? { kind: 'library' }
    : { kind: 'app', hit: { app: candidate.app, why: candidate.why } })
}

/** @deprecated Ranking goes through {@link rankPalette}. Kept for app-only checks. */
export function rankApps(apps: readonly GalleryApp[], query: string, openIds: ReadonlySet<string>): PaletteHit[] {
  return rankPalette(apps, query, openIds, []).flatMap(entry => entry.kind === 'app' ? [entry.hit] : [])
}

function rankApp(app: GalleryApp, needle: string, open: boolean): Candidate | undefined {
  const versionQuery = /\d+\.\d+/.test(needle)
  const tiers: Array<{ tier: number; why: PaletteWhy; texts: readonly string[] }> = [
    { tier: 1, why: 'name', texts: [app.name] },
    { tier: 1, why: 'pinyin', texts: [app.spelling?.name?.full ?? ''] },
    { tier: 1, why: 'initials', texts: [app.spelling?.name?.initials ?? ''] },
    { tier: 2, why: 'acronym', texts: [app.acronym] },
    { tier: 3, why: 'id', texts: [app.id.split('.').at(-1) ?? app.id] },
    { tier: 4, why: 'id', texts: [app.id] },
    { tier: 5, why: 'tag', texts: [app.tags?.join(' ') ?? ''] },
    { tier: 5, why: 'pinyin', texts: [app.spelling?.tags?.full ?? ''] },
    { tier: 5, why: 'initials', texts: [app.spelling?.tags?.initials ?? ''] },
    { tier: 6, why: 'description', texts: [app.description] },
    { tier: 6, why: 'pinyin', texts: [app.spelling?.description?.full ?? ''] },
    { tier: 6, why: 'initials', texts: [app.spelling?.description?.initials ?? ''] },
    ...versionQuery ? [{ tier: 7, why: 'version' as const, texts: [app.version] }] : [],
  ]
  return best(tiers, needle, { kind: 'app', app, name: app.name, open })
}

function rankLibrary(titles: readonly string[], needle: string): Candidate[] {
  const candidate = best(
    [{ tier: 1, why: 'name', texts: titles }],
    needle,
    { kind: 'library', name: titles[0] ?? '', open: false },
  )
  return candidate === undefined ? [] : [candidate]
}

function best(
  tiers: readonly { tier: number; why: PaletteWhy; texts: readonly string[] }[],
  needle: string,
  identity: Pick<Candidate, 'kind' | 'app' | 'name' | 'open'>,
): Candidate | undefined {
  let chosen: Candidate | undefined
  for (const tier of tiers) {
    const quality = bestQuality(tier.texts, needle)
    if (quality === 0) continue
    const candidate: Candidate = { ...identity, tier: tier.tier, quality, why: tier.why }
    if (chosen === undefined || candidate.tier < chosen.tier || (candidate.tier === chosen.tier && candidate.quality > chosen.quality)) {
      chosen = candidate
    }
  }
  return chosen
}

function bestQuality(texts: readonly string[], needle: string): number {
  let quality = 0
  for (const text of texts) {
    const next = matchQuality(text, needle)
    if (next > quality) quality = next
  }
  return quality
}

function matchQuality(text: string, needle: string): number {
  const hay = text.trim().toLowerCase()
  const query = needle.trim().toLowerCase()
  if (hay.length === 0 || query.length === 0) return 0
  if (hay === query) return exact
  if (hay.startsWith(query)) return prefix
  if (hay.includes(query)) return contains
  const found = fuzzysort.single(query, text)
  return found !== null && found.score > 0 ? fuzzy : 0
}
