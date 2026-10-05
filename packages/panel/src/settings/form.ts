import { isPanelLocale, type PanelLocale } from '../labels.ts'

/**
 * The mirrors the form offers. The packaged default is not one of them: an empty value means it,
 * so a build with a different default needs no change here.
 */
export const updateRegistryPresets = {
  npmmirror: 'https://registry.npmmirror.com',
  tencent: 'https://mirrors.cloud.tencent.com/npm/',
} as const

export type PanelRegistryChoice = 'default' | keyof typeof updateRegistryPresets | 'custom'

export type PanelRegistryResult =
  | { readonly ok: true; readonly registry: string }
  | { readonly ok: false; readonly key: 'registry-invalid' }

/** Which preset a stored value is, or `custom` for anything else an owner typed. */
export function registryChoice(registry: string): PanelRegistryChoice {
  const value = registry.trim()
  if (value.length === 0) return 'default'
  for (const [name, url] of Object.entries(updateRegistryPresets)) {
    if (value === url) return name as PanelRegistryChoice
  }
  return 'custom'
}

/**
 * Admit the update registry before any write. Empty means the packaged default.
 * A mirror is installed from, so it must be https with no credentials in the url.
 * @param value - the form value
 */
export function admitUpdateRegistry(value: string): PanelRegistryResult {
  const registry = value.trim()
  if (registry.length === 0) return { ok: true, registry: '' }
  let url: URL
  try {
    url = new URL(registry)
  } catch {
    return { ok: false, key: 'registry-invalid' }
  }
  if (url.protocol !== 'https:' || url.hostname.length === 0 || url.username.length > 0 || url.password.length > 0) {
    return { ok: false, key: 'registry-invalid' }
  }
  return { ok: true, registry }
}

/** Settings port range. Locked in the product decisions, not a host tunable. */
export const panelPortBound = { min: 1024, max: 65535 } as const

export type PanelPortResult =
  | { readonly ok: true; readonly port: number }
  | { readonly ok: false; readonly key: 'port-invalid' }

/**
 * Admit a settings port before any write. A bad value is not sent to Host.
 * @param value - the form value
 */
export function admitPanelPort(value: unknown): PanelPortResult {
  if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, key: 'port-invalid' }
  if (value < panelPortBound.min || value > panelPortBound.max) return { ok: false, key: 'port-invalid' }
  return { ok: true, port: value }
}

/**
 * The one language control. Both fields are the same locale.
 * @param locale - `en` or `zh-CN`
 */
export function panelLanguageFields(locale: string): { locale: PanelLocale; chatLanguage: PanelLocale } {
  if (!isPanelLocale(locale)) throw new Error(`panel locale is not supported: ${locale}`)
  return { locale, chatLanguage: locale }
}
