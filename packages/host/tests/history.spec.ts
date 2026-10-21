import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import git from 'isomorphic-git'
import { describe, expect, it } from 'vitest'

import { registerWithFiles } from './author-seed.ts'
import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'

import {
  emptyCredentials,
  HistoryError,
  commitApp,
  storageDir,
  themeLayout,
  createAppRegistry,
  createAuthorTools,
  listHistory,
  readAppCommit,
  resetApp,
  type AuthorCallPorts,
} from '../src/index.ts'

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

describe('history', () => {
  it('commits source, keeps a backup ref, and does not snapshot storage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-history-'))
    await writeFile(join(dir, 'note.txt'), 'one\n')
    await mkdir(storageDir(dir), { recursive: true })
    await writeFile(join(storageDir(dir), 'secret.txt'), 'nope\n')
    await mkdir(join(dir, 'dist'), { recursive: true })
    await writeFile(join(dir, 'dist', 'out.js'), 'nope\n')
    await mkdir(join(dir, '.cache'), { recursive: true })
    await writeFile(join(dir, '.cache', 'tailwind'), 'nope\n')
    await mkdir(join(dir, 'logs'), { recursive: true })
    await writeFile(join(dir, 'logs', 'app.log'), 'nope\n')
    await expect(commitApp(dir, '   ')).rejects.toBeInstanceOf(HistoryError)
    const first = await commitApp(dir, 'add note')
    expect(first.status).toBe('committed')
    expect(await commitApp(dir, 'again')).toEqual({ status: 'clean' })
    const listed = await listHistory(dir)
    expect(listed.head).toBe(first.id)
    expect(listed.nodes).toHaveLength(1)
    expect(listed.tips.some(tip => tip.name === 'refs/heads/main' || tip.name === 'heads/main')).toBe(true)
    const detail = await readAppCommit(dir, first.id ?? '')
    expect(detail.files.map(file => file.path)).toEqual(['note.txt'])
    expect(await git.listFiles({ fs, dir, ref: first.id ?? '' })).not.toContain('dist/out.js')
    expect(await git.listFiles({ fs, dir, ref: first.id ?? '' })).not.toContain('.cache/tailwind')
    expect(detail.files[0]?.add).toBeGreaterThan(0)
    await writeFile(join(dir, 'note.txt'), 'two\n')
    const second = await commitApp(dir, 'edit note')
    const same = await resetApp(dir, second.id ?? '')
    expect(same.changed).toBe(false)
    const moved = await resetApp(dir, first.id ?? '')
    expect(moved.changed).toBe(true)
    expect(moved.backupRef).toContain('refs/mini-app/backup/')
    expect(moved.files).toContain('note.txt')
    const undone = await resetApp(dir, moved.backupRef ?? '')
    expect(undone.head).toBe(second.id)
    await expect(resetApp(dir, 'deadbeef')).rejects.toMatchObject({ code: 'history-unknown-commit' })
    expect((await listHistory(dir, 1)).nodes).toHaveLength(1)
    await rm(join(dir, 'note.txt'))
    const removed = await commitApp(dir, 'remove note')
    expect(removed.status).toBe('committed')
    const removedDetail = await readAppCommit(dir, removed.id ?? '')
    expect(removedDetail.files[0]?.del).toBeGreaterThan(0)
    const restored = await resetApp(dir, first.id ?? '')
    expect(restored.changed).toBe(true)
    await rm(join(dir, 'note.txt'))
    expect((await resetApp(dir, first.id ?? '')).files).toContain('note.txt')
    expect(await listHistory(await mkdtemp(join(tmpdir(), 'mma-empty-')))).toEqual({ head: null, nodes: [], tips: [] })
    const pinDir = await mkdtemp(join(tmpdir(), 'mma-pin-'))
    await writeFile(join(pinDir, 'note.txt'), 'one\n')
    await writeFile(join(pinDir, themeLayout.appPin), '{"pin":"local"}\n')
    await commitApp(pinDir, 'add note')
    await git.add({ fs, dir: pinDir, filepath: themeLayout.appPin })
    await git.commit({
      fs,
      dir: pinDir,
      message: 'pin',
      author: { name: 'mini-app', email: 'history@localhost' },
    })
    await mkdir(join(pinDir, 'dist'), { recursive: true })
    await writeFile(join(pinDir, 'dist', 'out.js'), 'x\n')
    await git.add({ fs, dir: pinDir, filepath: 'dist/out.js' })
    await git.commit({
      fs,
      dir: pinDir,
      message: 'cache',
      author: { name: 'mini-app', email: 'history@localhost' },
    })
    await writeFile(join(pinDir, 'note.txt'), 'two\n')
    const pinned = await commitApp(pinDir, 'edit note')
    expect(pinned.status).toBe('committed')
    expect(await readFile(join(pinDir, themeLayout.appPin), 'utf8')).toContain('local')
    const pinDetail = await readAppCommit(pinDir, pinned.id ?? '')
    expect(pinDetail.files.map(file => file.path)).not.toContain(themeLayout.appPin)
    expect(await git.listFiles({ fs, dir: pinDir, ref: pinned.id ?? '' })).not.toContain('dist/out.js')
    await rm(join(dir, '.git'), { recursive: true })
    await writeFile(join(dir, '.git'), 'not a repo')
    await expect(commitApp(dir, 'broken')).rejects.toMatchObject({ code: 'commit-failed' })
  })

  it('notifies when an authoring reset changes the tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-history-tool-'))
    const seen: string[] = []
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
      onTreeChanged(appId) {
        seen.push(appId)
      },
    })
    await registerWithFiles(author, 'com.example.app', {
      'manifest.json': JSON.stringify({
        id: 'com.example.app',
        name: 'Example',
        description: 'One line',
        version: '1',
        entry: 'ui.tsx',
      }),
      'ui.tsx': 'export {}',
      'main.api.ts': 'export {}\n',
    })
    const committed = await author.invoke('mini_app_history_commit', { appId: 'com.example.app', message: 'init' }) as { id: string }
    expect(seen).toEqual(['com.example.app'])
    await author.invoke('mini_app_write', { appId: 'com.example.app', path: 'note.txt', content: 'a' })
    const reset = await author.invoke('mini_app_history_reset', { appId: 'com.example.app', commitId: committed.id }) as { changed: boolean }
    expect(reset.changed).toBe(true)
    expect(seen.length).toBeGreaterThan(1)
    await expect(author.invoke('mini_app_history_list', { appId: 'com.example.missing' })).rejects.toMatchObject({ code: 'app-not-registered' })
    await expect(author.invoke('mini_app_history_list', { appId: 'com.example.app', limit: 0 })).rejects.toMatchObject({ code: 'tool-args' })
    expect(await author.invoke('mini_app_history_commit', { appId: 'com.example.app', message: 'again' })).toEqual({ status: 'clean' })
    expect(await author.invoke('mini_app_call', { appId: 'com.example.app', method: 'ping' })).toMatchObject({ ok: false })
    await expect(author.invoke('mini_app_call', { appId: 'com.example.app', calls: {} })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_get', { appId: '' })).rejects.toMatchObject({ code: 'tool-args' })
    await author.invoke('mini_app_read', { appId: 'com.example.app', path: 'manifest.json', start: '1', end: 1 })
    await author.invoke('mini_app_edit', {
      appId: 'com.example.app',
      path: 'manifest.json',
      edits: [{ oldText: 'Example', newText: 1 }],
      commit: false,
    })
    await author.dispose()
  })
})
