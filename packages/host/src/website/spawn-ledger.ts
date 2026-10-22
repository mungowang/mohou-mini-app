import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** Durable spawn ledger under the runtime root. Survives a crash so the next boot can reap. */
export const websiteSpawnLedgerFile = 'website-spawns.json'

export interface WebsiteSpawnLedger {
  readonly pids: readonly number[]
}

export function websiteSpawnLedgerPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, websiteSpawnLedgerFile)
}

/**
 * Read the ledger. A missing or corrupt file is empty.
 */
export async function readWebsiteSpawnLedger(runtimeRoot: string): Promise<WebsiteSpawnLedger> {
  try {
    const raw = JSON.parse(await readFile(websiteSpawnLedgerPath(runtimeRoot), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { pids?: unknown }).pids)) {
      return { pids: [] }
    }
    const pids = (raw as { pids: unknown[] }).pids
      .filter((pid): pid is number => typeof pid === 'number' && Number.isInteger(pid) && pid > 0)
    return { pids: [...new Set(pids)] }
  } catch {
    return { pids: [] }
  }
}

async function writeLedger(runtimeRoot: string, pids: readonly number[]): Promise<void> {
  await mkdir(runtimeRoot, { recursive: true })
  const body: WebsiteSpawnLedger = { pids: [...new Set(pids.filter(pid => pid > 0))] }
  await writeFile(websiteSpawnLedgerPath(runtimeRoot), `${JSON.stringify(body, null, 2)}\n`)
}

/** Record a live child. Idempotent. */
export async function trackWebsiteSpawn(runtimeRoot: string, pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return
  const current = await readWebsiteSpawnLedger(runtimeRoot)
  if (current.pids.includes(pid)) return
  await writeLedger(runtimeRoot, [...current.pids, pid])
}

/** Drop a child after exit or successful kill. */
export async function untrackWebsiteSpawn(runtimeRoot: string, pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return
  const current = await readWebsiteSpawnLedger(runtimeRoot)
  if (!current.pids.includes(pid)) return
  await writeLedger(runtimeRoot, current.pids.filter(item => item !== pid))
}

/**
 * Kill every pid still listed from a previous run, then clear the ledger.
 * Safe when the process is already gone (ESRCH).
 */
export async function reclaimWebsiteSpawns(runtimeRoot: string): Promise<{ readonly reaped: readonly number[] }> {
  const current = await readWebsiteSpawnLedger(runtimeRoot)
  const reaped: number[] = []
  for (const pid of current.pids) {
    if (forceKillTree(pid)) reaped.push(pid)
  }
  await writeLedger(runtimeRoot, [])
  return { reaped }
}

/** True when a signal was sent or the process is already gone. */
export function forceKillTree(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
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
      // already gone
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
  return true
}
