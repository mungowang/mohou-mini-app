import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { emptyCredentials, hostAuthoringToken } from '@mohou/host'
import { httpLayout } from '@mohou/host/http'

import { bootHost, resolveAuthorSkillSource } from '../src/index.ts'

describe('resolveAuthorSkillSource', () => {
  it('finds the monorepo or packaged skill tree', () => {
    const source = resolveAuthorSkillSource()
    expect(source.includes('mohou-mini-app')).toBe(true)
    expect(source.endsWith('mohou-mini-app') || source.endsWith('mohou-mini-app/')).toBe(true)
  })
})

describe('bootHost', () => {
  it('starts a host and leaves nothing running when config is corrupt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-shell-'))
    const port = await freePort()
    const host = await bootHost({ runtimeRoot: root, hostPort: port, credentials: emptyCredentials() })
    expect(host.policy.runtimeProvider.id).toBe('echo')
    expect(host.policy.locale).toBe('en')
    const opened: { command: string; args: readonly string[] }[] = []
    const withWindow = await bootHost({
      runtimeRoot: await mkdtemp(join(tmpdir(), 'mma-shell-win-')),
      hostPort: await freePort(),
      credentials: emptyCredentials(),
      openWindow: true,
      windowSpawn: (command, args) => {
        opened.push({ command, args })
        return { unref() {} } as never
      },
    })
    expect(opened[0]?.args.at(-1)).toBe(`http://127.0.0.1:${withWindow.policy.hostPort}`)
    await withWindow.dispose()
    // First-time seed on a busy preferred port walks to a free port (no prompt).
    const fresh = await mkdtemp(join(tmpdir(), 'mma-shell-fresh-'))
    const seeded = await bootHost({ runtimeRoot: fresh, hostPort: port, credentials: emptyCredentials() })
    expect(seeded.policy.hostPort).not.toBe(port)
    await seeded.dispose()

    // Existing host.json keeps the busy port until the caller accepts a change.
    const other = await mkdtemp(join(tmpdir(), 'mma-shell-busy-'))
    await writeFile(join(other, 'host.json'), JSON.stringify({
      runtimeRoot: other,
      hostPort: port,
      theme: 'system',
      palette: 'default',
      locale: 'en',
      chatLanguage: 'en',
      llm: null,
      runtimeProvider: { id: 'echo' },
    }))
    await expect(bootHost({
      runtimeRoot: other,
      credentials: emptyCredentials(),
      portConflict: 'quit',
    })).rejects.toMatchObject({ code: 'port-in-use', busyPort: port })
    const accepted = await bootHost({
      runtimeRoot: other,
      credentials: emptyCredentials(),
      portConflict: 'accept',
    })
    expect(accepted.policy.hostPort).not.toBe(port)
    await accepted.dispose()
    await host.dispose()
    await writeFile(join(root, 'host.json'), '{')
    await expect(bootHost({ runtimeRoot: root, hostPort: port })).rejects.toThrow()
  })

  it('requests a process restart after POST /api/restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-shell-restart-'))
    const port = await freePort()
    let processRestarts = 0
    const host = await bootHost({
      runtimeRoot: root,
      hostPort: port,
      credentials: emptyCredentials(),
      seedStartup: false,
      processRestart: async () => {
        processRestarts += 1
      },
    })
    const origin = `http://127.0.0.1:${port}`
    const token = readFileSync(hostAuthoringToken(root), 'utf8').trim()
    expect((await fetch(`${origin}${httpLayout.hostConfig}`)).ok).toBe(true)
    expect((await fetch(`${origin}${httpLayout.restart}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).ok).toBe(true)
    await new Promise((resolve) => { setTimeout(resolve, 600) })
    expect(processRestarts).toBe(1)
    // Sidecar disposed; wrapper would relaunch outside tests.
    await expect(fetch(`${origin}${httpLayout.hostConfig}`)).rejects.toThrow()
    await host.dispose().catch(() => undefined)
  })
})

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
