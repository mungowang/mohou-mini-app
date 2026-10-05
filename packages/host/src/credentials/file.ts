import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CredentialError } from './codes.ts'
import { admitCredentialName, type CredentialProvider } from './provider.ts'

interface CredentialEntry {
  readonly description: string
  readonly secret: string
}

/**
 * One JSON file as one credential store. Read and write reach the same file, so the two sides
 * cannot drift. A missing file is an empty source.
 * A present bad file throws `credential-unreadable` and is not rewritten.
 * @param file - absolute path. The name lives in `homeLayout`.
 */
export function createFileCredentials(file: string): CredentialProvider {
  return {
    writable: true,
    async list() {
      const entries = await readCredentialFile(file)
      return [...entries.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([name, entry]) => ({ name, description: entry.description }))
    },
    async get(name) {
      admitCredentialName(name)
      const entries = await readCredentialFile(file)
      return entries.get(name)?.secret
    },
    put: (name, description, secret) => writeFileCredential(file, name, description, secret),
    remove: name => deleteFileCredential(file, name),
  }
}

/**
 * Write one account into the JSON source. Not a method on the read port.
 * A present bad file is not overwritten.
 * @param file - absolute path
 * @param name - owner-chosen account name
 * @param description - text the author can recognize
 * @param secret - the one value
 */
export async function writeFileCredential(file: string, name: string, description: string, secret: string): Promise<void> {
  admitCredentialName(name)
  const entries = await readCredentialFile(file)
  const next = new Map(entries)
  next.set(name, { description, secret })
  await writeEntries(file, next)
}

/**
 * Remove one account from the JSON source. A missing name leaves the file unchanged.
 * @param file - absolute path
 * @param name - owner-chosen account name
 */
export async function deleteFileCredential(file: string, name: string): Promise<void> {
  admitCredentialName(name)
  const entries = await readCredentialFile(file)
  if (!entries.has(name)) return
  const next = new Map(entries)
  next.delete(name)
  await writeEntries(file, next)
}

async function writeEntries(file: string, entries: ReadonlyMap<string, CredentialEntry>): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const body: Record<string, CredentialEntry> = {}
  for (const [name, entry] of entries) body[name] = entry
  // The file holds secrets in the clear, so it is owner-only. `mode` covers a new file and the
  // chmod tightens one that an earlier version wrote world-readable.
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  await chmod(file, 0o600).catch(() => undefined)
}

async function readCredentialFile(file: string): Promise<ReadonlyMap<string, CredentialEntry>> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return new Map()
    throw new CredentialError('credential-unreadable', 'credential file cannot be read', { cause: error })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new CredentialError('credential-unreadable', 'credential file is not JSON', { cause: error })
  }
  return resolveCredentialFile(raw)
}

function resolveCredentialFile(raw: unknown): ReadonlyMap<string, CredentialEntry> {
  if (!isRecord(raw)) throw new CredentialError('credential-unreadable', 'credential file must be an object')
  const entries = new Map<string, CredentialEntry>()
  for (const [name, value] of Object.entries(raw)) {
    if (name === '') throw new CredentialError('credential-unreadable', 'credential file has an empty name')
    if (!isRecord(value) || typeof value.description !== 'string' || typeof value.secret !== 'string') {
      throw new CredentialError('credential-unreadable', `credential file entry is incomplete: ${name}`)
    }
    entries.set(name, { description: value.description, secret: value.secret })
  }
  return entries
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
