import {
  createSpawnRegistry as createAppSpawnRegistry,
  SpawnError,
  DEFAULT_SPAWN_READY_MS,
  DEFAULT_SPAWN_READY_INTERVAL_MS,
  DEFAULT_SPAWN_KILL_GRACE_MS,
} from '../process/spawn.ts'

export {
  SpawnError,
  DEFAULT_SPAWN_READY_MS,
  DEFAULT_SPAWN_READY_INTERVAL_MS,
  DEFAULT_SPAWN_KILL_GRACE_MS,
}

/**
 * Compatibility wrapper used by older website tests.
 */
export function createSpawnRegistry(defaults: {
  readonly cwd: string
  readonly runtimeRoot: string
  readonly env?: NodeJS.ProcessEnv
  readonly appId?: string
}) {
  const inner = createAppSpawnRegistry({
    cwd: defaults.cwd,
    runtimeRoot: defaults.runtimeRoot,
    appId: defaults.appId ?? 'unknown',
    ...defaults.env === undefined ? {} : { env: defaults.env },
  })
  return {
    spawn: inner.spawnWebsite,
    dispose: () => inner.disposeAll(),
  }
}
