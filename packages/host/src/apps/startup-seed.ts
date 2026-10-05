import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { hostAppsDir, hostLayout, hostTrashDir } from '../host/layout.ts'

/** Once per runtime root. Deleting samples must not re-seed on every boot. */
export const startupSeedMarker = '.startup-seed'

/**
 * Skill facades copied into an empty library.
 * `today` = personal home; `board` = second card so glass featured layout has company;
 * `lab` = the model workbench, whose MCP tab names the two servers the MCP section adds.
 */
export const startupSamples = [
  { template: 'today', appId: 'com.mohou.today', fallbackName: '今日待办' },
  { template: 'board', appId: 'com.mohou.board', fallbackName: 'Board' },
  { template: 'lab', appId: 'com.mohou.lab', fallbackName: '模型实验台' },
] as const

export type StartupSeedResult =
  | { readonly kind: 'seeded'; readonly appIds: readonly string[] }
  | { readonly kind: 'skipped'; readonly reason: 'marked' | 'has-apps' | 'no-template' }

/**
 * Ensure `apps/` and `trash/` exist. On a fresh runtime (no marker, no apps),
 * copy skill startup facades so the library shows glass cards immediately.
 * @param runtimeRoot - host runtime root
 * @param skillSource - author skill directory that contains `templates/`
 */
export async function ensureRuntimeAppsLayout(
  runtimeRoot: string,
  skillSource?: string,
): Promise<StartupSeedResult> {
  const appsDir = hostAppsDir(runtimeRoot)
  const trashDir = hostTrashDir(runtimeRoot)
  await mkdir(appsDir, { recursive: true })
  await mkdir(trashDir, { recursive: true })

  const marker = path.join(runtimeRoot, startupSeedMarker)
  if (await present(marker)) return { kind: 'skipped', reason: 'marked' }

  const existing = await listAppDirs(appsDir)
  if (existing.length > 0) {
    await writeFile(marker, `${JSON.stringify({ seeded: false, reason: 'has-apps' }, null, 2)}\n`)
    return { kind: 'skipped', reason: 'has-apps' }
  }

  if (skillSource === undefined || skillSource.length === 0) {
    await writeFile(marker, `${JSON.stringify({ seeded: false, reason: 'no-template' }, null, 2)}\n`)
    return { kind: 'skipped', reason: 'no-template' }
  }

  const appIds: string[] = []
  for (const sample of startupSamples) {
    const templateDir = path.join(skillSource, 'templates', sample.template)
    if (!(await present(path.join(templateDir, 'manifest.json')))) continue
    const dest = path.join(appsDir, sample.appId)
    await cp(templateDir, dest, { recursive: true })
    await rewriteManifestId(path.join(dest, 'manifest.json'), sample.appId, sample.fallbackName)
    appIds.push(sample.appId)
  }

  if (appIds.length === 0) {
    await writeFile(marker, `${JSON.stringify({ seeded: false, reason: 'no-template' }, null, 2)}\n`)
    return { kind: 'skipped', reason: 'no-template' }
  }

  await writeFile(marker, `${JSON.stringify({ seeded: true, appIds, samples: startupSamples }, null, 2)}\n`)
  return { kind: 'seeded', appIds }
}

async function rewriteManifestId(file: string, appId: string, fallbackName: string): Promise<void> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  raw.id = appId
  if (typeof raw.name !== 'string' || raw.name.length === 0) raw.name = fallbackName
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`)
}

async function listAppDirs(appsDir: string): Promise<string[]> {
  const names = await readdir(appsDir).catch(() => [] as string[])
  const out: string[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    if (name === hostLayout.logs) continue
    if (await present(path.join(appsDir, name, 'manifest.json'))) out.push(name)
  }
  return out
}

async function present(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
