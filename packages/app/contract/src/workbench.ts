/** Builtin workbench id. `setDefaultWorkbench` of this id shows the panel library. */
export const builtinWorkbenchId = 'default'

/** One app on the owner list. Omitted fields were not present. */
export interface AppListItem {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly acronym: string
  readonly tags?: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly activity?: { readonly openCount: number; readonly lastOpenedAt: string }
  readonly kind?: 'workbench'
}

/** One workbench the slot can show. `default` is the one the slot will use. */
export interface WorkbenchEntry {
  readonly id: string
  readonly name: string
  readonly builtin: boolean
  readonly default: boolean
}

/**
 * Extra ctx on a workbench app. Absent on every other app.
 * The methods do not read another app's files or storage, and they do not change settings.
 */
export interface AppWorkbench {
  listApps(): Promise<readonly AppListItem[]>
  openApp(appId: string, title?: string): Promise<void>
  listWorkbenches(): Promise<readonly WorkbenchEntry[]>
  setDefaultWorkbench(id: string): Promise<void>
  /** Apps the owner deleted, in the same shape `listApps` returns. */
  listTrash(): Promise<readonly AppListItem[]>
  /** Put one back. An id that is live, or not in the trash, rejects. */
  restoreApp(appId: string): Promise<void>
}

/** One list for the builtin library and for `ctx.workbench.listWorkbenches`. */
export function workbenchEntries(
  apps: readonly AppListItem[],
  storedId: string | undefined,
  builtinName: string,
): readonly WorkbenchEntry[] {
  const active = storedId !== undefined
    && storedId !== builtinWorkbenchId
    && apps.some(app => app.id === storedId && app.kind === 'workbench')
    ? storedId
    : builtinWorkbenchId
  return [
    { id: builtinWorkbenchId, name: builtinName, builtin: true, default: active === builtinWorkbenchId },
    ...apps.filter(app => app.kind === 'workbench').map(app => ({
      id: app.id,
      name: app.name,
      builtin: false,
      default: app.id === active,
    })),
  ]
}
