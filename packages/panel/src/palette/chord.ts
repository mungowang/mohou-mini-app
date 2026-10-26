import { matchWireChord } from './chord-wire.js'

/** One panel chrome chord the document or an app iframe may raise. */
export type PanelChord =
  | { readonly kind: 'palette' }
  | { readonly kind: 'tab-switch'; readonly direction: 'prev' | 'next' }

type ChordEvent = {
  readonly key: string
  readonly code?: string
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly repeat?: boolean
}

/** Command or Ctrl, plus Shift, plus P. Alt is not this chord. */
export function isPaletteChord(event: ChordEvent): boolean {
  return matchPanelChord(event)?.kind === 'palette'
}

/**
 * Mod+Shift+ArrowLeft / ArrowRight. Same modifiers as the palette chord: Command or Ctrl.
 * Alt is not this chord. Plain arrows are not this chord — the open palette handles those itself.
 */
export function isTabSwitchChord(event: ChordEvent): boolean {
  return matchPanelChord(event)?.kind === 'tab-switch'
}

/**
 * Classify a key event as a panel chrome chord, or nothing.
 * Same rules as `chord-wire.js` (iframe forwarders embed that file).
 */
export function matchPanelChord(event: ChordEvent): PanelChord | undefined {
  const kind = matchWireChord(event)
  if (kind === 'palette') return { kind: 'palette' }
  if (kind === 'tab-prev') return { kind: 'tab-switch', direction: 'prev' }
  if (kind === 'tab-next') return { kind: 'tab-switch', direction: 'next' }
  return undefined
}

/** The glyph the placeholder shows. Either chord still opens the palette. */
export function chordLabel(mac: boolean): string {
  return mac ? '⌘⇧P' : 'Ctrl+Shift+P'
}

/** Hint for cycling open tabs while the palette is closed. Same Mod as the palette chord. */
export function tabSwitchChordLabel(mac: boolean): string {
  return mac ? '⌘⇧← →' : 'Ctrl+Shift+← →'
}

export function isMacPlatform(platform: string, userAgent: string): boolean {
  return /Mac|iPhone|iPad/.test(platform) || userAgent.includes('Mac')
}

const chordType = 'mma-chord'

/** Two copies of one physical chord (runner script and the window hook) arrive this close. */
const chordEchoMs = 80

export interface PanelChordHandlers {
  readonly onPalette: () => void
  readonly onTabSwitch: (direction: 'prev' | 'next') => void
}

/**
 * Capture palette and tab-switch chords on the panel document.
 * An app iframe forwards the same chords with `mma-chord`, because a parent listener on that window does not see the key.
 * A nested website frame asks that iframe's window hook to forward. This listener still only accepts the app iframe.
 * @param doc - the panel document
 * @param handlers - already matched
 */
export function bindPanelChords(doc: Document, handlers: PanelChordHandlers): () => void {
  let echoedAt = 0
  let echoedKind = ''
  const fire = (chord: PanelChord) => {
    if (chord.kind === 'palette') handlers.onPalette()
    else handlers.onTabSwitch(chord.direction)
  }
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.repeat) return
    const chord = matchPanelChord(event)
    if (chord === undefined) return
    event.preventDefault()
    event.stopPropagation()
    fire(chord)
  }
  const onMessage = (event: Event) => {
    if (!(event instanceof MessageEvent) || event.origin !== doc.location.origin) return
    const chord = forwardedChord(event.data)
    if (chord === undefined) return
    const frames = doc.querySelectorAll('iframe')
    for (const frame of frames) {
      if (frame.contentWindow === event.source) {
        const now = Date.now()
        const kind = chord.kind === 'palette' ? 'palette' : `tab:${chord.direction}`
        if (now - echoedAt < chordEchoMs && echoedKind === kind) return
        echoedAt = now
        echoedKind = kind
        fire(chord)
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

/**
 * @deprecated Prefer bindPanelChords. Kept for a one-handler palette-only bind.
 */
export function bindPaletteChord(doc: Document, onChord: () => void): () => void {
  return bindPanelChords(doc, {
    onPalette: onChord,
    onTabSwitch: () => {},
  })
}

function forwardedChord(value: unknown): PanelChord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (row.type !== chordType) return undefined
  return matchPanelChord({
    key: typeof row.key === 'string' ? row.key : '',
    code: typeof row.code === 'string' ? row.code : '',
    shiftKey: row.shiftKey === true,
    altKey: row.altKey === true,
    metaKey: row.metaKey === true,
    ctrlKey: row.ctrlKey === true,
  })
}
