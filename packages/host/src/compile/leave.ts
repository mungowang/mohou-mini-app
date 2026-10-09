/**
 * Runner guard for links and forms.
 * A same-frame external URL would replace the app document. The sandbox does not stop that.
 * `javascript:` still runs. A same-origin URL stays. `http` and `https` off this origin, and `mailto:`, open outside.
 * An app script can remove the listeners. That is the same limit as the sandbox attribute.
 */
/**
 * Capture Mod+Shift+P inside the app document and tell the parent.
 * A listener the parent adds on the iframe window does not see the key in WKWebView.
 */
export function chordForwardSource(): string {
  return `document.addEventListener('keydown', (event) => {
  if (event.altKey || !event.shiftKey) return
  if (event.key !== 'p' && event.key !== 'P') return
  if (!event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  event.stopPropagation()
  parent.postMessage({ type: 'mma-chord', key: event.key, shiftKey: true, altKey: false, metaKey: event.metaKey, ctrlKey: event.ctrlKey }, location.origin)
}, true)
`
}

export function leaveGuardSource(): string {
  return `function linkLeave(href, pageHref) {
  let url
  try {
    url = new URL(href, pageHref)
  } catch {
    return 'block'
  }
  if (url.protocol === 'javascript:') return 'script'
  if (url.protocol === 'mailto:') return 'mail'
  const page = new URL(pageHref)
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return url.origin === page.origin ? 'stay' : 'browser'
  }
  return 'block'
}
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const node = event.target
  if (!node || typeof node.closest !== 'function') return
  const anchor = node.closest('a[href]')
  if (!anchor) return
  const target = (anchor.getAttribute('target') || '').toLowerCase()
  if (target === '_blank') return
  const leave = linkLeave(anchor.getAttribute('href') || '', location.href)
  if (leave === 'stay' || leave === 'script') return
  event.preventDefault()
  if (leave === 'browser' || leave === 'mail') window.open(anchor.href, '_blank', 'noopener')
}, true)
document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  const target = (form.getAttribute('target') || '').toLowerCase()
  if (target === '_blank') return
  const leave = linkLeave(form.action, location.href)
  if (leave === 'stay' || leave === 'script') return
  event.preventDefault()
  if (leave === 'browser' || leave === 'mail') window.open(form.action, '_blank', 'noopener')
}, true)`
}
