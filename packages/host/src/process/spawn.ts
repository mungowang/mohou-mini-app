import { type ChildProcess, spawn } from 'node:child_process'

import type { AppSpawnHandle, AppSpawnOptions } from '@mohou/contract'

import { scrubShellEnv, stopChild } from '../shell/command.ts'
import { captureChildOutput } from './output-ring.ts'
import { forceKillTree, trackAppSpawn, untrackAppSpawn, type SpawnTag } from './spawn-ledger.ts'

/** Default poll budget for `child.ready`. Host policy, not locked. */
export const DEFAULT_SPAWN_READY_MS = 30_000

/** How often ready polls. Host policy, not locked. */
export const DEFAULT_SPAWN_READY_INTERVAL_MS = 200

/** Grace after SIGTERM before force-kill. Host policy, not locked. */
export const DEFAULT_SPAWN_KILL_GRACE_MS = 3_000

export class SpawnError extends Error {
  readonly code: 'spawn-failed' | 'spawn-ready-timeout'
  /** Recent child output when available. */
  readonly detail?: string

  constructor(
    code: 'spawn-failed' | 'spawn-ready-timeout',
    message: string,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'SpawnError'
    this.code = code
    const detail = options?.detail?.trim() ?? ''
    if (detail.length > 0) this.detail = detail
  }
}

interface TrackedChild {
  readonly child: ChildProcess
  readonly handle: AppSpawnHandle
  readonly tag: SpawnTag
  readonly appId: string
  readonly output: () => string
  killed: boolean
}

/**
 * Per-app spawn registry. Host owns kill on session end and selective kill by tag.
 */
export function createSpawnRegistry(defaults: {
  readonly cwd: string
  readonly runtimeRoot: string
  readonly appId: string
  readonly env?: NodeJS.ProcessEnv
}) {
  const tracked = new Set<TrackedChild>()

  async function spawnFile(
    tag: SpawnTag,
    file: string,
    args: readonly string[] = [],
    options: AppSpawnOptions = {},
  ): Promise<AppSpawnHandle> {
    if (file.length === 0) throw new SpawnError('spawn-failed', 'spawn file is empty')
    const child = spawn(file, [...args], {
      cwd: options.cwd ?? defaults.cwd,
      env: {
        ...scrubShellEnv(defaults.env ?? process.env),
        PI_WEB_NO_OPEN: '1',
        ...options.env === undefined ? {} : options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const captured = captureChildOutput(child)
    const readOutput = () => captured.output()
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
      tag,
      appId: defaults.appId,
      output: readOutput,
      killed: false,
      handle: {
        get pid() {
          return child.pid
        },
        exited,
        output: readOutput,
        kill: async () => {
          if (entry.killed) return
          entry.killed = true
          await endChild(child)
        },
        ready: async (readyOptions) => {
          try {
            await waitReady(readyOptions.url, readyOptions.timeoutMs ?? DEFAULT_SPAWN_READY_MS)
          } catch (error) {
            if (!(error instanceof SpawnError)) throw error
            const detail = readOutput()
            throw new SpawnError(error.code, error.message, {
              cause: error.cause,
              detail,
            })
          }
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
          reject(new SpawnError('spawn-failed', error.message, {
            cause: error,
            ...readOutput().length > 0 ? { detail: readOutput() } : {},
          }))
        })
      })
    } catch (error) {
      tracked.delete(entry)
      throw error
    }
    const pid = child.pid
    if (pid !== undefined) {
      await trackAppSpawn(defaults.runtimeRoot, { pid, appId: defaults.appId, tag })
      const drop = () => {
        void untrackAppSpawn(defaults.runtimeRoot, pid).catch(() => undefined)
      }
      child.once('exit', drop)
      child.once('error', drop)
    }
    return entry.handle
  }

  async function dispose(tag?: SpawnTag): Promise<void> {
    const list = [...tracked].filter(entry => tag === undefined || entry.tag === tag)
    for (const entry of list) tracked.delete(entry)
    await Promise.all(list.map(async (entry) => {
      const pid = entry.child.pid
      entry.killed = true
      await endChild(entry.child)
      // Detached trees (pi-web → next) can outlive a soft stop; always force the group.
      if (pid !== undefined) forceKillTree(pid)
    }))
  }

  /** Recent output from live children (and still-tracked). For website fail snapshots. */
  function collectedOutput(tag?: SpawnTag): string {
    const parts: string[] = []
    for (const entry of tracked) {
      if (tag !== undefined && entry.tag !== tag) continue
      const text = entry.output()
      if (text.length === 0) continue
      parts.push(text)
    }
    return parts.join('\n\n')
  }

  return {
    spawnApp: (file: string, args?: readonly string[], options?: AppSpawnOptions) => {
      return spawnFile('app', file, args, options)
    },
    spawnWebsite: (file: string, args?: readonly string[], options?: AppSpawnOptions) => {
      return spawnFile('website', file, args, options)
    },
    disposeAll: () => dispose(),
    disposeAppTagged: () => dispose('app'),
    disposeWebsiteTagged: () => dispose('website'),
    collectedOutput,
  }
}

export type AppSpawnRegistry = ReturnType<typeof createSpawnRegistry>

async function endChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const done = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve()
    })
  })
  const pid = child.pid
  stopChild(child)
  /* c8 ignore start */
  const grace = setTimeout(() => {
    // After a short grace, force the process group (pi-web → next).
    if (pid !== undefined) forceKillTree(pid)
    else {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }
  }, DEFAULT_SPAWN_KILL_GRACE_MS)
  await Promise.race([done, delay(DEFAULT_SPAWN_KILL_GRACE_MS + 500)])
  clearTimeout(grace)
  // Final sweep — dispose path also force-kills; this covers handle.kill alone.
  if (pid !== undefined) forceKillTree(pid)
  /* c8 ignore stop */
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
