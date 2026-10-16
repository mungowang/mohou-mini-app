import { chmodSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { armHostDrain, type DrainChild } from './drain.ts'

/** Pid file under the runtime root. Shell owns it; it is not a host config field. */
export const windowPidFileName = 'panel-window.pid'

/**
 * Where the open panel window records its pid.
 * `MINI_APP_WINDOW_PID_FILE` overrides the runtime-root file. Empty keeps the default.
 */
export function resolveWindowPidFile(runtimeRoot: string, env: NodeJS.ProcessEnv): string {
  const override = env.MINI_APP_WINDOW_PID_FILE
  if (override === undefined || override === '') return path.join(runtimeRoot, windowPidFileName)
  return override
}

/** Record the window pid. Mode is private to this user. */
export function rememberWindowPid(file: string, pid: number): void {
  writeFileSync(file, `${pid}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
}

/** Pid from the file, or absent when the file is missing or not a positive integer. */
export function readWindowPid(file: string): number | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return undefined
    throw error
  }
  const pid = Number(text.trim())
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  return pid
}

/** Remove the pid path itself. A symlink is unlinked, not followed. A directory is left alone. */
export function forgetWindowPid(file: string): void {
  let stat
  try {
    stat = lstatSync(file)
  } catch (error) {
    if (isEnoent(error)) return
    throw error
  }
  if (!stat.isSymbolicLink() && !stat.isFile()) return
  try {
    unlinkSync(file)
  } catch (error) {
    if (isEnoent(error)) return
    throw error
  }
}

/** True when `pid` is a live process. Signal 0 does not deliver a signal. */
export function processAlive(
  pid: number,
  kill: (pid: number, signal: number) => boolean = defaultKill,
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    kill(pid, 0)
    return true
  } catch (error) {
    return isEperm(error)
  }
}

function defaultKill(pid: number, signal: number): boolean {
  return process.kill(pid, signal)
}

/** Repeating check. The returned function stops it. */
export type WindowSchedule = (check: () => void, everyMs: number) => () => void

export function intervalSchedule(check: () => void, everyMs: number): () => void {
  const timer = setInterval(check, everyMs)
  timer.unref()
  return () => { clearInterval(timer) }
}

/**
 * Call `onGone` once when `probe` says the pid is gone.
 * A pid that is already gone calls `onGone` before this returns.
 */
export function watchLiveWindow(
  pid: number,
  onGone: () => void,
  probe: (pid: number) => boolean,
  schedule: WindowSchedule,
  everyMs = 500,
): () => void {
  let stopped = false
  const check = () => {
    if (stopped) return
    if (!probe(pid)) {
      stopped = true
      onGone()
    }
  }
  if (!probe(pid)) {
    onGone()
    return () => { stopped = true }
  }
  const cancel = schedule(check, everyMs)
  return () => {
    stopped = true
    cancel()
  }
}

export interface PanelChild extends DrainChild {
  readonly pid?: number | undefined
}

/**
 * Own the panel window for this sidecar process.
 * The first launch spawns it and records the pid. Exit 75 leaves that process running.
 * The next launch (`skipWindow`) adopts the pid and disposes when the window exits.
 */
export async function bindPanelLifetime(input: {
  readonly runtimeRoot: string
  readonly env: NodeJS.ProcessEnv
  readonly skipWindow: boolean
  readonly open: () => PanelChild
  readonly dispose: () => Promise<void>
  readonly exit: (code: number) => void
  readonly signals?: NodeJS.EventEmitter
  readonly probe?: (pid: number) => boolean
  readonly schedule?: WindowSchedule
}): Promise<void> {
  const file = resolveWindowPidFile(input.runtimeRoot, input.env)
  const signals = input.signals ?? process
  const probe = input.probe ?? processAlive
  const schedule = input.schedule ?? intervalSchedule
  if (input.skipWindow) {
    adoptWindow({ file, probe, schedule, dispose: input.dispose, exit: input.exit, signals })
    return
  }
  // Spawn blocks, and the origin line is already out. Bind first so a signal during that spawn exits 143.
  const armed = armHostDrain({
    dispose: async () => {
      forgetWindowPid(file)
      await input.dispose()
    },
    exit: input.exit,
  }, signals)
  let child: PanelChild
  try {
    child = input.open()
  } catch (error) {
    armed.cancel()
    await input.dispose()
    throw error
  }
  const started = armed.attach(child)
  if (!started && typeof child.pid === 'number') rememberWindowPid(file, child.pid)
}

function adoptWindow(input: {
  readonly file: string
  readonly probe: (pid: number) => boolean
  readonly schedule: WindowSchedule
  readonly dispose: () => Promise<void>
  readonly exit: (code: number) => void
  readonly signals: NodeJS.EventEmitter
}): void {
  let draining = false
  let cancel: () => void = () => undefined
  const stop = (code: number) => {
    if (draining) return
    draining = true
    cancel()
    forgetWindowPid(input.file)
    void input.dispose().then(() => input.exit(code), () => input.exit(code))
  }
  const pid = readWindowPid(input.file)
  if (pid === undefined || !input.probe(pid)) {
    stop(0)
    return
  }
  cancel = watchLiveWindow(pid, () => stop(0), input.probe, input.schedule)
  input.signals.on('SIGINT', () => stop(130))
  input.signals.on('SIGTERM', () => stop(143))
}

/** The packaged app sets this. The Tauri executable owns the window and spawns this process. */
export function isSupervised(env: NodeJS.ProcessEnv): boolean {
  return env.MINI_APP_SUPERVISED === '1'
}

/**
 * Stay up until a signal. Do not open a window.
 * Exit 75 is the restart path inside Host; it does not come through here.
 */
export function bindSupervisedLifetime(input: {
  readonly dispose: () => Promise<void>
  readonly exit: (code: number) => void
  readonly signals?: NodeJS.EventEmitter
}): void {
  let draining = false
  const stop = (code: number) => {
    if (draining) return
    draining = true
    void input.dispose().then(() => input.exit(code), () => input.exit(code))
  }
  const signals = input.signals ?? process
  signals.on('SIGINT', () => stop(130))
  signals.on('SIGTERM', () => stop(143))
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isEperm(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM'
}
