import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials, InstallError, createAppRegistry, createAuthorTools, installApp, runNpm, type AuthorCallPorts } from '../src/index.ts'

const files = {
  'manifest.json': JSON.stringify({
    id: 'com.example.app',
    name: 'Example',
    description: 'One line',
    version: '1',
    entry: 'ui.tsx',
  }),
  'ui.tsx': 'export {}',
  'main.api.ts': 'export {}\n',
}

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: {
      theme: 'light',
      palette: 'default',
      locale: 'zh-CN',
      chatLanguage: 'zh-CN',
      hostPort: 0,
      llm: null,
    },
    log() {},
    push() {},
    http: () => Promise.reject(new Error('unused')),
    bash: () => Promise.reject(new Error('unused')),
    pwsh: () => Promise.reject(new Error('unused')),
    metrics: () => Promise.reject(new Error('unused')),
    processDirectory: tmpdir(),
    createTemp: () => tmpdir(),
    provider: createEchoProvider(),
  }
}

describe('mini_app_install', () => {
  it('reads, denies, pins, and restores the last lockfile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-install-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      runNpm: async (appDir) => {
        await writeFile(join(appDir, 'package-lock.json'), JSON.stringify({
          packages: { 'node_modules/left-pad': { version: '1.3.0' } },
        }))
        return { exitCode: 0, stderr: '' }
      },
    })
    await registerWithFiles(author, 'com.example.app', files)
    expect(await author.invoke('mini_app_install', { appId: 'com.example.app' })).toMatchObject({
      ok: true,
      packages: {},
      lockfile: null,
    })
    const denied = await author.invoke('mini_app_install', {
      appId: 'com.example.app',
      packages: [{ name: 'axios', version: '1.0.0' }],
    })
    expect(denied).toMatchObject({ ok: false, code: 'install-denied' })
    expect(JSON.stringify(denied)).toContain('ctx.http')
    await expect(author.invoke('mini_app_write', {
      appId: 'com.example.app',
      path: 'package.json',
      content: '{}',
      commit: false,
    })).rejects.toMatchObject({ code: 'manifest-protected' })
    const installed = await author.invoke('mini_app_install', {
      appId: 'com.example.app',
      packages: [{ name: 'left-pad', version: '^1.3.0' }],
      commit: false,
    }) as { ok: boolean; packages: Record<string, string> }
    expect(installed.ok).toBe(true)
    expect(installed.packages['left-pad']).toBe('1.3.0')
    const manifest = await readFile(join(root, 'apps', 'com.example.app', 'package.json'), 'utf8')
    expect(manifest).not.toContain('scripts')
    const failing = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      runNpm: () => Promise.resolve({ exitCode: 1, stderr: 'network down' }),
    })
    const failed = await failing.invoke('mini_app_install', {
      appId: 'com.example.app',
      packages: [{ name: 'left-pad', version: '9.9.9' }],
      commit: false,
    })
    expect(failed).toMatchObject({ ok: false, code: 'install-failed' })
    expect(await readFile(join(root, 'apps', 'com.example.app', 'package.json'), 'utf8')).toContain('1.3.0')
    expect(await failing.invoke('mini_app_install', {
      appId: 'com.example.app',
      packages: [{ name: '../evil' }],
    })).toMatchObject({ ok: false, code: 'install-denied' })
    await author.dispose()
    await failing.dispose()
  })

  it('rejects a bad spec and restores after a thrown install', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-install-direct-'))
    await writeFile(join(dir, 'package-lock.json'), '{')
    expect((await installApp(dir, { packages: [], remove: [] })).lockfile).toBe('package-lock.json')
    await writeFile(join(dir, 'package.json'), 'not-json')
    await expect(installApp(dir, { packages: [], remove: [] })).rejects.toBeInstanceOf(InstallError)
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { kept: '1.0.0', bad: 1 } }))
    const removed = await installApp(dir, { packages: [], remove: ['kept'] }, {
      run: async (appDir) => {
        await writeFile(join(appDir, 'package-lock.json'), '[]')
        return { exitCode: 0, stderr: '' }
      },
    })
    expect(removed.ok).toBe(true)
    expect(removed.packages.kept).toBeUndefined()
    expect(await installApp(dir, { packages: [{ name: '@mohou/contract' }], remove: [] })).toMatchObject({ code: 'install-denied' })
    expect(await installApp(dir, { packages: [{ name: 'left-pad', version: '1.0.0; rm' }], remove: [] })).toMatchObject({ code: 'install-denied' })
    expect(await installApp(dir, { packages: [], remove: ['../x'] })).toMatchObject({ code: 'install-denied' })
    const thrown = await installApp(dir, { packages: [{ name: 'left-pad' }], remove: [] }, {
      timeoutMs: 20,
      run: (_appDir, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      }),
    })
    expect(thrown).toMatchObject({ ok: false, code: 'install-failed' })
    expect(await readFile(join(dir, 'package.json'), 'utf8')).not.toContain('left-pad')
    const unpinned = await installApp(dir, { packages: [{ name: 'left-pad', version: '1.2.3' }], remove: [] }, {
      run: async (appDir) => {
        await writeFile(join(appDir, 'package-lock.json'), '{')
        return { exitCode: 0, stderr: '' }
      },
    })
    expect(unpinned.packages['left-pad']).toBe('1.2.3')
    const quiet = await installApp(dir, { packages: [{ name: 'left-pad' }], remove: [] }, {
      run: () => Promise.resolve({ exitCode: 1, stderr: '' }),
    })
    expect(quiet.message).toBe('npm install failed')
    const bare = await installApp(dir, { packages: [{ name: 'left-pad' }], remove: [] }, {
      run: () => Promise.reject(new Error('nope')),
    })
    expect(bare.message).toBe('nope')
    const missingLock = await installApp(dir, { packages: [{ name: 'left-pad', version: '1.2.3' }], remove: [] }, {
      run: async (appDir) => {
        await rm(join(appDir, 'package-lock.json'), { force: true })
        return { exitCode: 0, stderr: '' }
      },
    })
    expect(missingLock.packages['left-pad']).toBe('1.2.3')
    const controller = new AbortController()
    const pending = runNpm(dir, controller.signal)
    controller.abort()
    await expect(Promise.race([
      pending,
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('npm did not stop'))
        }, 3000)
      }),
    ])).rejects.toBeTruthy()
  })
})
