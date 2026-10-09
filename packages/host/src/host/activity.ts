import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import type { HeatValue } from './heat.ts'
import { hostActivityPath } from './layout.ts'

/** The activity file is present and not this shape. The file is left as it is. */
export class ActivityError extends Error {
  readonly code: 'activity-invalid' | 'activity-unreadable'

  /**
   * @param code - `activity-invalid` is a bad document; `activity-unreadable` is a present file that cannot be read
   * @param message - human text
   * @param options - optional `cause`
   */
  constructor(code: 'activity-invalid' | 'activity-unreadable', message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ActivityError'
    this.code = code
  }
}

/** One app's usage. Further fields can sit beside the count and the time. */
export interface ActivityApp extends HeatValue {}

/** Usage on this machine. Not source history, and not `host.json`. */
export interface Activity {
  readonly apps: Readonly<Record<string, ActivityApp>>
}

/**
 * Read `activity.json`. A missing file is no activity.
 * A bad document fails and is not an empty map.
 * @param runtimeRoot - host runtime root
 */
export function readActivity(runtimeRoot: string): Activity {
  let text: string
  try {
    text = readFileSync(hostActivityPath(runtimeRoot), 'utf8')
  } catch (error) {
    if (isMissing(error)) return { apps: {} }
    throw new ActivityError('activity-unreadable', 'activity file cannot be read', { cause: error })
  }
  return admitActivity(text)
}

/**
 * Record one open and write the file. The count increases by one.
 * `lastOpenedAt` becomes the later of the stored time and `openedAt`.
 * @param runtimeRoot - host runtime root
 * @param appId - registered app id
 * @param openedAt - time of this open
 */
export function recordOpen(runtimeRoot: string, appId: string, openedAt: string): Activity {
  if (appId === '' || openedAt === '') throw new ActivityError('activity-invalid', 'open is missing a field')
  const current = readActivity(runtimeRoot)
  const previous = current.apps[appId]
  const next: Activity = {
    apps: {
      ...current.apps,
      [appId]: {
        ...previous,
        openCount: (previous?.openCount ?? 0) + 1,
        lastOpenedAt: previous !== undefined && previous.lastOpenedAt > openedAt ? previous.lastOpenedAt : openedAt,
      },
    },
  }
  mkdirSync(runtimeRoot, { recursive: true })
  writeFileSync(hostActivityPath(runtimeRoot), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/**
 * Move one app's usage to a new id. A missing file, or a missing key, is unchanged.
 * @param runtimeRoot - host runtime root
 * @param from - current id
 * @param to - id to use
 */
export function renameActivityApp(runtimeRoot: string, from: string, to: string): void {
  const current = readActivity(runtimeRoot)
  const moved = current.apps[from]
  if (moved === undefined) return
  const { [from]: _gone, ...rest } = current.apps
  void _gone
  const apps = { ...rest }
  const existing = apps[to]
  apps[to] = existing === undefined
    ? moved
    : {
      ...existing,
      ...moved,
      openCount: existing.openCount + moved.openCount,
      lastOpenedAt: existing.lastOpenedAt > moved.lastOpenedAt ? existing.lastOpenedAt : moved.lastOpenedAt,
    }
  writeFileSync(hostActivityPath(runtimeRoot), `${JSON.stringify({ apps }, null, 2)}
`)
}

function admitActivity(text: string): Activity {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new ActivityError('activity-invalid', 'activity file is not the activity document', { cause: error })
  }
  if (!isAppsRecord(value)) throw new ActivityError('activity-invalid', 'activity file is not the activity document')
  const apps: Record<string, ActivityApp> = {}
  for (const [appId, app] of Object.entries(value.apps)) {
    apps[appId] = admitApp(app)
  }
  return { apps }
}

function isAppsRecord(value: unknown): value is { apps: Record<string, unknown> } {
  return typeof value === 'object'
    && value !== null
    && 'apps' in value
    && typeof value.apps === 'object'
    && value.apps !== null
    && !Array.isArray(value.apps)
}

function admitApp(value: unknown): ActivityApp {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ActivityError('activity-invalid', 'activity app is not an object')
  }
  const openCount = 'openCount' in value ? value.openCount : undefined
  const lastOpenedAt = 'lastOpenedAt' in value ? value.lastOpenedAt : undefined
  if (typeof openCount !== 'number' || typeof lastOpenedAt !== 'string' || lastOpenedAt === '') {
    throw new ActivityError('activity-invalid', 'activity is not a count and a time')
  }
  return { ...value, openCount, lastOpenedAt }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
