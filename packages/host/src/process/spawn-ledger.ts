import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** Durable spawn ledger under the runtime root. Survives a crash so the next boot can reap. */
export const appSpawnLedgerFile = 'app-spawns.json'

/** Website-era ledger name. Boot reclaims it once, then writes only app-spawns.json. */
export const legacyWebsiteSpawnLedgerFile = 'website-spawns.json'

export type SpawnTag = 'app' | 'website'

export interface AppSpawnLedgerEntry {
  readonly pid: number
  readonly appId: string
  readonly tag: SpawnTag
}

export interface AppSpawnLedger {
  readonly entries: readonly AppSpawnLedgerEntry[]
}

export function appSpawnLedgerPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, appSpawnLedgerFile)
}

export async function readAppSpawnLedger(runtimeRoot: string): Promise<AppSpawnLedger> {
  try {
    const raw = JSON.parse(await readFile(appSpawnLedgerPath(runtimeRoot), 'utf8')) as unknown
    return normalizeLedger(raw)
  } catch {
    return { entries: [] }
  }
}

function normalizeLedger(raw: unknown): AppSpawnLedger {
  if (typeof raw !== 'object' || raw === null) return { entries: [] }
  const record = raw as { entries?: unknown; pids?: unknown }
  if (Array.isArray(record.entries)) {
    const entries: AppSpawnLedgerEntry[] = []
    for (const item of record.entries) {
      if (typeof item !== 'object' || item === null) continue
      const row = item as Record<string, unknown>
      if (typeof row.pid !== 'number' || !Number.isInteger(row.pid) || row.pid <= 0) continue
      if (typeof row.appId !== 'string' || row.appId.length === 0) continue
      const tag = row.tag === 'website' ? 'website' : 'app'
      entries.push({ pid: row.pid, appId: row.appId, tag })
    }
    return { entries: dedupe(entries) }
  }
  // Legacy website-spawns.json shape: { pids: number[] }
  if (Array.isArray(record.pids)) {
    const entries = record.pids
      .filter((pid): pid is number => typeof pid === 'number' && Number.isInteger(pid) && pid > 0)
      .map(pid => ({ pid, appId: '', tag: 'website' as const }))
    return { entries: dedupe(entries) }
  }
  return { entries: [] }
}

function dedupe(entries: readonly AppSpawnLedgerEntry[]): readonly AppSpawnLedgerEntry[] {
  const seen = new Set<number>()
  const out: AppSpawnLedgerEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.pid)) continue
    seen.add(entry.pid)
    out.push(entry)
  }
  return out
}

async function writeLedger(runtimeRoot: string, entries: readonly AppSpawnLedgerEntry[]): Promise<void> {
  await mkdir(runtimeRoot, { recursive: true })
  const body: AppSpawnLedger = { entries: dedupe(entries) }
  await writeFile(appSpawnLedgerPath(runtimeRoot), `${JSON.stringify(body, null, 2)}\n`)
}

export async function trackAppSpawn(
  runtimeRoot: string,
  entry: AppSpawnLedgerEntry,
): Promise<void> {
  if (!Number.isInteger(entry.pid) || entry.pid <= 0) return
  const current = await readAppSpawnLedger(runtimeRoot)
  if (current.entries.some(item => item.pid === entry.pid)) return
  await writeLedger(runtimeRoot, [...current.entries, entry])
}

export async function untrackAppSpawn(runtimeRoot: string, pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return
  const current = await readAppSpawnLedger(runtimeRoot)
  if (!current.entries.some(item => item.pid === pid)) return
  await writeLedger(runtimeRoot, current.entries.filter(item => item.pid !== pid))
}

/**
 * Kill every pid still listed from a previous run (and the legacy website file), then clear ledgers.
 */
export async function reclaimAppSpawns(runtimeRoot: string): Promise<{ readonly reaped: readonly number[] }> {
  const current = await readAppSpawnLedger(runtimeRoot)
  const legacyPath = path.join(runtimeRoot, legacyWebsiteSpawnLedgerFile)
  let legacy: AppSpawnLedger = { entries: [] }
  try {
    legacy = normalizeLedger(JSON.parse(await readFile(legacyPath, 'utf8')) as unknown)
  } catch {
    // absent
  }
  const merged = dedupe([...current.entries, ...legacy.entries])
  const reaped: number[] = []
  for (const entry of merged) {
    if (forceKillTree(entry.pid)) reaped.push(entry.pid)
  }
  await writeLedger(runtimeRoot, [])
  try {
    await writeFile(legacyPath, `${JSON.stringify({ pids: [] }, null, 2)}\n`)
  } catch {
    // ignore
  }
  return { reaped }
}

export function forceKillTree(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  // Platform kill trees are not exercised cross-OS in CI; ignore branch noise.
  /* c8 ignore start */
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', detached: true }).unref()
      return true
    } catch {
      return false
    }
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return true
    }
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  /* c8 ignore stop */
  return true
}
