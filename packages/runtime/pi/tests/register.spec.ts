import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createProviderRegistry } from '@mohou/runtime-provider'
import { afterEach, describe, expect, it } from 'vitest'

import { createPiLoad, linkPiPeers, peerRoots, piPackage, registerPiRuntime } from '../src/register.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createPiLoad', () => {
  /** A load that fails the first time and succeeds after the repair, the way a hot update leaves it. */
  function steps(present: boolean[], loadResults: boolean[]) {
    const calls: string[] = []
    let index = 0
    const steps = {
      present: () => {
        const value = present[Math.min(index, present.length - 1)] ?? true
        calls.push(`present:${value}`)
        return value
      },
      link: () => {
        calls.push('link')
      },
      load: async () => {
        const ok = loadResults[Math.min(index, loadResults.length - 1)] ?? true
        index += 1
        calls.push(`load:${ok}`)
        if (!ok) throw new Error('Cannot find package')
      },
    }
    return { calls, steps }
  }

  it('repairs before it touches the loader, because a failed resolution is cached for the process', async () => {
    const { calls, steps: fake } = steps([false, true], [true])
    const load = createPiLoad(fake)
    expect(await load.ensure()).toBe(true)
    expect(calls).toEqual(['present:false', 'link', 'load:true'])
    expect(load.loaded()).toBe(true)
    expect(load.failure()).toBeUndefined()
  })

  it('does not repair a prefix that is already linked', async () => {
    const { calls, steps: fake } = steps([true], [true])
    const load = createPiLoad(fake)
    expect(await load.ensure()).toBe(true)
    expect(calls).toEqual(['present:true', 'load:true'])
  })

  it('does not remember a failure, so the next caller retries and can recover', async () => {
    const { calls, steps: fake } = steps([true, true, true], [false, true])
    const load = createPiLoad(fake)
    expect(await load.ensure()).toBe(false)
    expect(load.loaded()).toBe(false)
    expect(load.failure()).toBe('Cannot find package')
    // The retry, which the old loader never made: it cached the first failure for the whole process.
    expect(await load.ensure()).toBe(true)
    expect(load.loaded()).toBe(true)
    expect(load.failure()).toBeUndefined()
    expect(calls).toEqual(['present:true', 'load:false', 'present:true', 'load:true'])
  })

  it('caches a success, and shares one attempt between concurrent callers', async () => {
    const { calls, steps: fake } = steps([true], [true])
    const load = createPiLoad(fake)
    const [first, second] = await Promise.all([load.ensure(), load.ensure()])
    expect([first, second]).toEqual([true, true])
    expect(await load.ensure()).toBe(true)
    expect(calls).toEqual(['present:true', 'load:true'])
  })

  it('answers false when the repair itself fails, instead of rejecting the shared promise', async () => {
    const load = createPiLoad({
      present: () => false,
      link: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      },
      load: () => Promise.resolve(),
    })
    await expect(load.ensure()).resolves.toBe(false)
    expect(load.loaded()).toBe(false)
    expect(load.failure()).toBe('EACCES: permission denied')
  })

  it('names why the last attempt failed', async () => {
    const failing = createPiLoad({
      present: () => true,
      link: () => undefined,
      load: () => Promise.reject(new Error('Cannot find module @earendil-works/pi-ai')),
    })
    expect(await failing.ensure()).toBe(false)
    expect(failing.failure()).toBe('Cannot find module @earendil-works/pi-ai')
  })
})

describe('registerPiRuntime', () => {
  it('registers pi and returns before the load finishes', () => {
    const registry = createProviderRegistry()
    const started = Date.now()
    const provider = registerPiRuntime(registry)
    expect(Date.now() - started).toBeLessThan(200)
    expect(provider.id).toBe('pi')
    expect(registry.ids()).toContain('pi')
    expect(registry.get('pi')).toBe(provider)
    expect(provider.healthy()).toBe(false)
    // The probe shows this text, so it has to name the failure rather than the state.
    expect(provider.reason?.()).toContain('pi is not available')
  })
})

describe('linkPiPeers', () => {
  it('links a global package and leaves a real directory alone', () => {
    const root = temp()
    const global = path.join(root, 'global')
    const prefix = path.join(root, 'prefix')
    mkdirSync(path.join(global, '@earendil-works', 'pi-coding-agent'), { recursive: true })
    writeFileSync(path.join(global, '@earendil-works', 'pi-coding-agent', 'package.json'), '{}\n')
    mkdirSync(path.join(prefix, 'node_modules', '@earendil-works', 'pi-ai'), { recursive: true })
    writeFileSync(path.join(prefix, 'node_modules', '@earendil-works', 'pi-ai', 'keep'), 'real\n')
    expect(piPackage(global, 'pi-coding-agent')).toBe(path.join(global, '@earendil-works', 'pi-coding-agent'))
    expect(linkPiPeers(prefix, [global])).toBe(true)
    const linked = path.join(prefix, 'node_modules', '@earendil-works', 'pi-coding-agent')
    expect(lstatSync(linked).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(prefix, 'node_modules', '@earendil-works', 'pi-ai')).isSymbolicLink()).toBe(false)
  })

  it('finds a package nested under pi-coding-agent', () => {
    const root = temp()
    const nested = path.join(root, '@earendil-works', 'pi-coding-agent', 'node_modules', '@earendil-works', 'pi-ai')
    mkdirSync(nested, { recursive: true })
    expect(piPackage(root, 'pi-ai')).toBe(nested)
    expect(piPackage(root, 'missing')).toBeUndefined()
  })
})

describe('peerRoots', () => {
  it('includes the node prefix and does not repeat APPDATA', () => {
    const roots = peerRoots('/node/bin/node', '/home/me', { APPDATA: '/home/me/AppData/Roaming' })
    expect(roots[0]).toBe(path.join('/node', 'lib', 'node_modules'))
    expect(roots.filter(root => root === path.join('/home/me/AppData/Roaming', 'npm', 'node_modules'))).toHaveLength(1)
  })
})

function temp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mma-pi-link-'))
  temps.push(dir)
  return dir
}
