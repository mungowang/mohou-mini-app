import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { armHostDrain, bindHostDrain, childExited } from '../src/drain.ts'

describe('bindHostDrain', () => {
  it('disposes once when the window exits', async () => {
    const signals = new EventEmitter()
    let disposed = 0
    let code = -1
    const child = fakeChild()
    bindHostDrain({
      dispose: async () => { disposed += 1 },
      child,
      exit: (next) => { code = next },
    }, signals)
    child.emit('exit', 0)
    await settled()
    expect(disposed).toBe(1)
    expect(code).toBe(0)
    signals.emit('SIGINT')
    await settled()
    expect(disposed).toBe(1)
  })

  it('kills the window on SIGTERM and still disposes', async () => {
    const signals = new EventEmitter()
    let killed = false
    let code = -1
    const child = fakeChild()
    child.kill = () => {
      killed = true
      child.exitCode = 0
      child.emit('exit', 0)
      return true
    }
    bindHostDrain({
      dispose: async () => undefined,
      child,
      exit: (next) => { code = next },
    }, signals)
    signals.emit('SIGTERM')
    await settled()
    expect(killed).toBe(true)
    expect(code).toBe(143)
  })

  it('exits when dispose fails and waits for a child that already exited', async () => {
    const signals = new EventEmitter()
    let code = -1
    const child = fakeChild()
    bindHostDrain({
      dispose: () => Promise.reject(new Error('down')),
      child,
      exit: (next) => { code = next },
    }, signals)
    signals.emit('SIGINT')
    await settled()
    expect(code).toBe(130)
    expect(await childExited({ exitCode: 3 } as never)).toBe(3)
    const pending = new EventEmitter() as EventEmitter & { exitCode: number | null; signalCode: NodeJS.Signals | null }
    pending.exitCode = null
    pending.signalCode = null
    const waiting = childExited(pending as never)
    pending.emit('exit', 4)
    expect(await waiting).toBe(4)
    expect(await childExited({ exitCode: null, signalCode: 'SIGTERM' } as never)).toBeNull()
  })

  it('disposes once when a second SIGTERM arrives while dispose is running', async () => {
    const signals = new EventEmitter()
    let calls = 0
    let code = -1
    let release: (() => void) | undefined
    const child = fakeChild()
    bindHostDrain({
      dispose: () => {
        calls += 1
        return new Promise((resolve) => { release = resolve })
      },
      child,
      exit: (next) => { code = next },
    }, signals)
    signals.emit('SIGTERM')
    signals.emit('SIGTERM')
    expect(calls).toBe(1)
    expect(code).toBe(-1)
    release?.()
    await settled()
    expect(code).toBe(143)
  })

  it('kills a window that appears after SIGTERM and disposes one that already died', async () => {
    const signals = new EventEmitter()
    let code = -1
    const armed = armHostDrain({
      dispose: async () => undefined,
      exit: (next) => { code = next },
    }, signals)
    signals.emit('SIGTERM')
    const child = fakeChild()
    let killed = false
    child.kill = () => {
      killed = true
      child.exitCode = null
      child.signalCode = 'SIGTERM'
      return true
    }
    expect(armed.attach(child)).toBe(true)
    await settled()
    expect(killed).toBe(true)
    expect(code).toBe(143)

    const later = new EventEmitter()
    let again = -1
    const dead = fakeChild()
    dead.exitCode = null
    dead.signalCode = 'SIGKILL'
    armHostDrain({
      dispose: async () => undefined,
      exit: (next) => { again = next },
    }, later).attach(dead)
    await settled()
    expect(again).toBe(0)
  })
})

function fakeChild(): EventEmitter & { exitCode: number | null; signalCode: NodeJS.Signals | null; kill: () => boolean } {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: () => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.kill = () => true
  return child
}

function settled(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve) })
}
