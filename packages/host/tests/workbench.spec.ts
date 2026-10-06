import { describe, expect, it } from 'vitest'

import type { AppListItem } from '@mohou/contract'

import { createAppWorkbench } from '../src/host/workbench.ts'

const todo: AppListItem = {
  id: 'com.example.todo',
  name: 'Todo',
  description: 'A list',
  version: '1',
  acronym: 'TO',
}
const desk: AppListItem = { ...todo, id: 'com.example.desk', name: 'Desk', kind: 'workbench' }

describe('createAppWorkbench', () => {
  it('lists the builtin library and does not store an unknown id', async () => {
    let stored: string | undefined
    const opened: string[] = []
    const workbench = createAppWorkbench({
      listApps: () => Promise.resolve([todo, desk]),
      openApp: (appId) => {
        opened.push(appId)
        return Promise.resolve()
      },
      readDefault: () => stored,
      writeDefault: (id) => {
        stored = id
        return Promise.resolve()
      },
      listTrash: () => Promise.resolve([{ ...todo, name: 'Todo (old)' }]),
      restoreApp: appId => appId === todo.id ? Promise.resolve() : Promise.reject(new Error('app not trashed')),
      locale: () => 'en',
    })
    expect(await workbench.listWorkbenches()).toEqual([
      { id: 'default', name: 'Library', builtin: true, default: true },
      { id: desk.id, name: 'Desk', builtin: false, default: false },
    ])
    await expect(workbench.setDefaultWorkbench('com.example.missing')).rejects.toThrow(/not available/)
    expect(stored).toBeUndefined()
    await workbench.setDefaultWorkbench(desk.id)
    expect(stored).toBe(desk.id)
    expect((await workbench.listWorkbenches())[1]?.default).toBe(true)
    await workbench.setDefaultWorkbench('default')
    expect(stored).toBeUndefined()
    await workbench.openApp(todo.id, 'Todo')
    expect(opened).toEqual([todo.id])
  })

  it('shows the trash and restores from it, refusing an id that is not there', async () => {
    const workbench = createAppWorkbench({
      listApps: () => Promise.resolve([todo]),
      openApp: () => Promise.resolve(),
      readDefault: () => undefined,
      writeDefault: () => Promise.resolve(),
      listTrash: () => Promise.resolve([{ ...todo, name: 'Todo (old)' }]),
      restoreApp: appId => appId === todo.id ? Promise.resolve() : Promise.reject(new Error('app not trashed')),
      locale: () => 'en',
    })
    expect((await workbench.listTrash()).map(app => app.name)).toEqual(['Todo (old)'])
    await workbench.restoreApp(todo.id)
    await expect(workbench.restoreApp('com.example.other')).rejects.toThrow(/not trashed/)
  })
})
