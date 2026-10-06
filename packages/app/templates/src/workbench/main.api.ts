import { defineApp } from '@mohou/contract'

type FocusItem = { id: string; title: string; detail: string }
type TrashItem = { id: string; name: string }

export default defineApp({
  name: '工作台',
  description: '第一屏是今天要处理的事，应用列表在旁边',
  api: {
    // ⭐ key: the homepage shows what this person wants first.
    //          Replace `focus` from ctx.http, ctx.mcp, or this app's storage.
    //          ctx.workbench lists apps and opens them. It does not choose their layout.
    async home(ctx) {
      const desk = ctx.workbench
      if (desk === undefined) throw new Error('ctx.workbench is absent')
      const focus: FocusItem[] = [
        { id: '1', title: '待处理工单 1842', detail: '客户催发货' },
        { id: '2', title: '行情：示例标的', detail: '开盘 +1.2%' },
        { id: '3', title: '我的 Jira', detail: '2 个单子今天到期' },
      ]
      const apps = await desk.listApps()
      return { focus, apps }
    },
    // ⭐ key: the trash is a workbench's own surface here. The panel keeps it behind a glyph; a
    //         homepage can show it wherever it wants, because it is the same two operations.
    async trash(ctx) {
      const desk = ctx.workbench
      if (desk === undefined) throw new Error('ctx.workbench is absent')
      const items: TrashItem[] = (await desk.listTrash()).map(app => ({ id: app.id, name: app.name }))
      return { items }
    },
    /** Put one back. A live id, or a name the library already uses, is refused with a reason. */
    async restore(ctx, args?: { appId?: string }) {
      const desk = ctx.workbench
      const appId = args?.appId
      if (desk === undefined) throw new Error('ctx.workbench is absent')
      if (appId === undefined || appId.length === 0) throw new Error('缺少 appId')
      // Names are not identity to the host, so a homepage that shows cards decides this itself.
      const live = await desk.listApps()
      const trashed = await desk.listTrash()
      const item = trashed.find(app => app.id === appId)
      if (item === undefined) throw new Error('这条不在回收站里')
      const taken = live.find(app => app.name === item.name)
      if (taken !== undefined) throw new Error(`库里已有同名 app「${taken.name}」，先给它改名再恢复`)
      await desk.restoreApp(appId)
      return { id: appId }
    },
    async open(ctx, args?: { appId?: string; title?: string }) {
      const desk = ctx.workbench
      const appId = args?.appId
      if (desk === undefined) throw new Error('ctx.workbench is absent')
      if (appId === undefined || appId.length === 0) throw new Error('缺少 appId')
      if (args?.title === undefined) await desk.openApp(appId)
      else await desk.openApp(appId, args.title)
    },
  },
})
