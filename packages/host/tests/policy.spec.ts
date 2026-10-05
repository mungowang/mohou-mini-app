import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createEchoProvider } from '@mohou/runtime-provider'

import {
  ConfigError,
  hostConfigPath,
  probeBrain,
  resolveHostConfig,
  writeHostPolicy,
  type HostSeed,
} from '../src/index.ts'

const seed: HostSeed = {
  hostPort: 17880,
  theme: 'system',
  palette: 'default',
  locale: 'zh-CN',
}

describe('host policy', () => {
  it('seeds a free port when the preferred seed port is busy', async () => {
    const blocker = createServer()
    const busy = await new Promise<number>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(0, '127.0.0.1', () => {
        const address = blocker.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
    try {
      const root = await mkdtemp(join(tmpdir(), 'mma-policy-seed-'))
      const created = await resolveHostConfig(root, { ...seed, hostPort: busy })
      expect(created.hostPort).not.toBe(busy)
      const stored = JSON.parse(await readFile(hostConfigPath(root), 'utf8')) as { hostPort: number }
      expect(stored.hostPort).toBe(created.hostPort)
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  })

  it('seeds a missing file and refuses a bad write without changing it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-policy-'))
    const created = await resolveHostConfig(root, seed)
    expect(created.runtimeProvider.id).toBe('echo')
    expect(created.chatLanguage).toBe('zh-CN')
    expect(await readFile(hostConfigPath(root), 'utf8')).toContain('"echo"')
    await writeFile(hostConfigPath(root), '{')
    await expect(resolveHostConfig(root, seed)).rejects.toBeInstanceOf(ConfigError)
    await writeFile(hostConfigPath(root), JSON.stringify(created))
    await expect(writeHostPolicy(root, created, { ...created, locale: 'en', chatLanguage: 'zh-CN' })).rejects.toMatchObject({ code: 'config-invalid' })
    expect(JSON.parse(await readFile(hostConfigPath(root), 'utf8'))).toMatchObject({ locale: 'zh-CN' })
    const written = await writeHostPolicy(root, created, { ...created, runtimeProvider: { id: 'other' } })
    expect(written.restartRequired).toBe(true)
    const nextPort = written.policy.hostPort === 17880 ? 17881 : 17880
    const portChanged = await writeHostPolicy(root, written.policy, { ...written.policy, hostPort: nextPort })
    expect(portChanged.restartRequired).toBe(true)
    const same = await writeHostPolicy(root, portChanged.policy, portChanged.policy)
    expect(same.restartRequired).toBe(false)
    const echo = createEchoProvider()
    expect(await probeBrain('missing', [echo])).toMatchObject({ healthy: false, code: 'provider-missing' })
    expect(await probeBrain('echo', [echo], 'echo')).toMatchObject({ healthy: false, code: 'provider-unhealthy' })
    expect(await probeBrain('echo', [echo])).toEqual({ healthy: true })
    expect(echo.healthy()).toBe(false)
    const broken = {
      ...createEchoProvider(),
      id: 'broken',
      start: () => Promise.reject(new Error('down')),
    }
    expect(await probeBrain('broken', [broken])).toMatchObject({ healthy: false, message: 'down' })
    // A provider that knows why it is unhealthy says so, instead of sending the user to a log.
    const reasoned = {
      ...createEchoProvider(),
      id: 'reasoned',
      healthy: () => false,
      reason: () => 'pi is not available: Cannot find module',
    }
    expect(await probeBrain('reasoned', [reasoned], 'reasoned')).toMatchObject({
      healthy: false,
      code: 'provider-unhealthy',
      message: 'pi is not available: Cannot find module',
    })
    expect(await probeBrain('reasoned', [reasoned])).toMatchObject({ message: 'pi is not available: Cannot find module' })
  })

  it('names a missing field and rejects a private field', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-policy-bad-'))
    const created = await resolveHostConfig(root, seed)
    const { palette: _palette, ...missing } = created
    await writeFile(hostConfigPath(root), JSON.stringify(missing))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-missing' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, token: 'nope' }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, hostPort: 1 }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, theme: 'neon' }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, llm: { provider: 'echo', model: 'echo' } }))
    expect((await resolveHostConfig(root, seed)).llm).toEqual({ provider: 'echo', model: 'echo' })
    await writeFile(hostConfigPath(root), JSON.stringify({
      ...created,
      runtimeProvider: { id: 'echo', config: { provider: 'echo', model: 'm', options: { a: 'b' } } },
    }))
    expect((await resolveHostConfig(root, seed)).runtimeProvider.config?.options).toEqual({ a: 'b' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, defaultWorkbenchId: 'com.example.desk' }))
    expect((await resolveHostConfig(root, seed)).defaultWorkbenchId).toBe('com.example.desk')
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, defaultWorkbenchId: 'default' }))
    expect((await resolveHostConfig(root, seed)).defaultWorkbenchId).toBeUndefined()
    const cleared = await writeHostPolicy(root, { ...created, defaultWorkbenchId: 'com.example.desk' }, { ...created, defaultWorkbenchId: 'default' })
    expect(cleared.policy.defaultWorkbenchId).toBeUndefined()
    expect(await readFile(hostConfigPath(root), 'utf8')).not.toContain('defaultWorkbenchId')
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, defaultWorkbenchId: '' }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, runtimeProvider: { id: 'echo', config: { options: { a: 1 } } } }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
  })

  it('keeps an update registry, and writes nothing for the packaged default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-registry-'))
    const created = await resolveHostConfig(root, seed)
    expect(created.updateRegistry).toBeUndefined()
    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, updateRegistry: '  https://registry.npmmirror.com  ' }))
    expect((await resolveHostConfig(root, seed)).updateRegistry).toBe('https://registry.npmmirror.com')

    const written = await writeHostPolicy(root, { ...created }, { ...created, updateRegistry: 'https://mirrors.cloud.tencent.com/npm/' })
    expect(written.policy.updateRegistry).toBe('https://mirrors.cloud.tencent.com/npm/')
    expect(await readFile(hostConfigPath(root), 'utf8')).toContain('mirrors.cloud.tencent.com')

    // The packaged default clears the field rather than storing an empty string.
    const cleared = await writeHostPolicy(root, written.policy, { ...written.policy, updateRegistry: '' })
    expect(cleared.policy.updateRegistry).toBeUndefined()
    expect(await readFile(hostConfigPath(root), 'utf8')).not.toContain('updateRegistry')

    await writeFile(hostConfigPath(root), JSON.stringify({ ...created, updateRegistry: 42 }))
    await expect(resolveHostConfig(root, seed)).rejects.toMatchObject({ code: 'config-invalid' })
  })
})
