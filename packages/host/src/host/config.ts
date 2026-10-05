import { readFile, writeFile } from 'node:fs/promises'

import type { RuntimeProvider } from '@mohou/runtime-provider'

import { ConfigError } from './codes.ts'
import { hostConfigPath } from './layout.ts'
import { allocateHostPort } from './port.ts'

/** Appearance. A stored preference, not a resolved OS value. */
export const hostThemes = ['system', 'light', 'dark'] as const

export type HostTheme = (typeof hostThemes)[number]

export interface HostPolicy {
  runtimeRoot: string
  hostPort: number
  theme: HostTheme
  palette: string
  locale: string
  chatLanguage: string
  llm: { provider: string; model: string } | null
  runtimeProvider: {
    id: string
    config?: { provider?: string; model?: string; options?: Record<string, string> }
  }
  /** Absent, or `default`, means the builtin library. Not required to boot. */
  defaultWorkbenchId?: string
  /**
   * Registry for this product's own update check and install, when the owner wants a mirror.
   * Absent or empty follows the install prefix's build-time value. Our own npm children only:
   * `~/.npmrc` and an app's own dependency installs are untouched.
   */
  updateRegistry?: string
}

/** Seed numbers and names. Host policy, not a locked product value. */
export interface HostSeed {
  hostPort: number
  theme: HostTheme
  palette: string
  locale: string
}

/** Port bound. Host policy, not a locked product value. */
export interface PortBound {
  min: number
  max: number
}

export const DEFAULT_PORT_BOUND: PortBound = { min: 1024, max: 65535 }

const PUBLIC_KEYS = ['runtimeRoot', 'hostPort', 'theme', 'palette', 'locale', 'chatLanguage', 'llm', 'runtimeProvider'] as const
const OPTIONAL_KEYS = ['defaultWorkbenchId'] as const

/**
 * Read `host.json`. A missing file writes a complete seed. A present bad file throws and is left as it was.
 * @param runtimeRoot - directory that contains the file
 * @param seed - values used only when the file is absent
 * @param ports - accepted host port range
 */
export async function resolveHostConfig(runtimeRoot: string, seed: HostSeed, ports: PortBound = DEFAULT_PORT_BOUND): Promise<HostPolicy> {
  const file = hostConfigPath(runtimeRoot)
  const text = await readFile(file, 'utf8').catch(() => undefined)
  if (text === undefined) {
    // First boot only: pick a free port before anything external can pin the MCP URL.
    const hostPort = await allocateHostPort(seed.hostPort, ports)
    const created = seedPolicy(runtimeRoot, { ...seed, hostPort })
    await writeFile(file, `${JSON.stringify(created, null, 2)}\n`)
    return created
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new ConfigError('config-invalid', 'host config is not JSON', { cause: error })
  }
  return admitPolicy(parsed, runtimeRoot, ports)
}

/**
 * Write the public fields. `locale` and `chatLanguage` must be the same value.
 * A new `runtimeProvider.id` does not switch the live brain.
 * @param runtimeRoot - directory that contains the file
 * @param current - the resolved file
 * @param raw - untrusted form body
 * @param ports - accepted host port range
 */
export async function writeHostPolicy(
  runtimeRoot: string,
  current: HostPolicy,
  raw: unknown,
  ports: PortBound = DEFAULT_PORT_BOUND,
): Promise<{ policy: HostPolicy; restartRequired: boolean }> {
  const next = admitPolicy(raw, runtimeRoot, ports)
  if (next.locale !== next.chatLanguage) {
    throw new ConfigError('config-invalid', 'locale and chatLanguage must be the same value')
  }
  await writeFile(hostConfigPath(runtimeRoot), `${JSON.stringify(next, null, 2)}\n`)
  return {
    policy: next,
    restartRequired: next.hostPort !== current.hostPort || next.runtimeProvider.id !== current.runtimeProvider.id,
  }
}

/**
 * Probe one registered provider. Does not write config and does not switch the live brain.
 * @param id - provider id from the form
 * @param providers - brains Shell registered
 * @param liveId - the provider Host is running, if any
 */
export async function probeBrain(
  id: string,
  providers: readonly RuntimeProvider[],
  liveId?: string,
): Promise<{ healthy: true } | { healthy: false; code: string; message: string }> {
  const provider = providers.find(item => item.id === id)
  if (provider === undefined) {
    return { healthy: false, code: 'provider-missing', message: `no runtime provider: ${id}` }
  }
  if (id === liveId) {
    const healthy = provider.healthy()
    if (!healthy) {
      return { healthy: false, code: 'provider-unhealthy', message: `runtime provider is not healthy: ${id}` }
    }
    return { healthy: true }
  }
  try {
    provider.configure?.({})
    await provider.start()
    const healthy = provider.healthy()
    await provider.stop()
    return healthy
      ? { healthy: true }
      : { healthy: false, code: 'provider-unhealthy', message: `runtime provider is not healthy: ${id}` }
  } catch (error) {
    await provider.stop().catch(() => undefined)
    const message = error instanceof Error ? error.message : 'runtime provider probe failed'
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'provider-unhealthy'
    return { healthy: false, code, message }
  }
}

function seedPolicy(runtimeRoot: string, seed: HostSeed): HostPolicy {
  return {
    runtimeRoot,
    hostPort: seed.hostPort,
    theme: seed.theme,
    palette: seed.palette,
    locale: seed.locale,
    chatLanguage: seed.locale,
    llm: null,
    runtimeProvider: { id: 'echo' },
  }
}

function admitPolicy(raw: unknown, runtimeRoot: string, ports: PortBound): HostPolicy {
  if (!isRecord(raw)) throw new ConfigError('config-invalid', 'host config must be an object')
  for (const key of Object.keys(raw)) {
    if (!(PUBLIC_KEYS as readonly string[]).includes(key) && !(OPTIONAL_KEYS as readonly string[]).includes(key)) {
      throw new ConfigError('config-invalid', `host config field is not public: ${key}`)
    }
  }
  for (const key of PUBLIC_KEYS) {
    if (!(key in raw)) throw new ConfigError('config-missing', `host config missing ${key}`)
  }
  if (raw.runtimeRoot !== runtimeRoot) {
    throw new ConfigError('config-invalid', 'host config runtimeRoot does not match the runtime root')
  }
  const hostPort = raw.hostPort
  if (typeof hostPort !== 'number' || !Number.isInteger(hostPort) || hostPort < ports.min || hostPort > ports.max) {
    throw new ConfigError('config-invalid', 'host config hostPort is invalid')
  }
  const theme = raw.theme
  if (typeof theme !== 'string' || !(hostThemes as readonly string[]).includes(theme)) {
    throw new ConfigError('config-invalid', 'host config theme is invalid')
  }
  const palette = requiredText(raw.palette, 'palette')
  const locale = requiredText(raw.locale, 'locale')
  const chatLanguage = requiredText(raw.chatLanguage, 'chatLanguage')
  return {
    runtimeRoot,
    hostPort,
    theme: theme as HostTheme,
    palette,
    locale,
    chatLanguage,
    llm: admitLlm(raw.llm),
    runtimeProvider: admitProvider(raw.runtimeProvider),
    ...admitWorkbench(raw.defaultWorkbenchId),
  }
}

function admitWorkbench(value: unknown): { defaultWorkbenchId: string } | Record<string, never> {
  if (value === undefined || value === 'default') return {}
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError('config-invalid', 'host config defaultWorkbenchId is invalid')
  }
  return { defaultWorkbenchId: value }
}

function admitLlm(value: unknown): HostPolicy['llm'] {
  if (value === null) return null
  if (!isRecord(value)) throw new ConfigError('config-invalid', 'host config llm is invalid')
  return { provider: requiredText(value.provider, 'llm.provider'), model: requiredText(value.model, 'llm.model') }
}

function admitProvider(value: unknown): HostPolicy['runtimeProvider'] {
  if (!isRecord(value)) throw new ConfigError('config-invalid', 'host config runtimeProvider is invalid')
  const id = requiredText(value.id, 'runtimeProvider.id')
  if (value.config === undefined) return { id }
  if (!isRecord(value.config)) throw new ConfigError('config-invalid', 'host config runtimeProvider.config is invalid')
  const config = value.config
  if (config.provider !== undefined && typeof config.provider !== 'string') {
    throw new ConfigError('config-invalid', 'host config runtimeProvider.config.provider is invalid')
  }
  if (config.model !== undefined && typeof config.model !== 'string') {
    throw new ConfigError('config-invalid', 'host config runtimeProvider.config.model is invalid')
  }
  if (config.options !== undefined && !isStringRecord(config.options)) {
    throw new ConfigError('config-invalid', 'host config runtimeProvider.config.options is invalid')
  }
  return {
    id,
    config: {
      ...typeof config.provider === 'string' ? { provider: config.provider } : {},
      ...typeof config.model === 'string' ? { model: config.model } : {},
      ...isStringRecord(config.options) ? { options: config.options } : {},
    },
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ConfigError('config-invalid', `host config ${field} is invalid`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}
