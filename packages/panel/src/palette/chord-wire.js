/**
 * One matcher for panel chrome chords on the wire (iframe → panel).
 * Panel imports this module. Host leave + launcher hook embed the same file
 * (exports stripped) so a key list cannot drift.
 *
 * Match only decides. Callers postMessage + preventDefault when this returns non-null.
 */

/** @returns {'palette' | 'tab-prev' | 'tab-next' | null} */
export function matchWireChord(event) {
  if (!event || event.repeat === true || event.altKey === true || event.shiftKey !== true) return null
  if (event.metaKey !== true && event.ctrlKey !== true) return null
  var key = typeof event.key === 'string' ? event.key : ''
  var code = typeof event.code === 'string' ? event.code : ''
  if (key === 'p' || key === 'P' || code === 'KeyP') return 'palette'
  if (key === 'ArrowLeft' || key === 'Left' || code === 'ArrowLeft') return 'tab-prev'
  if (key === 'ArrowRight' || key === 'Right' || code === 'ArrowRight') return 'tab-next'
  return null
}

/**
 * Normalize a matched chord for postMessage. Arrow keys always become ArrowLeft/ArrowRight.
 * @param {object} event
 * @param {'palette' | 'tab-prev' | 'tab-next'} kind
 */
export function wireChordPayload(event, kind) {
  var key = kind === 'palette'
    ? (event.key === 'P' || event.key === 'p' ? event.key : 'p')
    : kind === 'tab-prev' ? 'ArrowLeft' : 'ArrowRight'
  return {
    type: 'mma-chord',
    key: key,
    code: typeof event.code === 'string' ? event.code : '',
    shiftKey: true,
    altKey: false,
    metaKey: event.metaKey === true,
    ctrlKey: event.ctrlKey === true,
  }
}
