import { existsSync, statSync } from 'node:fs'

import type { AppSummary } from '../apps/registry.ts'
import type { HostEvent } from '../events/host-events.ts'
import { listHistory, readAppCommit, type HistoryNode } from '../history/store.ts'
import { storageDatabase } from '../storage/layout.ts'
import { openStorage } from '../storage/open.ts'

/** Owner table export cap. Host policy, not a locked number. */
export const DEFAULT_OWNER_ROW_CAP = 1_000

interface Registry {
  get: (appId: string) => Promise<AppSummary>
}

/**
 * Owner reads. Not authoring tools. Panel HTTP calls these through the loopback routes.
 * @param registry - registered apps
 */
export function createOwnerReads(registry: Registry, maxRows = DEFAULT_OWNER_ROW_CAP) {
  return {
    readStorage: (appId: string) => readStorage(registry, appId),
    readTable: (appId: string, table: string) => readTable(registry, appId, table, maxRows),
    readHistory: (appId: string) => readHistory(registry, appId),
    readCommit: (appId: string, commitId: string) => readCommit(registry, appId, commitId),
  }
}

async function readStorage(registry: Registry, appId: string): Promise<{ bytes: number; tables: string[] }> {
  const app = await registry.get(appId)
  const file = storageDatabase(app.directory)
  if (!existsSync(file)) return { bytes: 0, tables: [] }
  const storage = await openStorage(app.directory)
  try {
    return { bytes: statSync(file).size, tables: storage.listTables() }
  } finally {
    storage.close()
  }
}

async function readTable(registry: Registry, appId: string, table: string, maxRows: number): Promise<{ rows: unknown[] }> {
  const app = await registry.get(appId)
  const file = storageDatabase(app.directory)
  if (!existsSync(file)) return { rows: [] }
  const storage = await openStorage(app.directory)
  try {
    return { rows: storage.exportTable(table, maxRows) }
  } finally {
    storage.close()
  }
}

async function readHistory(registry: Registry, appId: string): Promise<HistoryNode[]> {
  const app = await registry.get(appId)
  const listed = await listHistory(app.directory)
  const nodes = [...listed.nodes]
  const seen = new Set(nodes.map(node => node.id))
  for (const tip of listed.tips) {
    if (seen.has(tip.commitId)) continue
    const commit = await readAppCommit(app.directory, tip.commitId)
    nodes.push({
      id: tip.commitId,
      message: commit.message,
      time: commit.time,
      parentIds: commit.parentIds,
    })
    seen.add(tip.commitId)
  }
  return nodes
}

async function readCommit(registry: Registry, appId: string, commitId: string) {
  const app = await registry.get(appId)
  return readAppCommit(app.directory, commitId)
}

/**
 * Owner view refetch signal. A missing app throws before any event.
 * Backend invalidate is the caller's job (`author.invalidateLive`); this only
 * publishes `app:reload` so the panel frame refetches UI.
 */
export async function reloadView(
  registry: Registry,
  publish: (event: HostEvent) => void,
  appId: string,
): Promise<void> {
  const app = await registry.get(appId)
  publish({ type: 'app:reload', appId: app.id })
}
