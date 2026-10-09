/** Command or Ctrl, plus Shift, plus P. Alt is not this chord. */
export function isPaletteChord(event: {
  readonly key: string
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly ctrlKey: boolean
}): boolean {
  if (event.altKey || !event.shiftKey) return false
  if (event.key !== 'p' && event.key !== 'P') return false
  return event.metaKey || event.ctrlKey
}

/** The glyph the placeholder shows. Either chord still opens the palette. */
export function chordLabel(mac: boolean): string {
  return mac ? '⌘⇧P' : 'Ctrl+Shift+P'
}

export function isMacPlatform(platform: string, userAgent: string): boolean {
  return /Mac|iPhone|iPad/.test(platform) || userAgent.includes('Mac')
}

const chordType = 'mma-chord'

/**
 * Capture the chord on the panel document.
 * An app iframe forwards the same chord with `mma-chord`, because a parent listener on that window does not see the key.
 * @param doc - the panel document
 * @param onChord - already matched
 */
export function bindPaletteChord(doc: Document, onChord: () => void): () => void {
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || !isPaletteChord(event)) return
    event.preventDefault()
    event.stopPropagation()
    onChord()
  }
  const onMessage = (event: Event) => {
    if (!(event instanceof MessageEvent) || event.origin !== doc.location.origin) return
    if (!isForwardedChord(event.data)) return
    const frames = doc.querySelectorAll('iframe')
    for (const frame of frames) {
      if (frame.contentWindow === event.source) {
        onChord()
        return
      }
    }
  }
  doc.addEventListener('keydown', onKey, true)
  doc.defaultView?.addEventListener('message', onMessage)
  return () => {
    doc.removeEventListener('keydown', onKey, true)
    doc.defaultView?.removeEventListener('message', onMessage)
  }
}

function isForwardedChord(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  if (row.type !== chordType) return false
  return isPaletteChord({
    key: typeof row.key === 'string' ? row.key : '',
    shiftKey: row.shiftKey === true,
    altKey: row.altKey === true,
    metaKey: row.metaKey === true,
    ctrlKey: row.ctrlKey === true,
  })
}
