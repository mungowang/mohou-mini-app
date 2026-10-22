import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PassThrough } from 'node:stream'

import { captureChildOutput, createOutputRing, formatSpawnOutput } from '../src/process/output-ring.ts'
import { createSpawnRegistry, SpawnError } from '../src/process/spawn.ts'

describe('spawn output ring', () => {
  it('drops from the front when over cap and ignores empty pushes', () => {
    const ring = createOutputRing(8)
    ring.push('')
    expect(ring.read()).toBe('')
    ring.push('abcdefghij')
    expect(ring.read()).toBe('cdefghij')
    ring.push('XYZ')
    expect(ring.read().endsWith('XYZ')).toBe(true)
    expect(ring.read().length).toBeLessThanOrEqual(8)
    expect(formatSpawnOutput('out', '')).toContain('stdout')
    expect(formatSpawnOutput('out', '')).not.toContain('stderr')
    expect(formatSpawnOutput('', 'err')).toContain('stderr')
    expect(formatSpawnOutput('', 'err')).not.toContain('stdout')
    expect(formatSpawnOutput('out', 'err')).toContain('stdout')
    expect(formatSpawnOutput('out', 'err')).toContain('stderr')
    expect(formatSpawnOutput('', '')).toBe('')
    const once = createOutputRing(4)
    once.push('12')
    once.push('3456')
    expect(once.read()).toBe('3456')
  })

  it('captureChildOutput accepts Buffer and string chunks', async () => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const captured = captureChildOutput({ stdout, stderr })
    stdout.write(Buffer.from('from-buf'))
    stderr.write('from-str')
    await new Promise(r => setTimeout(r, 20))
    expect(captured.output()).toContain('from-buf')
    expect(captured.output()).toContain('from-str')
    const empty = captureChildOutput({ stdout: null, stderr: null })
    expect(empty.output()).toBe('')
    const onlyOut = captureChildOutput({ stdout: new PassThrough(), stderr: null })
    expect(onlyOut.output()).toBe('')
  })
})

describe('spawn handle output', () => {
  const roots: string[] = []
  const registries: Array<ReturnType<typeof createSpawnRegistry>> = []

  afterEach(async () => {
    await Promise.all(registries.splice(0).map(item => item.disposeAll()))
    await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
  })

  it('captures process output for failure analysis and attaches detail on ready timeout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-spawn-out-'))
    roots.push(root)
    const registry = createSpawnRegistry({
      cwd: process.cwd(),
      runtimeRoot: root,
      appId: 'com.example.out',
    })
    registries.push(registry)

    const child = await registry.spawnApp(process.execPath, [
      '-e',
      'process.stderr.write("boom-line\\n"); process.stdout.write("ok\\n"); setInterval(() => {}, 1000)',
    ])
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && !child.output().includes('boom-line')) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(child.output()).toContain('boom-line')

    await expect(child.ready({ url: 'http://127.0.0.1:9', timeoutMs: 400 })).rejects.toMatchObject({
      code: 'spawn-ready-timeout',
    })
    try {
      await child.ready({ url: 'http://127.0.0.1:9', timeoutMs: 300 })
    } catch (error) {
      expect(error).toBeInstanceOf(SpawnError)
      expect((error as SpawnError).detail).toContain('boom-line')
    }

    expect(registry.collectedOutput('app')).toContain('boom-line')
  })
})
