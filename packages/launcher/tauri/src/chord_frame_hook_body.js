/* Body only. matchWireChord / wireChordPayload come from chord-wire.js (prepended at build). */
function fromChild(source) {
  var frames = document.querySelectorAll('iframe')
  for (var i = 0; i < frames.length; i += 1) {
    if (frames[i].contentWindow === source) return true
  }
  return false
}
document.addEventListener('keydown', function (event) {
  if (parent === window) return
  var kind = matchWireChord(event)
  if (kind === null) return
  event.preventDefault()
  event.stopImmediatePropagation()
  parent.postMessage(wireChordPayload(event, kind), '*')
}, true)
window.addEventListener('message', function (event) {
  if (parent === window || !fromChild(event.source)) return
  var kind = matchWireChord(event.data)
  if (kind === null) return
  parent.postMessage(wireChordPayload(event.data, kind), '*')
})
