/** @deprecated Import from `../process/spawn-ledger.ts`. */
export {
  appSpawnLedgerFile as websiteSpawnLedgerFile,
  appSpawnLedgerPath as websiteSpawnLedgerPath,
  readAppSpawnLedger as readWebsiteSpawnLedger,
  trackAppSpawn,
  untrackAppSpawn,
  reclaimAppSpawns as reclaimWebsiteSpawns,
  forceKillTree,
} from '../process/spawn-ledger.ts'

import {
  readAppSpawnLedger,
  trackAppSpawn as track,
  untrackAppSpawn as untrack,
} from '../process/spawn-ledger.ts'

/** Legacy helpers used by older website-only callers. */
export async function trackWebsiteSpawn(runtimeRoot: string, pid: number): Promise<void> {
  await track(runtimeRoot, { pid, appId: '', tag: 'website' })
}

export async function untrackWebsiteSpawn(runtimeRoot: string, pid: number): Promise<void> {
  await untrack(runtimeRoot, pid)
}

export async function readWebsiteSpawnLedgerPids(runtimeRoot: string): Promise<readonly number[]> {
  return (await readAppSpawnLedger(runtimeRoot)).entries.map(entry => entry.pid)
}
