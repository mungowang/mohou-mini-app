import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkPackageUpdate, discardUpdateResult, newestTarball, readUpdateResult, readUpdateSource, stagePackageUpdate, updateEnv } from '../src/http/updates.ts'
import { hostUpdateResultPath } from '../src/host/layout.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const published = { name: '@mohou/host', current: '0.0.0', platform: 'darwin', private: false }

describe('checkPackageUpdate', () => {
  it('reports a newer registry version and a failed lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    })))
    const newer = await checkPackageUpdate(published)
    expect(newer.latest).toBe('9.9.9')
    expect(newer.updateAvailable).toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    const missing = await checkPackageUpdate(published)
    expect(missing.error).toContain('404')
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const failed = await checkPackageUpdate(published)
    expect(failed.error).toBe('offline')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: 1 }) })))
    const unversioned = await checkPackageUpdate(published)
    expect(unversioned.latest).toBeNull()
    expect(unversioned.updateAvailable).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw 'offline'
    }))
    expect((await checkPackageUpdate(published)).error).toBe('update check failed')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const local = await checkPackageUpdate({ ...published, private: true })
    expect(local.latest).toBe('0.0.0')
    expect(local.updateAvailable).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('picks a newer local tarball and stages that install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-update-'))
    const packs = join(root, 'packs')
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'tarball', tarballDir: packs },
      dependencies: { '@mohou/shell': 'file:old.tgz' },
    }))
    const { mkdir } = await import('node:fs/promises')
    await mkdir(packs)
    await writeFile(join(packs, 'mohou-shell-1.2.0.tgz'), '')
    await writeFile(join(packs, 'mohou-shell-1.0.0.tgz'), '')
    expect(newestTarball(packs, 'shell')).toBe('1.2.0')
    const found = await checkPackageUpdate(
      { name: '@mohou/shell', current: '1.0.0', platform: 'darwin', private: false },
      {},
      root,
    )
    expect(found.updateAvailable).toBe(true)
    expect(found.channel).toBe('tarball')
    expect(found.installable).toBe(true)
    expect(found.tarballDir).toBe(packs)
    stagePackageUpdate('1.2.0', {}, root)
    const staged = JSON.parse(await readFile(join(root, 'update.json'), 'utf8')) as { version: string; args: string[] }
    expect(staged.version).toBe('1.2.0')
    expect(staged.args[0]).toBe('install')
    expect(staged.args.some(arg => arg.includes('mohou-shell-1.2.0.tgz'))).toBe(true)
    expect(staged.args).toContain('--omit=peer')
    expect(staged.args).toContain('--prefer-offline')
    expect(staged.args).toContain('--fetch-retries=1')
    expect(newestTarball(join(root, 'missing'), 'shell')).toBeNull()
    expect(() => { stagePackageUpdate('1.0.0', {}, join(tmpdir(), 'mma-no-prefix')) }).toThrow(/app prefix/)
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'registry' },
      dependencies: {},
    }))
    stagePackageUpdate('2.0.0', {}, root)
    const registry = JSON.parse(await readFile(join(root, 'update.json'), 'utf8')) as { args: string[] }
    expect(registry.args).toContain('@mohou/shell@2.0.0')
    expect(registry.args).toContain('--omit=peer')
    expect(registry.args).not.toContain('--prefer-offline')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    const same = await checkPackageUpdate(
      { name: '@mohou/shell', current: '9.0.0', platform: 'darwin', private: false },
      {},
      root,
    )
    expect(same.channel).toBe('registry')
    expect(same.installable).toBe(true)
    expect(same.registry).toBe('https://registry.npmjs.org')
  })
})

describe('the update registry override', () => {
  it('lets the environment win over the prefix, and only offers a newer version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mirror-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'registry', registry: 'https://registry.npmjs.org' },
      dependencies: {},
    }))
    expect(readUpdateSource({}, root)).toEqual({ channel: 'registry', registry: 'https://registry.npmjs.org' })
    expect(readUpdateSource({ MINI_APP_NPM_REGISTRY: 'https://registry.npmmirror.com' }, root))
      .toEqual({ channel: 'registry', registry: 'https://registry.npmmirror.com' })
    expect(readUpdateSource({ MINI_APP_NPM_REGISTRY: '  ' }, root))
      .toEqual({ channel: 'registry', registry: 'https://registry.npmjs.org' })

    expect(updateEnv({}, { HOME: '/tmp/home' })).toEqual({ HOME: '/tmp/home' })
    expect(updateEnv({ updateRegistry: '' }, { HOME: '/tmp/home' })).toEqual({ HOME: '/tmp/home' })
    expect(updateEnv({ updateRegistry: ' https://registry.npmmirror.com ' }, {}))
      .toEqual({ MINI_APP_NPM_REGISTRY: 'https://registry.npmmirror.com' })

    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(url)
      return { ok: true, json: async () => ({ version: '1.0.19' }) }
    }))
    const older = await checkPackageUpdate(
      { name: '@mohou/shell', current: '1.0.20', platform: 'darwin', private: false },
      updateEnv({ updateRegistry: 'https://registry.npmmirror.com' }),
      root,
    )
    expect(asked[0]).toBe('https://registry.npmmirror.com/@mohou/shell/latest')
    expect(older.registry).toBe('https://registry.npmmirror.com')
    // A mirror that syncs late reports an older version. That is not an update to install.
    expect(older.latest).toBe('1.0.19')
    expect(older.updateAvailable).toBe(false)
  })
})

describe('readUpdateSource', () => {
  it('reads the prefix without asking any registry', async () => {
    expect(readUpdateSource({}, await mkdtemp(join(tmpdir(), 'mma-nosrc-')))).toEqual({ channel: 'none' })

    const root = await mkdtemp(join(tmpdir(), 'mma-src-'))
    const packs = join(root, 'packs')
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'tarball', tarballDir: packs },
      dependencies: { '@mohou/shell': 'file:x.tgz' },
    }))
    expect(readUpdateSource({}, root)).toEqual({ channel: 'tarball', tarballDir: packs })
    const override = join(root, 'other')
    expect(readUpdateSource({ MINI_APP_TARBALL_DIR: override }, root)).toEqual({ channel: 'tarball', tarballDir: override })

    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'registry' },
      dependencies: {},
    }))
    expect(readUpdateSource({}, root)).toEqual({ channel: 'registry', registry: 'https://registry.npmjs.org' })
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'mohou-app',
      mohou: { channel: 'registry', registry: 'https://registry.npmmirror.com' },
      dependencies: {},
    }))
    expect(readUpdateSource({}, root)).toEqual({ channel: 'registry', registry: 'https://registry.npmmirror.com' })
  })
})

describe('readUpdateResult', () => {
  it('reads the launcher record and drops one it cannot trust', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-result-'))
    expect(readUpdateResult(root)).toBeUndefined()
    await writeFile(hostUpdateResultPath(root), `${JSON.stringify({
      state: 'failed',
      code: 'exit',
      from: '1.0.16',
      to: '1.0.17',
      rolledBack: true,
      exitCode: 1,
      log: '/tmp/update.log',
      at: 1_759_000_000_000,
    })}\n`)
    expect(readUpdateResult(root)).toEqual({
      state: 'failed',
      code: 'exit',
      from: '1.0.16',
      to: '1.0.17',
      rolledBack: true,
      exitCode: 1,
      log: '/tmp/update.log',
      at: 1_759_000_000_000,
    })
    await writeFile(hostUpdateResultPath(root), `${JSON.stringify({
      state: 'done',
      to: '1.0.17',
      at: 1_759_000_000_001,
    })}\n`)
    expect(readUpdateResult(root)).toEqual({ state: 'done', to: '1.0.17', at: 1_759_000_000_001 })
    for (const broken of [
      'not json',
      JSON.stringify({ state: 'failed', code: 'unknown', at: 1 }),
      JSON.stringify({ state: 'failed', at: 1 }),
      JSON.stringify({ state: 'done' }),
      JSON.stringify({ state: 'done', at: 'now' }),
      JSON.stringify([]),
    ]) {
      await writeFile(hostUpdateResultPath(root), broken)
      expect(readUpdateResult(root)).toBeUndefined()
    }
  })

  it('drops the record the panel showed and keeps a newer one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-ack-'))
    await writeFile(hostUpdateResultPath(root), JSON.stringify({ state: 'done', to: '1.0.17', at: 5 }))
    discardUpdateResult(root, 4)
    expect(readUpdateResult(root)).toEqual({ state: 'done', to: '1.0.17', at: 5 })
    discardUpdateResult(root, 5)
    expect(readUpdateResult(root)).toBeUndefined()
    discardUpdateResult(root, 5)
  })
})
