import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'

/** The window child fields the drain uses. A real `ChildProcess` satisfies this. */
export interface DrainChild {
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'exit', listener: (code: number | null) => void): unknown
}

export interface HostDrain {
  /** Dispose the live host, then exit. */
  dispose(): Promise<void>
  /** Window process. Killed when a signal arrives first. */
  child: DrainChild
  exit(code: number): void
}

/** Dispose and exit, without a window child yet. */
export interface HostDrainTarget {
  dispose(): Promise<void>
  exit(code: number): void
}

/**
 * Bind `SIGINT` and `SIGTERM` before the window exists.
 * `attach` connects the child and returns true when dispose has already started.
 * `cancel` drops the listeners and does not dispose.
 * Listeners stay until the process exits: `once` removes the listener before dispose finishes,
 * and a second signal then takes the default action, so the exit status is null.
 */
export function armHostDrain(
  drain: HostDrainTarget,
  signals: NodeJS.EventEmitter = process,
): { attach(child: DrainChild): boolean; cancel(): void } {
  let draining = false
  let child: DrainChild | undefined
  const finish = (code: number) => {
    if (draining) return
    draining = true
    if (child !== undefined && child.exitCode === null && child.signalCode === null) child.kill()
    void drain.dispose().then(() => drain.exit(code), () => drain.exit(code))
  }
  const onSigint = () => finish(130)
  const onSigterm = () => finish(143)
  signals.on('SIGINT', onSigint)
  signals.on('SIGTERM', onSigterm)
  return {
    cancel() {
      signals.removeListener('SIGINT', onSigint)
      signals.removeListener('SIGTERM', onSigterm)
    },
    attach(opened) {
      child = opened
      if (draining) {
        if (opened.exitCode === null && opened.signalCode === null) opened.kill()
        return true
      }
      if (opened.exitCode !== null || opened.signalCode !== null) {
        finish(opened.exitCode ?? 0)
        return true
      }
      opened.once('exit', (code: number | null) => finish(code ?? 0))
      return false
    },
  }
}

/**
 * Dispose the live host when the window exits or the process is signalled.
 * A second signal does not dispose twice. `SIGINT` is Ctrl-C.
 * @param drain - live host, window child, and the process exit
 * @param signals - defaults to this process
 */
export function bindHostDrain(drain: HostDrain, signals: NodeJS.EventEmitter = process): void {
  armHostDrain(drain, signals).attach(drain.child)
}

/** Resolves when `child` has exited. A signal death resolves `null` and does not wait. */
export function childExited(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolve) => {
    once(child, 'exit').then(([code]) => resolve(code as number | null)).catch(() => resolve(null))
  })
}
