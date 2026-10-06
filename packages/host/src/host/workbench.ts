import { builtinWorkbenchId, workbenchEntries, type AppListItem, type AppWorkbench } from '@mohou/contract'

/**
 * Backend desk for one workbench app.
 * A rejected id does not write. `default` clears the stored id.
 */
export function createAppWorkbench(ports: {
  listApps(): Promise<readonly AppListItem[]>
  openApp(appId: string, title?: string): Promise<void>
  readDefault(): string | undefined
  writeDefault(id: string | undefined): Promise<void>
  listTrash(): Promise<readonly AppListItem[]>
  restoreApp(appId: string): Promise<void>
  locale(): string
}): AppWorkbench {
  return {
    listApps: () => ports.listApps(),
    openApp: (appId, title) => title === undefined ? ports.openApp(appId) : ports.openApp(appId, title),
    listTrash: () => ports.listTrash(),
    restoreApp: appId => ports.restoreApp(appId),
    async listWorkbenches() {
      const apps = await ports.listApps()
      return workbenchEntries(apps, ports.readDefault(), builtinName(ports.locale()))
    },
    async setDefaultWorkbench(id: string) {
      if (id === builtinWorkbenchId) {
        await ports.writeDefault(undefined)
        return
      }
      const apps = await ports.listApps()
      const app = apps.find(item => item.id === id)
      if (app === undefined || app.kind !== 'workbench') {
        throw new Error('workbench is not available')
      }
      await ports.writeDefault(id)
    },
  }
}

function builtinName(locale: string): string {
  return locale === 'zh-CN' ? '小程序库' : 'Library'
}
