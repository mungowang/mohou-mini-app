import { createRequire } from 'node:module'

import type { polyphonic as Polyphonic } from 'pinyin-pro'

const require = createRequire(import.meta.url)

/** Pinyin for one list field. A Latin-only field is omitted. */
export interface FieldSpelling {
  readonly full: string
  readonly initials: string
}

/** Name spelling ranks with the name. Description spelling ranks with the description. */
export interface AppSpelling {
  readonly name?: FieldSpelling
  readonly description?: FieldSpelling
  readonly tags?: FieldSpelling
}

const readingCap = 16

/**
 * Full pinyin without tones, and initials, split by field.
 * Polyphonic characters keep every reading, up to {@link readingCap} combinations.
 * A field with no Chinese is omitted. A row with no Chinese returns undefined.
 * @param input - name, description, and tags
 */
export function spellFields(input: {
  readonly name: string
  readonly description: string
  readonly tags?: readonly string[]
}): AppSpelling | undefined {
  const name = spellOne(input.name)
  const description = spellOne(input.description)
  const tags = spellOne((input.tags ?? []).join(''))
  if (name === undefined && description === undefined && tags === undefined) return undefined
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...tags === undefined ? {} : { tags },
  }
}

function spellOne(text: string): FieldSpelling | undefined {
  const spelled = spellHan(text)
  if (spelled === undefined) return undefined
  return {
    full: spelled.full.join(' '),
    initials: spelled.initials.join(' '),
  }
}

function spellHan(text: string): { full: string[]; initials: string[] } | undefined {
  const han = text.match(/\p{Script=Han}/gu)?.join('') ?? ''
  if (han.length === 0) return undefined
  const groups = readings(han)
  if (groups.length === 0) return undefined
  const combos = expand(groups, readingCap)
  return {
    full: unique(combos.map(parts => parts.join(''))),
    initials: unique(combos.map(parts => parts.map(part => part[0] ?? '').join(''))),
  }
}

function readings(text: string): string[][] {
  const value: unknown = polyphonic(text)
  if (!Array.isArray(value)) return []
  const groups: string[][] = []
  for (const row of value) {
    if (!Array.isArray(row)) continue
    const choices = unique(row.filter((item): item is string => typeof item === 'string' && item.length > 0))
    if (choices.length > 0) groups.push(choices)
  }
  return groups
}

/** First reading of each character always survives. Extra readings stop at the cap. */
function expand(groups: readonly string[][], cap: number): string[][] {
  let acc: string[][] = [[]]
  for (let index = 0; index < groups.length; index += 1) {
    const choices = groups[index] ?? []
    if (acc.length * choices.length > cap) {
      const tail = groups.slice(index).map(group => group[0] ?? '')
      return acc.map(prefix => [...prefix, ...tail])
    }
    const next: string[][] = []
    for (const prefix of acc) {
      for (const choice of choices) next.push([...prefix, choice])
    }
    acc = next
  }
  return acc
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => value.length > 0))]
}

/** Loaded on the first list, not when Host starts. */
function polyphonic(text: string): unknown {
  const loaded = require('pinyin-pro') as { polyphonic: typeof Polyphonic }
  return loaded.polyphonic(text, { toneType: 'none', type: 'array' })
}
