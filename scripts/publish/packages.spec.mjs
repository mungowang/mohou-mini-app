import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { mirrorSyncEnabled, mirrorSyncUrl, publishFailures, syncMirrors, workspacePackages } from './packages.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('publish packages', () => {
  it('accepts the workspace set and keeps the root private', { timeout: 15_000 }, () => {
    expect(publishFailures(root)).toEqual([])
    expect(workspacePackages(root).map(item => item.pkg.name)).toEqual([
      '@mohou/app-view',
      '@mohou/contract',
      '@mohou/host',
      '@mohou/mcp-client',
      '@mohou/panel',
      '@mohou/runtime-pi',
      '@mohou/runtime-provider',
      '@mohou/shell',
      '@mohou/ui',
      '@mohou/values',
    ])
  })

  it('syncs npmmirror after publish unless the flag or env turns it off', async () => {
    expect(mirrorSyncEnabled(['--publish'], {})).toBe(true)
    expect(mirrorSyncEnabled(['--publish'], { MINI_APP_MIRROR_SYNC: '   ' })).toBe(true)
    expect(mirrorSyncEnabled(['--publish'], { MINI_APP_MIRROR_SYNC: '1' })).toBe(true)
    expect(mirrorSyncEnabled(['--publish', '--no-mirror-sync'], { MINI_APP_MIRROR_SYNC: '1' })).toBe(false)
    expect(mirrorSyncEnabled(['--publish'], { MINI_APP_MIRROR_SYNC: '0' })).toBe(false)
    expect(mirrorSyncEnabled(['--publish'], { MINI_APP_MIRROR_SYNC: 'false' })).toBe(false)
    expect(mirrorSyncUrl('@mohou/shell')).toBe('https://registry.npmmirror.com/-/package/%40mohou%2Fshell/syncs')

    const calls = []
    const failures = await syncMirrors(['@mohou/shell', '@mohou/host'], async (url, init) => {
      calls.push({ url, method: init.method })
      if (url.endsWith('%40mohou%2Fhost/syncs')) return { ok: false, status: 500, text: async () => 'busy' }
      return { ok: true, status: 201, text: async () => '{"ok":true}' }
    })
    expect(calls).toEqual([
      { url: mirrorSyncUrl('@mohou/shell'), method: 'PUT' },
      { url: mirrorSyncUrl('@mohou/host'), method: 'PUT' },
    ])
    expect(failures).toEqual(['@mohou/host 500 busy'])

    const thrown = await syncMirrors(['@mohou/shell'], async () => {
      throw new Error('offline')
    })
    expect(thrown).toEqual(['@mohou/shell offline'])
  })
})
