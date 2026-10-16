import { EventEmitter } from 'node:events'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  bindPanelLifetime,
  bindSupervisedLifetime,
  forgetWindowPid,
  isSupervised,
  intervalSchedule,
  processAlive,
  readWindowPid,
  rememberWindowPid,
  resolveWindowPidFile,
  watchLiveWindow,
  windowPidFileName,
  type PanelChild,
} from '../src/panel-lifetime.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('panel window pid', () => {
  it('resolves the runtime file unless the env path is set', () => {
    expect(resolveWindowPidFile('/rt', {})).toBe(join('/rt', windowPidFileName))
    expect(resolveWindowPidFile('/rt', { MINI_APP_WINDOW_PID_FILE: '' })).toBe(join('/rt', windowPidFileName))
    expect(resolveWindowPidFile('/rt', { MINI_APP_WINDOW_PID_FILE: '/tmp/panel.pid' })).toBe('/tmp/panel.pid')
  })

  it('remembers a private pid and forgets a symlink without its target', () => {
    const root = scratch()
    const file = join(root, windowPidFileName)
    rememberWindowPid(file, 4242)
    expect(readWindowPid(file)).toBe(4242)
    expect(lstatSync(file).mode & 0o777).toBe(0o600)
    const target = join(root, 'target')
    writeFileSync(target, 'keep')
    forgetWindowPid(file)
    symlinkSync(target, file)
    forgetWindowPid(file)
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('keep')
    forgetWindowPid(file)
    expect(readWindowPid(join(root, 'missing'))).toBeUndefined()
    writeFileSync(join(root, 'bad'), 'nope\n')
    expect(readWindowPid(join(root, 'bad'))).toBeUndefined()
    writeFileSync(join(root, 'zero'), '0\n')
    expect(readWindowPid(join(root, 'zero'))).toBeUndefined()
    const dir = join(root, 'dir')
    mkdirSync(dir)
    expect(() => readWindowPid(dir)).toThrow()
    forgetWindowPid(dir)
    expect(existsSync(dir)).toBe(true)
    chmodSync(dir, 0o500)
    expect(() => rememberWindowPid(join(dir, 'denied'), 1)).toThrow()
  })

  it('treats signal 0 as a liveness probe', () => {
    expect(processAlive(process.pid)).toBe(true)
    expect(processAlive(0)).toBe(false)
    expect(processAlive(-3)).toBe(false)
    expect(processAlive(1.5)).toBe(false)
    const kill = () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }) }
    expect(processAlive(9, kill)).toBe(true)
    const missing = () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }) }
    expect(processAlive(9, missing)).toBe(false)
    expect(processAlive(9, () => { throw new Error('plain') })).toBe(false)
  })

  it('fires once when the probe drops and stops when cancelled', () => {
    let live = true
    let gone = 0
    const cancel = watchLiveWindow(7, () => { gone += 1 }, () => live, (check) => {
      check()
      return () => undefined
    })
    expect(gone).toBe(0)
    live = false
    cancel()
    expect(gone).toBe(0)
    let calls = 0
    watchLiveWindow(7, () => { calls += 1 }, () => false, () => () => undefined)
    expect(calls).toBe(1)
    let ticks = 0
    const stop = intervalSchedule(() => { ticks += 1 }, 15)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(ticks).toBeGreaterThan(0)
        stop()
        const seen = ticks
        setTimeout(() => {
          expect(ticks).toBe(seen)
          resolve()
        }, 40)
      }, 50)
    })
  })
})

describe('bindPanelLifetime', () => {
  it('exits when a relaunch has no live window', async () => {
    const root = scratch()
    let opened = 0
    let disposed = 0
    let code = -1
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: true,
      open: () => { opened += 1; return fakeChild() },
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals: new EventEmitter(),
      probe: () => true,
    })
    await settled()
    expect(opened).toBe(0)
    expect(disposed).toBe(1)
    expect(code).toBe(0)
    rememberWindowPid(join(root, windowPidFileName), 9)
    code = -1
    disposed = 0
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: true,
      open: () => fakeChild(),
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals: new EventEmitter(),
      probe: () => false,
    })
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(0)
    expect(existsSync(join(root, windowPidFileName))).toBe(false)
  })

  it('adopts a live window and disposes once when it exits or a signal arrives', async () => {
    const root = scratch()
    rememberWindowPid(join(root, windowPidFileName), 11)
    const signals = new EventEmitter()
    let live = true
    let disposed = 0
    let code = -1
    let check: (() => void) | undefined
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: true,
      open: () => { throw new Error('should not open') },
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
      probe: () => live,
      schedule: (fn) => {
        check = fn
        return () => { check = undefined }
      },
    })
    expect(code).toBe(-1)
    live = false
    check?.()
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(0)
    expect(check).toBeUndefined()

    rememberWindowPid(join(root, windowPidFileName), 12)
    disposed = 0
    code = -1
    live = true
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: true,
      open: () => fakeChild(),
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
      probe: () => true,
      schedule: () => () => undefined,
    })
    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(130)
  })

  it('records the spawned pid and disposes when that window exits', async () => {
    const root = scratch()
    const signals = new EventEmitter()
    const child = fakeChild(77)
    let disposed = 0
    let code = -1
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: false,
      open: () => child,
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
    })
    expect(readWindowPid(join(root, windowPidFileName))).toBe(77)
    child.exitCode = 0
    child.emit('exit', 0)
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(0)
    expect(existsSync(join(root, windowPidFileName))).toBe(false)

    const again = fakeChild()
    disposed = 0
    await bindPanelLifetime({
      runtimeRoot: root,
      env: { MINI_APP_WINDOW_PID_FILE: join(root, 'custom.pid') },
      skipWindow: false,
      open: () => again,
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
    })
    expect(existsSync(join(root, 'custom.pid'))).toBe(false)
    signals.emit('SIGTERM')
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(143)
  })

  it('stays supervised until a signal and does not open a window', async () => {
    expect(isSupervised({})).toBe(false)
    expect(isSupervised({ MINI_APP_SUPERVISED: '1' })).toBe(true)
    const signals = new EventEmitter()
    let disposed = 0
    let code = -1
    bindSupervisedLifetime({
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
    })
    signals.emit('SIGTERM')
    signals.emit('SIGINT')
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(143)
  })

  it('disposes when SIGTERM arrives before the window spawn returns', async () => {
    const root = scratch()
    const signals = new EventEmitter()
    const child = fakeChild(77)
    let disposed = 0
    let code = -1
    let killed = 0
    child.kill = () => {
      killed += 1
      child.exitCode = null
      child.signalCode = 'SIGTERM'
      child.emit('exit', null)
      return true
    }
    await bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: false,
      open: () => {
        signals.emit('SIGTERM')
        return child
      },
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
    })
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(143)
    expect(killed).toBe(1)
    expect(existsSync(join(root, windowPidFileName))).toBe(false)
  })

  it('disposes and rethrows when the window fails to open', async () => {
    const root = scratch()
    const signals = new EventEmitter()
    let disposed = 0
    let code = -1
    await expect(bindPanelLifetime({
      runtimeRoot: root,
      env: {},
      skipWindow: false,
      open: () => { throw new Error('panel window is not built') },
      dispose: async () => { disposed += 1 },
      exit: (next) => { code = next },
      signals,
      probe: () => false,
    })).rejects.toThrow('panel window is not built')
    signals.emit('SIGTERM')
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(-1)
  })
})

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'mma-panel-life-'))
  roots.push(root)
  return root
}

function fakeChild(pid?: number): EventEmitter & PanelChild {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: (signal?: NodeJS.Signals | number) => boolean
    pid: number | undefined
  }
  child.exitCode = null
  child.signalCode = null
  child.pid = pid
  child.kill = () => {
    child.exitCode = 0
    child.emit('exit', 0)
    return true
  }
  return child
}

function settled(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0) })
}
