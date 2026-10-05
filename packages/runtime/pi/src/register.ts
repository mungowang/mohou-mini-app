import { execFile } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ProviderError, type ProviderRegistry, type RuntimeProvider } from '@mohou/runtime-provider'

import { createPiProvider } from './pi.ts'

const peers = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'] as const

/**
 * The three things one load does, injectable so a test can watch their order and the retry.
 * `present` answers from the filesystem on purpose: see {@link createPiLoad}.
 */
export interface PiLoadSteps {
  present(): boolean
  link(): void | Promise<void>
  load(): Promise<void>
}

export interface PiLoad {
  /** One attempt, shared with any concurrent caller. A failure is not remembered. */
  ensure(): Promise<boolean>
  /** Whether the last finished attempt loaded both peers. */
  loaded(): boolean
  /** Why the last finished attempt failed, for the message a caller shows. */
  failure(): string | undefined
}

/**
 * One loader for the Pi peers.
 *
 * The first step is a filesystem question, never a module-loader one. Node remembers a failed
 * resolution for the rest of the process, so asking the loader whether `@earendil-works/…` resolves
 * and only then creating the link poisons every later attempt in that process: the host would repair
 * its own prefix and still report Pi as unavailable until the next restart. Repair first, then the
 * one loader call an attempt makes.
 * @param steps - presence check, repair, and the load itself
 */
export function createPiLoad(steps: PiLoadSteps): PiLoad {
  let loading: Promise<boolean> | undefined
  let loaded = false
  let failure: string | undefined

  async function attempt(): Promise<boolean> {
    try {
      // The repair is inside the guard too: a prefix the user cannot write must leave the id
      // registered and unhealthy, not reject the promise every caller awaits.
      if (!steps.present()) await steps.link()
      await steps.load()
      failure = undefined
      return true
    } catch (error) {
      failure = error instanceof Error && error.message.length > 0 ? error.message : 'the peers did not load'
      return false
    }
  }

  return {
    ensure() {
      loading ??= attempt().then((ok) => {
        loaded = ok
        // A failed attempt is forgotten, so the next caller retries instead of inheriting it.
        if (!ok) loading = undefined
        return ok
      })
      return loading
    },
    loaded: () => loaded,
    failure: () => failure,
  }
}

/** The real steps: the prefix's own `node_modules`, this machine's Pi installs, and the two imports. */
function realSteps(): PiLoadSteps {
  const prefix = installRoot()
  const roots = () => peerRoots(process.execPath, homedir(), process.env)
  return {
    present: () => peersPresent(prefix),
    async link() {
      linkPiPeers(prefix, roots())
      if (peersPresent(prefix)) return
      const global = await npmRootGlobal(process.env)
      if (global !== undefined) linkPiPeers(prefix, [global])
    },
    async load() {
      await import('@earendil-works/pi-coding-agent')
      await import('@earendil-works/pi-ai')
    },
  }
}

const piLoad = createPiLoad(realSteps())

/**
 * Register Pi and return immediately. Linking and loading run after this call.
 * A failed load leaves the id registered and unhealthy. It does not fail boot, and a later
 * caller retries it.
 */
export function registerPiRuntime(registry: ProviderRegistry): RuntimeProvider {
  void piLoad.ensure()
  const inner = createPiProvider()
  const provider: RuntimeProvider = {
    id: inner.id,
    ...inner.label === undefined ? {} : { label: inner.label },
    configure: (config) => { inner.configure?.(config) },
    start: () => inner.start(),
    stop: () => inner.stop(),
    healthy: () => inner.healthy() && piLoad.loaded(),
    reason: () => inner.healthy() && piLoad.loaded() ? undefined : unavailable(piLoad.failure()),
    models: () => inner.models?.() ?? Promise.resolve([]),
    async llm(prompt, options) {
      if (!await piLoad.ensure()) throw new ProviderError('provider-unhealthy', unavailable(piLoad.failure()))
      return inner.llm(prompt, options)
    },
    async agent(goal, options) {
      if (!await piLoad.ensure()) throw new ProviderError('provider-unhealthy', unavailable(piLoad.failure()))
      return inner.agent(goal, options)
    },
  }
  registry.register(provider)
  return provider
}

export function ensurePiLoaded(): Promise<boolean> {
  return piLoad.ensure()
}

function unavailable(reason: string | undefined): string {
  return reason === undefined ? 'pi is not available' : `pi is not available: ${reason}`
}

/**
 * Whether both peers are reachable through the prefix's `node_modules`. Filesystem only: this runs
 * before the repair, and a loader probe here is what {@link createPiLoad} exists to avoid.
 */
function peersPresent(prefix: string): boolean {
  return peers.every(peer => existsSync(path.join(prefix, 'node_modules', ...peer.split('/'))))
}

/** Prefix that contains this package's `node_modules`. */
export function installRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
}

export function peerRoots(node: string, home: string, env: NodeJS.ProcessEnv): string[] {
  const nodeDir = path.dirname(node)
  const prefix = path.dirname(nodeDir)
  const roots = [
    path.join(prefix, 'lib', 'node_modules'),
    path.join(nodeDir, 'node_modules'),
    path.join(nodeDir, 'lib', 'node_modules'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'),
  ]
  if (typeof env.APPDATA === 'string' && env.APPDATA.length > 0) {
    const appData = path.join(env.APPDATA, 'npm', 'node_modules')
    if (!roots.includes(appData)) roots.push(appData)
  }
  return roots
}

export function piPackage(root: string, pkg: string): string | undefined {
  const direct = path.join(root, '@earendil-works', pkg)
  if (existsSync(direct)) return direct
  const nested = path.join(root, '@earendil-works', 'pi-coding-agent', 'node_modules', '@earendil-works', pkg)
  return existsSync(nested) ? nested : undefined
}

/** Link both peers into `prefix/node_modules`. A missing package is not an error. */
export function linkPiPeers(prefix: string, roots: readonly string[]): boolean {
  const destRoot = path.join(prefix, 'node_modules', '@earendil-works')
  mkdirSync(destRoot, { recursive: true })
  let linked = false
  for (const pkg of ['pi-coding-agent', 'pi-ai'] as const) {
    const src = roots.map(root => piPackage(root, pkg)).find(item => item !== undefined)
    if (src === undefined) continue
    placeLink(path.join(destRoot, pkg), src)
    linked = true
  }
  return linked
}

function npmRootGlobal(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm')
  if (!existsSync(npm)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(npm, ['root', '-g'], { env, timeout: 5_000 }, (error, stdout) => {
      if (error) {
        resolve(undefined)
        return
      }
      resolve(stdout.split(/\r?\n/).find(line => line.length > 0))
    })
  })
}

function placeLink(dest: string, src: string): void {
  try {
    const stat = lstatSync(dest)
    if (!stat.isSymbolicLink()) return
    rmSync(dest)
  } catch {
    // missing dest
  }
  symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
}
