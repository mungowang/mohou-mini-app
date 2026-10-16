import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { childExited } from '../src/drain.ts'
import { windowBinaryPath } from '../src/window.ts'
import { existsSync } from 'node:fs'

const root = fileURLToPath(new URL('../../..', import.meta.url))

describe('process entry', () => {
  it('serves the panel from dev.ts and leaves no process', async () => {
    const runtime = await mkdtemp(join(tmpdir(), 'mma-entry-'))
    const port = await freePort()
    const before = windowPids()
    const child = spawn(process.execPath, ['--experimental-strip-types', 'packages/shell/src/dev.ts'], {
      cwd: root,
      env: { ...process.env, MINI_APP_RUNTIME: runtime, MINI_APP_HOST_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const origin = await readOrigin(child)
      expect(origin).toBe(`http://127.0.0.1:${port}`)
      const response = await fetch(origin)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('<title>Mohou</title>')
      const finished = childExited(child)
      child.kill('SIGTERM')
      const code = await finished
      expect(code, `signal=${child.signalCode ?? 'none'}`).not.toBeNull()
      await expect(fetch(origin, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
      expect(existsSync(join(runtime, 'panel-window.pid'))).toBe(false)
      expect(windowPids()).toEqual(before)
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      await rm(runtime, { recursive: true, force: true })
    }
  }, 60_000)

  it('exits a relaunch that has no panel window to adopt', async () => {
    const runtime = await mkdtemp(join(tmpdir(), 'mma-entry-skip-'))
    const port = await freePort()
    const child = spawn(process.execPath, ['--experimental-strip-types', 'packages/shell/src/dev.ts'], {
      cwd: root,
      env: {
        ...process.env,
        MINI_APP_RUNTIME: runtime,
        MINI_APP_HOST_PORT: String(port),
        MINI_APP_SKIP_WINDOW: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const code = await childExited(child)
      expect(code).toBe(0)
      await expect(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      await rm(runtime, { recursive: true, force: true })
    }
  }, 60_000)

  it('stays up when the window supervisor owns the window', async () => {
    const runtime = await mkdtemp(join(tmpdir(), 'mma-entry-supervised-'))
    const port = await freePort()
    const child = spawn(process.execPath, ['--experimental-strip-types', 'packages/shell/src/dev.ts'], {
      cwd: root,
      env: {
        ...process.env,
        MINI_APP_RUNTIME: runtime,
        MINI_APP_HOST_PORT: String(port),
        MINI_APP_SUPERVISED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const origin = await readOrigin(child)
      expect((await fetch(origin)).status).toBe(200)
      expect(child.exitCode).toBeNull()
      const finished = childExited(child)
      child.kill('SIGTERM')
      const code = await finished
      expect(code, `signal=${child.signalCode ?? 'none'}`).not.toBeNull()
      await expect(fetch(origin, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      await rm(runtime, { recursive: true, force: true })
    }
  }, 60_000)

  it('starts the panel window binary and stops it', async () => {
    const binary = windowBinaryPath()
    expect(existsSync(binary), 'pnpm build:window').toBe(true)
    const port = await freePort()
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<title>mini-app</title>')
    })
    await new Promise<void>((resolve) => { server.listen(port, '127.0.0.1', resolve) })
    const child = spawn(binary, [`http://127.0.0.1:${port}`], { stdio: 'ignore' })
    try {
      await new Promise((resolve) => { setTimeout(resolve, 1500) })
      expect(child.exitCode).toBeNull()
      const finished = childExited(child)
      child.kill('SIGTERM')
      await finished
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      await new Promise((resolve) => { server.close(resolve) })
    }
  }, 30_000)
})

function readOrigin(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => reject(new Error(`entry did not print an origin\n${text}`)), 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      text += chunk.toString()
      const line = text.split('\n').find(item => item.startsWith('http://127.0.0.1:'))
      if (line !== undefined) {
        clearTimeout(timer)
        resolve(line.trim())
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => { text += chunk.toString() })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`entry exited ${code} before printing an origin\n${text}`))
    })
  })
}

function windowPids(): string[] {
  try {
    return execFileSync('pgrep', ['-x', 'mini-app-window'], { encoding: 'utf8' }).split('\n').filter(line => line !== '').sort()
  } catch {
    return []
  }
}

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
