/** @returns {'palette' | 'tab-prev' | 'tab-next' | null} */
export function matchWireChord(event: {
  readonly key?: string
  readonly code?: string
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly metaKey?: boolean
  readonly ctrlKey?: boolean
  readonly repeat?: boolean
}): 'palette' | 'tab-prev' | 'tab-next' | null

export function wireChordPayload(
  event: {
    readonly key?: string
    readonly code?: string
    readonly metaKey?: boolean
    readonly ctrlKey?: boolean
  },
  kind: 'palette' | 'tab-prev' | 'tab-next',
): {
  readonly type: 'mma-chord'
  readonly key: string
  readonly code: string
  readonly shiftKey: true
  readonly altKey: false
  readonly metaKey: boolean
  readonly ctrlKey: boolean
}
