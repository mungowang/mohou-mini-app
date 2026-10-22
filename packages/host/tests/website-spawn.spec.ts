import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { createSpawnRegistry } from '../src/website/spawn.ts'

describe('website spawn registry', () => {
  const registries: Array<ReturnType<typeof createSpawnRegistry>> = []

  afterEach(async () => {
    await Promise.all(registries.splice(0).map(item => item.dispose()))
  })

  it('kills a registered child on dispose', async () => {
    const registry = createSpawnRegistry({ cwd: process.cwd(), runtimeRoot: process.cwd() })
    registries.push(registry)
    const child = await registry.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    expect(child.pid).toEqual(expect.any(Number))
    await registry.dispose()
    const result = await child.exited
    expect(result.exitCode === null || typeof result.exitCode === 'number').toBe(true)
  })

  it('rejects an empty spawn file, missing binary, and times out ready', async () => {
    const registry = createSpawnRegistry({ cwd: process.cwd(), runtimeRoot: process.cwd() })
    registries.push(registry)
    await expect(registry.spawn('')).rejects.toMatchObject({ code: 'spawn-failed' })
    await expect(registry.spawn('/no/such/website-binary-xyz')).rejects.toMatchObject({ code: 'spawn-failed' })
    const child = await registry.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    await child.kill()
    await expect(child.ready({
      url: 'http://127.0.0.1:1',
      timeoutMs: 300,
    })).rejects.toMatchObject({ code: 'spawn-ready-timeout' })
  })

  it('ready resolves when the url answers', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const url = `http://127.0.0.1:${address.port}`
    try {
      const registry = createSpawnRegistry({ cwd: process.cwd(), runtimeRoot: process.cwd() })
      registries.push(registry)
      const child = await registry.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
      await child.ready({ url, timeoutMs: 5_000 })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  })
})
