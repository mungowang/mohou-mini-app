import { type ChildProcess, spawn } from 'node:child_process'

import type { AppSpawnHandle, AppSpawnOptions } from '@mohou/contract'

import { scrubShellEnv, stopChild } from '../shell/command.ts'
import { trackWebsiteSpawn, untrackWebsiteSpawn } from './spawn-ledger.ts'

/** Default poll budget for `child.ready`. Host policy, not locked. */
export const DEFAULT_SPAWN_READY_MS = 30_000

/** How often ready polls. Host policy, not locked. */
export const DEFAULT_SPAWN_READY_INTERVAL_MS = 200

/** Grace after SIGTERM before force-kill. Host policy, not locked. */
export const DEFAULT_SPAWN_KILL_GRACE_MS = 3_000

export class SpawnError extends Error {
  readonly code: 'spawn-failed' | 'spawn-ready-timeout'

  constructor(code: 'spawn-failed' | 'spawn-ready-timeout', message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SpawnError'
    this.code = code
  }
}

interface TrackedChild {
  readonly child: ChildProcess
  readonly handle: AppSpawnHandle
  killed: boolean
}

/**
 * Session-scoped spawn registry. Every handle is killed on `dispose`.
 * @param defaults - cwd and optional env base
 */
export function createSpawnRegistry(defaults: {
  readonly cwd: string
  /** Runtime root for the durable pid ledger (crash reclaim). */
  readonly runtimeRoot: string
  readonly env?: NodeJS.ProcessEnv
}) {
  const tracked = new Set<TrackedChild>()

  async function spawnFile(
    file: string,
    args: readonly string[] = [],
    options: AppSpawnOptions = {},
  ): Promise<AppSpawnHandle> {
    if (file.length === 0) throw new SpawnError('spawn-failed', 'spawn file is empty')
    const child = spawn(file, [...args], {
      cwd: options.cwd ?? defaults.cwd,
      env: {
        ...scrubShellEnv(defaults.env ?? process.env),
        // Belt for tools that also honor env (pi-web: PI_WEB_NO_OPEN) when CLI flags are lost.
        PI_WEB_NO_OPEN: '1',
        ...options.env === undefined ? {} : options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const exited = new Promise<{ readonly exitCode: number | null }>((resolve) => {
      child.once('exit', (code) => {
        resolve({ exitCode: code })
      })
      child.once('error', () => {
        resolve({ exitCode: null })
      })
    })
    const entry: TrackedChild = {
      child,
      killed: false,
      handle: {
        get pid() {
          return child.pid
        },
        exited,
        kill: async () => {
          if (entry.killed) return
          entry.killed = true
          await endChild(child)
        },
        ready: async (readyOptions) => {
          await waitReady(readyOptions.url, readyOptions.timeoutMs ?? DEFAULT_SPAWN_READY_MS)
        },
      },
    }
    child.once('error', () => {
      tracked.delete(entry)
      entry.killed = true
    })
    child.once('exit', () => {
      tracked.delete(entry)
    })
    tracked.add(entry)
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => {
          resolve()
        })
        child.once('error', (error) => {
          reject(new SpawnError('spawn-failed', error.message, { cause: error }))
        })
      })
    } catch (error) {
      tracked.delete(entry)
      throw error
    }
    const pid = child.pid
    if (pid !== undefined) {
      await trackWebsiteSpawn(defaults.runtimeRoot, pid)
      const drop = () => {
        void untrackWebsiteSpawn(defaults.runtimeRoot, pid).catch(() => undefined)
      }
      child.once('exit', drop)
      child.once('error', drop)
    }
    return entry.handle
  }

  async function dispose(): Promise<void> {
    const list = [...tracked]
    tracked.clear()
    await Promise.all(list.map(async (entry) => {
      if (entry.killed) return
      entry.killed = true
      await endChild(entry.child)
    }))
  }

  return { spawn: spawnFile, dispose }
}

async function endChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const done = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve()
    })
  })
  // POSIX: stopChild signals the process group (-pid) so pi-web children die with the leader.
  stopChild(child)
  const grace = setTimeout(() => {
    const pid = child.pid
    if (pid !== undefined && process.platform !== 'win32') {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }
    } else {
      stopChild(child)
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }
  }, DEFAULT_SPAWN_KILL_GRACE_MS)
  await Promise.race([done, delay(DEFAULT_SPAWN_KILL_GRACE_MS + 500)])
  clearTimeout(grace)
}

async function waitReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(2_000, Math.max(100, deadline - Date.now()))),
      })
      void response.body?.cancel()
      return
    } catch (error) {
      lastError = error
      await delay(DEFAULT_SPAWN_READY_INTERVAL_MS)
    }
  }
  throw new SpawnError(
    'spawn-ready-timeout',
    `spawn ready timed out for ${url}`,
    lastError === undefined ? undefined : { cause: lastError },
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
