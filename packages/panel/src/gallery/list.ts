/** Card styles. Panel-local. Not a host field. */
export const galleryCardStyles = ['glass', 'stamp', 'etch', 'hero', 'pulse', 'list'] as const

export type GalleryCardStyle = (typeof galleryCardStyles)[number]

export interface GalleryApp {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly acronym: string
  /** Host-derived pinyin, split by field. Absent when the row has no Chinese. */
  readonly spelling?: {
    readonly name?: { readonly full: string; readonly initials: string }
    readonly description?: { readonly full: string; readonly initials: string }
    readonly tags?: { readonly full: string; readonly initials: string }
  }
  readonly tags?: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly activity?: { readonly openCount: number; readonly lastOpenedAt: string }
  readonly kind?: 'workbench'
}

export type GalleryKind = 'unreachable' | 'failed' | 'empty' | 'none' | 'ready'

/**
 * Search the visible card fields. An empty query returns the list unchanged.
 * @param apps - host list
 * @param query - panel-local search
 */
export function filterGallery(apps: readonly GalleryApp[], query: string): GalleryApp[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return [...apps]
  return apps.filter(app =>
    app.name.toLowerCase().includes(needle)
    || app.description.toLowerCase().includes(needle)
    || app.acronym.toLowerCase().includes(needle)
    || app.version.toLowerCase().includes(needle))
}

/**
 * Host unreachable is not an empty gallery. An empty ready list is the empty state.
 * @param input - the list call outcome
 */
export function galleryKind(input: {
  readonly reachable: boolean
  readonly failed?: string
  readonly apps: readonly GalleryApp[]
  readonly query?: string
}): GalleryKind {
  if (!input.reachable) return 'unreachable'
  if (input.failed !== undefined) return 'failed'
  if (input.apps.length === 0) return input.query !== undefined && input.query.trim().length > 0 ? 'none' : 'empty'
  return 'ready'
}

export function isGalleryCardStyle(value: string): value is GalleryCardStyle {
  return (galleryCardStyles as readonly string[]).includes(value)
}
