import { spellFields } from '../apps/spelling.ts'
import type { MarketListRow } from './service.ts'

const exact = 4
const prefix = 3
const contains = 2
const fuzzy = 1

/**
 * Rank catalog rows for an agent query. Name, including pinyin, beats later fields.
 * A substitution typo does not match. Version matches only when the query looks like `1.0`.
 * @param rows - the catalog list
 * @param query - omitted or blank returns the list unchanged
 */
export function searchMarket(rows: readonly MarketListRow[], query: string | undefined): MarketListRow[] {
  const needle = query?.trim() ?? ''
  if (needle.length === 0) return [...rows]
  const ranked = rows.flatMap((row) => {
    const score = rankRow(row, needle)
    return score === undefined ? [] : [{ row, ...score }]
  })
  ranked.sort((left, right) => left.tier - right.tier || right.quality - left.quality || left.row.name.localeCompare(right.row.name, 'zh'))
  return ranked.map(item => item.row)
}

function rankRow(row: MarketListRow, needle: string): { tier: number; quality: number } | undefined {
  const spelling = spellFields({
    name: row.name,
    description: row.description,
    ...row.tags === undefined ? {} : { tags: row.tags },
  })
  const versionQuery = /\d+\.\d+/.test(needle)
  const tiers = [
    { tier: 1, texts: [row.name, row.nameZh ?? '', spelling?.name?.full ?? '', spelling?.name?.initials ?? ''] },
    { tier: 2, texts: [row.id.split('.').at(-1) ?? row.id] },
    { tier: 3, texts: [row.id] },
    { tier: 4, texts: [row.tags?.join(' ') ?? '', spelling?.tags?.full ?? '', spelling?.tags?.initials ?? ''] },
    { tier: 5, texts: [row.description, row.descriptionZh ?? '', spelling?.description?.full ?? '', spelling?.description?.initials ?? ''] },
    ...versionQuery ? [{ tier: 6, texts: [row.version] }] : [],
  ]
  let chosen: { tier: number; quality: number } | undefined
  for (const tier of tiers) {
    const quality = bestQuality(tier.texts, needle)
    if (quality === 0) continue
    if (chosen === undefined || tier.tier < chosen.tier || (tier.tier === chosen.tier && quality > chosen.quality)) {
      chosen = { tier: tier.tier, quality }
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
  return subsequence(hay, query) ? fuzzy : 0
}

function subsequence(hay: string, needle: string): boolean {
  let index = 0
  for (const char of hay) {
    if (char === needle[index]) index += 1
    if (index === needle.length) return true
  }
  return false
}
