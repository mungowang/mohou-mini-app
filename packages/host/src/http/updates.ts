import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { homePackagesDir, hostUpdateResultPath } from '../host/layout.ts'
import { aboutInfo } from './ports.ts'

/** Why an install did not finish. The panel owns the wording of each code. */
export const updateFailureCodes = ['timeout', 'exit', 'prepare', 'closed', 'leftover', 'verify', 'boot'] as const

export type UpdateFailureCode = (typeof updateFailureCodes)[number]

/**
 * What the launcher recorded about the last install. `from` is the version that was running
 * when the attempt started, and `at` is epoch milliseconds.
 */
export type UpdateAttempt =
  | {
    readonly state: 'done'
    readonly from?: string
    readonly to?: string
    readonly at: number
  }
  | {
    readonly state: 'failed'
    readonly code: UpdateFailureCode
    readonly from?: string
    readonly to?: string
    readonly rolledBack: boolean
    readonly exitCode?: number
    readonly log?: string
    readonly at: number
  }

/**
 * Where this install updates from. `none` is a source tree with no install prefix,
 * which cannot install anything.
 */
export type UpdateSource =
  | { readonly channel: 'registry'; readonly registry: string }
  | { readonly channel: 'tarball'; readonly tarballDir: string }
  | { readonly channel: 'none' }

export interface UpdateCheck {
  readonly name: string
  readonly current: string
  readonly latest: string | null
  readonly updateAvailable: boolean
  readonly channel?: 'registry' | 'tarball'
  readonly installable?: boolean
  /** Set when the install prefix names one, so a panel can say where an update comes from. */
  readonly registry?: string
  readonly tarballDir?: string
  readonly error?: string
  /** The last install this machine recorded, when one is on disk. */
  readonly lastAttempt?: UpdateAttempt
}

interface PrefixUpdate {
  readonly dir: string
  readonly channel: 'registry' | 'tarball'
  readonly registry?: string
  readonly tarballDir?: string
  readonly packages: readonly string[]
}

/** Ask the install channel once. A dev tree with no prefix still asks the registry and cannot install. */
export async function checkPackageUpdate(
  about: ReturnType<typeof aboutInfo> = aboutInfo(),
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<UpdateCheck> {
  const empty = { name: about.name, current: about.current, latest: null, updateAvailable: false }
  if (about.name.length === 0) return { ...empty, error: 'package name is missing' }
  const prefix = readPrefixUpdate(cwd, env)
  if (prefix?.channel === 'tarball') {
    const tarballDir = prefix.tarballDir ?? homePackagesDir(homedir())
    const latest = newestTarball(tarballDir, 'shell')
    return {
      name: '@mohou/shell',
      current: about.current,
      latest,
      channel: 'tarball',
      tarballDir,
      installable: true,
      updateAvailable: latest !== null && compareVersion(latest, about.current) > 0,
    }
  }
  if (about.private && prefix === undefined) return { ...empty, latest: about.current, installable: false }
  const registry = prefix?.registry ?? 'https://registry.npmjs.org'
  const name = prefix === undefined ? about.name : '@mohou/shell'
  try {
    const response = await fetch(`${registry.replace(/\/$/, '')}/${name}/latest`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) return {
      ...empty,
      name,
      ...prefix === undefined ? {} : { channel: prefix.channel, registry: prefix.registry ?? 'https://registry.npmjs.org' },
      installable: prefix !== undefined,
      error: `package registry returned ${response.status}`,
    }
    const body = await response.json() as { version?: unknown }
    const latest = typeof body.version === 'string' ? body.version : null
    return {
      name,
      current: about.current,
      latest,
      channel: prefix?.channel ?? 'registry',
      ...prefix === undefined ? {} : { registry: prefix.registry ?? 'https://registry.npmjs.org' },
      installable: prefix !== undefined,
      updateAvailable: latest !== null && latest !== about.current,
    }
  } catch (error) {
    return {
      ...empty,
      name,
      ...prefix === undefined ? {} : { channel: prefix.channel, registry: prefix.registry ?? 'https://registry.npmjs.org' },
      installable: prefix !== undefined,
      error: error instanceof Error ? error.message : 'update check failed',
    }
  }
}

/**
 * Where this install would update from. Reads the install prefix; asks no registry, so a
 * panel can show the source while the network is slow or down.
 * @param env - process environment; `MINI_APP_TARBALL_DIR` overrides the package folder
 * @param cwd - directory the sidecar runs in
 */
export function readUpdateSource(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): UpdateSource {
  const prefix = readPrefixUpdate(cwd, env)
  if (prefix === undefined) return { channel: 'none' }
  if (prefix.channel === 'tarball') return { channel: 'tarball', tarballDir: prefix.tarballDir ?? homePackagesDir(homedir()) }
  return { channel: 'registry', registry: prefix.registry ?? 'https://registry.npmjs.org' }
}

/**
 * Read the launcher's record of the last install. A missing, unreadable, or malformed file reads as
 * no attempt: the panel shows nothing rather than a guessed outcome.
 * @param runtimeRoot - the directory the launcher and Host share
 */
export function readUpdateResult(runtimeRoot: string): UpdateAttempt | undefined {
  let text: string
  try {
    text = readFileSync(hostUpdateResultPath(runtimeRoot), 'utf8')
  } catch {
    return undefined
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  return admitUpdateAttempt(value)
}

/**
 * Forget the record the panel just showed. `at` names the attempt, so a newer one survives.
 * @param runtimeRoot - the directory the launcher and Host share
 * @param at - epoch milliseconds of the attempt the panel displayed
 */
export function discardUpdateResult(runtimeRoot: string, at: number): void {
  const current = readUpdateResult(runtimeRoot)
  if (current === undefined || current.at !== at) return
  rmSync(hostUpdateResultPath(runtimeRoot), { force: true })
}

/** Write `update.json` for the launcher to run after this process exits. */
export function stagePackageUpdate(version: string, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): void {
  const prefix = readPrefixUpdate(cwd, env)
  if (prefix === undefined) throw new Error('update install needs an app prefix')
  const args = prefix.channel === 'tarball'
    ? tarballInstallArgs(prefix, version)
    : ['install', `@mohou/shell@${version}`, ...installFlags(), '--registry', prefix.registry ?? 'https://registry.npmjs.org']
  writeFileSync(path.join(prefix.dir, 'update.json'), `${JSON.stringify({ version, args })}\n`)
}

function installFlags(): string[] {
  return ['--no-fund', '--no-audit', '--omit=peer', '--fetch-retries=1', '--fetch-timeout=20000']
}

function tarballInstallArgs(prefix: PrefixUpdate, version: string): string[] {
  const dir = prefix.tarballDir ?? homePackagesDir(homedir())
  const specs = prefix.packages.map((name) => {
    const file = path.join(dir, packedName(name, version))
    return `file:${file.replaceAll('\\', '/')}`
  })
  return ['install', ...specs, ...installFlags()]
}

function packedName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
}

export function newestTarball(dir: string, slug: string): string | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const versions = names.flatMap((name) => {
    const match = new RegExp(`^mohou-${slug}-(\\d+\\.\\d+\\.\\d+)\\.tgz$`).exec(name)
    return match?.[1] === undefined ? [] : [match[1]]
  })
  return versions.sort(compareVersion).at(-1) ?? null
}

function compareVersion(left: string, right: string): number {
  const a = left.split('.').map(part => Number(part))
  const b = right.split('.').map(part => Number(part))
  const width = Math.max(a.length, b.length)
  for (let index = 0; index < width; index += 1) {
    const av = a[index] ?? 0
    const bv = b[index] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

/** The value a launcher writes. Untrusted at this boundary: a bad shape reads as no attempt. */
function admitUpdateAttempt(value: unknown): UpdateAttempt | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.at !== 'number' || !Number.isFinite(row.at)) return undefined
  const from = updateVersion(row.from)
  const to = updateVersion(row.to)
  if (row.state === 'done') {
    return {
      state: 'done',
      at: row.at,
      ...from === undefined ? {} : { from },
      ...to === undefined ? {} : { to },
    }
  }
  if (row.state !== 'failed') return undefined
  const code = updateFailureCode(row.code)
  if (code === undefined) return undefined
  return {
    state: 'failed',
    code,
    rolledBack: row.rolledBack === true,
    at: row.at,
    ...from === undefined ? {} : { from },
    ...to === undefined ? {} : { to },
    ...typeof row.exitCode === 'number' && Number.isFinite(row.exitCode) ? { exitCode: row.exitCode } : {},
    ...typeof row.log === 'string' && row.log.length > 0 ? { log: row.log } : {},
  }
}

function updateVersion(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function updateFailureCode(value: unknown): UpdateFailureCode | undefined {
  return typeof value === 'string' && (updateFailureCodes as readonly string[]).includes(value)
    ? value as UpdateFailureCode
    : undefined
}

function readPrefixUpdate(cwd: string, env: NodeJS.ProcessEnv): PrefixUpdate | undefined {
  const dir = findPrefix(cwd)
  if (dir === undefined) return undefined
  const parsed = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    mohou?: { channel?: string; registry?: string; tarballDir?: string }
  }
  const channel = parsed.mohou?.channel
  if (channel !== 'registry' && channel !== 'tarball') return undefined
  const packages = Object.keys(parsed.dependencies ?? {}).filter(name => name.startsWith('@mohou/'))
  const override = env.MINI_APP_TARBALL_DIR
  const tarballDir = override !== undefined && override.length > 0 ? override : parsed.mohou?.tarballDir
  return {
    dir,
    channel,
    ...typeof parsed.mohou?.registry === 'string' ? { registry: parsed.mohou.registry } : {},
    ...tarballDir === undefined ? {} : { tarballDir },
    packages: packages.length === 0 ? ['@mohou/shell'] : packages,
  }
}

function findPrefix(start: string): string | undefined {
  let dir = path.resolve(start)
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string }
      if (parsed.name === 'mohou-app') return dir
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}
