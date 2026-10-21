import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ContractError, appEntries, parseAppId, resolveManifest, type AppId, type AppListItem } from '@mohou/contract'

import { resolveAppPath } from '../files/tools.ts'
import { commitApp } from '../history/store.ts'
import { renameActivityApp } from '../host/activity.ts'
import { renameDefaultWorkbench } from '../host/config.ts'
import { hostAppsDir, hostLayout, hostTrashDir } from '../host/layout.ts'
import { monogram } from './monogram.ts'

/** Registry failures that are not definition failures. */
export class RegistryError extends Error {
  readonly code: 'app-duplicate' | 'app-not-registered' | 'app-not-trashed'

  /**
   * @param code - `app-duplicate`, `app-not-registered`, or `app-not-trashed`
   * @param message - human text; not the match key
   */
  constructor(code: 'app-duplicate' | 'app-not-registered' | 'app-not-trashed', message: string) {
    super(message)
    this.name = 'RegistryError'
    this.code = code
  }
}

export interface AppSummary {
  id: AppId
  name: string
  description: string
  version: string
  /** Gallery badge. Author acronym, or a monogram derived from `name`. */
  acronym: string
  /** Manifest tags. Omitted when the author set none. */
  tags?: readonly string[]
  /** Manifest kind. Omitted for an ordinary app. */
  kind?: 'workbench' | 'website'
  /** Default site url when kind is website. */
  url?: string
  directory: string
}

/** Owner list row. Directory stays off this object. Times are omitted when history has no commit. */
export function listedApp(
  app: AppSummary,
  times: { readonly createdAt?: string; readonly updatedAt?: string } = {},
  activity?: { readonly openCount: number; readonly lastOpenedAt: string },
): ListedApp {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    version: app.version,
    acronym: app.acronym,
    ...app.tags === undefined ? {} : { tags: app.tags },
    ...app.kind === undefined ? {} : { kind: app.kind },
    ...times.createdAt === undefined ? {} : { createdAt: times.createdAt },
    ...times.updatedAt === undefined ? {} : { updatedAt: times.updatedAt },
    ...activity === undefined ? {} : { activity },
  }
}

export type ListedApp = AppListItem

/**
 * Apps on disk under `runtimeRoot/apps`. Register does not overwrite.
 * @param runtimeRoot - host runtime root; not a locked path
 */
export function createAppRegistry(runtimeRoot: string) {
  const appsDir = hostAppsDir(runtimeRoot)
  return {
    runtimeRoot,
    list: () => listApps(appsDir, runtimeRoot),
    get: (appId: string) => getApp(appsDir, appId),
    register: (appId: string, files: Record<string, string>) => registerApp(appsDir, appId, files),
    trash: (appId: string) => trashApp(appsDir, runtimeRoot, appId),
    restoreTrashed: (appId: string) => restoreTrashed(appsDir, runtimeRoot, appId),
    listTrash: () => listTrash(runtimeRoot),
    rename: (appId: string, newAppId: string) => renameApp(appsDir, runtimeRoot, appId, newAppId),
  }
}

async function listApps(appsDir: string, runtimeRoot: string): Promise<{ apps: AppSummary[]; runtimeRoot: string }> {
  let names: string[] = []
  try {
    names = await readdir(appsDir)
  } catch {
    return { apps: [], runtimeRoot }
  }
  const apps: AppSummary[] = []
  for (const name of names) {
    const summary = await readSummary(path.join(appsDir, name), name)
    if (summary !== undefined) apps.push(summary)
  }
  return { apps, runtimeRoot }
}

async function getApp(appsDir: string, appId: string): Promise<AppSummary> {
  const id = admitId(appId)
  const summary = await readSummary(path.join(appsDir, id), id)
  if (summary === undefined) throw new RegistryError('app-not-registered', `app is not registered: ${appId}`)
  return summary
}

async function registerApp(appsDir: string, appId: string, files: Record<string, string>): Promise<AppSummary> {
  const id = admitId(appId)
  const finalDir = path.join(appsDir, id)
  if (await exists(finalDir)) throw new RegistryError('app-duplicate', `app already exists: ${id}`)
  const staging = path.join(appsDir, `.registering-${id}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    for (const [relative, content] of Object.entries(files)) {
      const full = resolveAppPath(staging, relative)
      await mkdir(path.dirname(full), { recursive: true })
      await writeFile(full, content)
    }
    const manifest = await readManifest(staging, id)
    await rename(staging, finalDir)
    return summaryOf(manifest, finalDir)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

/**
 * Move one live app to a new id. The directory name and `manifest.json` stay the same id.
 * Trash copies of the old id follow, so a later restore does not recreate the old id.
 * @param appsDir - live apps directory
 * @param runtimeRoot - host runtime root
 * @param appId - current id
 * @param newAppId - id to use
 */
async function renameApp(appsDir: string, runtimeRoot: string, appId: string, newAppId: string): Promise<AppSummary> {
  const from = admitId(appId)
  const to = admitId(newAppId)
  if (from === to) throw new ContractError('app-id-invalid', `app id is unchanged: ${from}`)
  const source = path.join(appsDir, from)
  if (!(await exists(source))) throw new RegistryError('app-not-registered', `app is not registered: ${from}`)
  const target = path.join(appsDir, to)
  if (await exists(target)) throw new RegistryError('app-duplicate', `app already exists: ${to}`)
  const manifestPath = path.join(source, appEntries.manifest)
  const original = await readFile(manifestPath, 'utf8')
  await rename(source, target)
  try {
    await writeManifestId(path.join(target, appEntries.manifest), original, to)
    renameActivityApp(runtimeRoot, from, to)
    await renameDefaultWorkbench(runtimeRoot, from, to)
    await renameTrashCopies(runtimeRoot, from, to)
  } catch (error) {
    await writeFile(path.join(target, appEntries.manifest), original).catch(() => undefined)
    await rename(target, source).catch(() => undefined)
    throw error
  }
  const summary = await readSummary(target, to)
  if (summary === undefined) throw new RegistryError('app-not-registered', `app is not registered: ${to}`)
  return summary
}

async function writeManifestId(file: string, original: string, id: string): Promise<void> {
  const parsed: unknown = JSON.parse(original)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ContractError('manifest-invalid', 'manifest must be an object')
  }
  const next = { ...parsed, id }
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
}

async function renameTrashCopies(runtimeRoot: string, from: string, to: string): Promise<void> {
  const trash = hostTrashDir(runtimeRoot)
  let names: string[] = []
  try {
    names = await readdir(trash)
  } catch {
    return
  }
  const prefix = `${from}${hostLayout.trashSep}`
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    const destName = `${to}${name.slice(from.length)}`
    const dest = path.join(trash, destName)
    if (await exists(dest)) throw new RegistryError('app-duplicate', `trash already has ${to}`)
    const source = path.join(trash, name)
    await rename(source, dest)
    const manifest = path.join(dest, appEntries.manifest)
    const text = await readFile(manifest, 'utf8').catch(() => undefined)
    if (text !== undefined) await writeManifestId(manifest, text, to)
    await commitApp(dest, `Rename ${from} to ${to}`)
  }
}

async function trashApp(appsDir: string, runtimeRoot: string, appId: string): Promise<void> {
  const id = admitId(appId)
  const from = path.join(appsDir, id)
  if (!(await exists(from))) throw new RegistryError('app-not-registered', `app is not registered: ${id}`)
  const trash = hostTrashDir(runtimeRoot)
  await mkdir(trash, { recursive: true })
  const stamp = `${String(Date.now()).padStart(16, '0')}-${randomBytes(2).toString('hex')}`
  await rename(from, path.join(trash, `${id}${hostLayout.trashSep}${stamp}`))
}

async function restoreTrashed(appsDir: string, runtimeRoot: string, appId: string): Promise<AppSummary> {
  const id = admitId(appId)
  const live = path.join(appsDir, id)
  if (await exists(live)) throw new RegistryError('app-duplicate', `app already exists: ${id}`)
  const latest = await newestTrash(runtimeRoot, id)
  if (latest === undefined) throw new RegistryError('app-not-trashed', `app is not in trash: ${id}`)
  await rename(latest, live)
  const summary = await readSummary(live, id)
  if (summary === undefined) throw new RegistryError('app-not-trashed', `app is not in trash: ${id}`)
  return summary
}

async function listTrash(runtimeRoot: string): Promise<AppSummary[]> {
  const trash = hostTrashDir(runtimeRoot)
  let names: string[] = []
  try {
    names = await readdir(trash)
  } catch {
    return []
  }
  const newest = new Map<string, string>()
  for (const name of names) {
    const split = splitTrashName(name)
    if (split === undefined) continue
    const current = newest.get(split.id)
    if (current === undefined || split.stamp > current) newest.set(split.id, split.stamp)
  }
  const apps: AppSummary[] = []
  for (const [id, stamp] of newest) {
    const summary = await readSummary(path.join(trash, `${id}${hostLayout.trashSep}${stamp}`), id).catch(() => undefined)
    if (summary !== undefined) apps.push(summary)
  }
  return apps.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

function splitTrashName(name: string): { id: string; stamp: string } | undefined {
  const at = name.indexOf(hostLayout.trashSep)
  if (at <= 0) return undefined
  const id = name.slice(0, at)
  const stamp = name.slice(at + hostLayout.trashSep.length)
  if (stamp === '') return undefined
  try {
    parseAppId(id)
  } catch {
    return undefined
  }
  return { id, stamp }
}

async function newestTrash(runtimeRoot: string, id: string): Promise<string | undefined> {
  const trash = hostTrashDir(runtimeRoot)
  let names: string[] = []
  try {
    names = await readdir(trash)
  } catch {
    return undefined
  }
  const prefix = `${id}${hostLayout.trashSep}`
  const matches = names.filter(name => name.startsWith(prefix)).sort()
  const latest = matches.at(-1)
  return latest === undefined ? undefined : path.join(trash, latest)
}

function admitId(appId: string): AppId {
  try {
    return parseAppId(appId)
  } catch (error) {
    throw new ContractError('app-id-invalid', `app id is not reverse-DNS: ${appId}`, { cause: error })
  }
}

async function readSummary(directory: string, directoryName: string): Promise<AppSummary | undefined> {
  const manifest = await readManifest(directory, directoryName).catch(() => undefined)
  if (manifest === undefined) return undefined
  return summaryOf(manifest, directory)
}

async function readManifest(directory: string, directoryName: string) {
  const text = await readFile(path.join(directory, appEntries.manifest), 'utf8')
  return resolveManifest(JSON.parse(text) as unknown, directoryName)
}

function summaryOf(
  manifest: {
    id: AppId
    name: string
    description: string
    version: string
    acronym?: string
    tags?: readonly string[]
    kind?: 'workbench' | 'website'
    url?: string
  },
  directory: string,
): AppSummary {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    acronym: monogram(manifest.name, manifest.acronym),
    directory,
    ...manifest.tags === undefined ? {} : { tags: manifest.tags },
    ...manifest.kind === undefined ? {} : { kind: manifest.kind },
    ...manifest.url === undefined ? {} : { url: manifest.url },
  }
}

async function exists(directory: string): Promise<boolean> {
  try {
    await readdir(directory)
    return true
  } catch {
    return false
  }
}
