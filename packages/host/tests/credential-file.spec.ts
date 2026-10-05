import { mkdtemp, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createFileCredentials, deleteFileCredential, writeFileCredential } from '../src/credentials/file.ts'
import { emptyCredentials } from '../src/credentials/provider.ts'

describe('credential file source', () => {
  it('writes and removes one account without a second API', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-cred-file-'))
    const file = join(dir, 'credentials.json')
    await writeFileCredential(file, 'github', '个人 GitHub', 'ghp_test')
    const source = createFileCredentials(file)
    expect(await source.list()).toEqual([{ name: 'github', description: '个人 GitHub' }])
    expect(await source.get('github')).toBe('ghp_test')
    await deleteFileCredential(file, 'missing')
    await deleteFileCredential(file, 'github')
    expect(await source.get('github')).toBeUndefined()
    await expect(writeFileCredential(file, '', 'x', 'y')).rejects.toMatchObject({ code: 'credential-invalid' })
    await writeFile(file, '{')
    await expect(writeFileCredential(file, 'github', 'x', 'y')).rejects.toMatchObject({ code: 'credential-unreadable' })
  })

  it('keeps the file owner-only, and tightens one an earlier version left readable', async () => {
    if (process.platform === 'win32') return
    const dir = await mkdtemp(join(tmpdir(), 'mma-cred-mode-'))
    const file = join(dir, 'credentials.json')
    await writeFile(file, '{}\n', { mode: 0o644 })
    await writeFileCredential(file, 'github', 'GitHub', 'ghp_test')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})

describe('one provider covers both sides', () => {
  it('writes, reads, and removes through the same store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-cred-one-'))
    const file = join(dir, 'credentials.json')
    const store = createFileCredentials(file)
    expect(store.writable).toBe(true)
    await store.put('github', 'GitHub', 'ghp_test')
    expect(await store.list()).toEqual([{ name: 'github', description: 'GitHub' }])
    expect(await store.get('github')).toBe('ghp_test')
    await store.remove('github')
    expect(await store.list()).toEqual([])
    await expect(store.put('', 'x', 'y')).rejects.toMatchObject({ code: 'credential-invalid' })
  })

  it('says why a store with no source cannot write', async () => {
    const none = emptyCredentials()
    expect(none.writable).toBe(false)
    await expect(none.put('github', 'GitHub', 'x')).rejects.toMatchObject({ code: 'credential-write-unavailable' })
    await expect(none.remove('github')).rejects.toMatchObject({ code: 'credential-write-unavailable' })
    expect(await none.list()).toEqual([])
    expect(await none.get('github')).toBeUndefined()
  })
})
