/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { MarketList, MarketPack, MarketRow } from '../src/gallery/client.ts'
import { MarketView } from '../src/market/view.tsx'

const appRow: MarketRow = {
  id: 'com.example.desk',
  name: 'Desk',
  description: 'Today notes',
  package: '@mohou-apps/com.example.desk',
  version: '1.1.0',
  kind: 'app',
  source: 'npm',
  tags: ['notes'],
  official: true,
}

const workbench: MarketRow = {
  ...appRow,
  id: 'com.example.board',
  name: 'Board',
  description: 'Workbench board',
  appKind: 'workbench',
  tags: ['ops'],
}

const themeRow: MarketRow = {
  id: 'forest',
  name: 'Forest',
  description: 'Green',
  package: '@mohou-apps/themes',
  version: '1.0.0',
  kind: 'theme',
  source: 'local',
  colors: ['#060', '#fff', '#0a0', '#000'],
  official: true,
  preview: {
    light: {
      background: '#fff',
      foreground: '#111',
      primary: '#060',
      card: '#fafafa',
      border: '#ddd',
      'muted-foreground': '#666',
      secondary: '#eee',
      'primary-foreground': '#fff',
    },
    dark: {
      background: '#000',
      foreground: '#eee',
      primary: '#0a0',
      card: '#111',
      border: '#333',
      'muted-foreground': '#aaa',
      secondary: '#222',
      'primary-foreground': '#000',
    },
  },
}

const spring: MarketPack = { id: 'spring', name: 'Spring', nameZh: '春' }

function mount(
  rows: readonly MarketRow[],
  install?: (id: string, confirm: boolean) => Promise<void>,
  packs: readonly MarketPack[] = [],
) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const installed: string[] = []
  act(() => {
    root.render(
      <MarketView
        locale="zh-CN"
        mode="production"
        list={async (): Promise<MarketList> => ({ rows, packs })}
        {...install === undefined ? {} : { install }}
        onInstalled={() => { installed.push('ok') }}
      />,
    )
  })
  return { host, root, installed }
}

function clickText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  act(() => { button?.click() })
  return button
}

describe('market view', () => {
  it('filters apps and confirms before an untracked install', async () => {
    const calls: { id: string; confirm: boolean }[] = []
    const { host, installed } = mount(
      [{ ...appRow, tracked: false }, themeRow],
      async (id, confirm) => { calls.push({ id, confirm }) },
    )
    await act(async () => { await Promise.resolve() })
    expect(host.querySelector('[data-market-card="com.example.desk"]')).not.toBeNull()
    clickText(host, '主题')
    expect(host.querySelector('[data-market-card="forest"]')).not.toBeNull()
    clickText(host, '应用')
    const card = host.querySelector('[data-market-card="com.example.desk"]') as HTMLElement
    const replace = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('覆盖安装'))
    act(() => { replace?.click() })
    const confirm = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('确认'))
    expect(confirm).toBeDefined()
    await act(async () => { confirm?.click(); await Promise.resolve() })
    expect(calls).toEqual([{ id: 'com.example.desk', confirm: true }])
    expect(installed).toEqual(['ok'])
  })

  it('filters workbench and installs a clean app without confirm', async () => {
    const calls: { id: string; confirm: boolean }[] = []
    const { host } = mount([appRow, workbench, themeRow], async (id, confirm) => {
      calls.push({ id, confirm })
    })
    await act(async () => { await Promise.resolve() })
    clickText(host, '工作台')
    expect(host.querySelector('[data-market-card="com.example.board"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="com.example.desk"]')).toBeNull()
    const card = host.querySelector('[data-market-card="com.example.board"]')
    const install = [...(card?.querySelectorAll('button') ?? [])].find(item => item.textContent?.includes('安装'))
    await act(async () => { install?.click(); await Promise.resolve() })
    expect(calls[0]).toEqual({ id: 'com.example.board', confirm: false })
    clickText(host, '小程序')
    expect(host.querySelector('[data-market-card="com.example.desk"]')).not.toBeNull()
    clickText(host, '主题')
    expect(host.querySelector('[data-market-card="forest"]')).not.toBeNull()
    // No bundle declared: the ungrouped bucket is the only group, and it holds the row.
    clickText(host, '未分类')
    expect(host.querySelector('[data-market-card="forest"]')).not.toBeNull()
  })

  it('filters themes by pack and keeps ungrouped beside the bundles', async () => {
    const { host } = mount(
      [
        themeRow,
        { ...themeRow, id: 'plum', name: 'Plum', themePackId: 'spring' },
        { ...themeRow, id: 'reed', name: 'Reed', themePackId: 'autumn' },
      ],
      undefined,
      [spring, { id: 'autumn', name: 'Autumn', nameZh: '秋天' }],
    )
    await act(async () => { await Promise.resolve() })
    clickText(host, '主题')
    expect(host.textContent).toContain('灵感')
    clickText(host, '春')
    expect(host.querySelector('[data-market-card="plum"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="forest"]')).toBeNull()
    expect(host.querySelector('[data-market-card="reed"]')).toBeNull()
    clickText(host, '秋天')
    expect(host.querySelector('[data-market-card="reed"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="plum"]')).toBeNull()
    clickText(host, '未分类')
    expect(host.querySelector('[data-market-card="forest"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="plum"]')).toBeNull()
  })

  it('disables install when the product is too old', async () => {
    const { host } = mount([{ ...appRow, installable: false, requires: '99.0.0' }])
    await act(async () => { await Promise.resolve() })
    const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes('需要更新'))
    expect(button).toBeDefined()
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows installed for an equal version', async () => {
    const { host } = mount([{ ...appRow, installedVersion: appRow.version, tracked: true }])
    await act(async () => { await Promise.resolve() })
    expect([...host.querySelectorAll('button')].some(item => item.textContent?.includes('已安装'))).toBe(true)
  })

  it('shows a fetch error and update with confirm for modified rows', async () => {
    const broken = document.createElement('div')
    document.body.append(broken)
    const root = createRoot(broken)
    act(() => {
      root.render(
        <MarketView
          locale="en"
          mode="production"
          list={async () => { throw new Error('catalog down') }}
          onInstalled={() => undefined}
        />,
      )
    })
    await act(async () => { await Promise.resolve() })
    expect(broken.textContent).toContain('catalog down')

    const calls: { id: string; confirm: boolean }[] = []
    const { host } = mount(
      [{ ...appRow, installedVersion: '1.0.0', tracked: true, modified: true, downloads: 3 }],
      async (id, confirm) => { calls.push({ id, confirm }) },
    )
    await act(async () => { await Promise.resolve() })
    const card = host.querySelector('[data-market-card="com.example.desk"]') as HTMLElement
    const update = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('更新'))
    act(() => { update?.click() })
    const confirm = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('确认'))
    await act(async () => { confirm?.click(); await Promise.resolve() })
    expect(calls).toEqual([{ id: appRow.id, confirm: true }])
  })

  it('filters by install status', async () => {
    const { host } = mount([
      { ...appRow, tracked: true, installedVersion: appRow.version },
      { ...appRow, id: 'com.example.old', name: 'Old', tracked: true, installedVersion: '1.0.0' },
      { ...appRow, id: 'com.example.new', name: 'New' },
    ])
    await act(async () => { await Promise.resolve() })
    clickText(host, '已安装')
    expect(host.querySelector('[data-market-card="com.example.desk"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="com.example.old"]')).toBeNull()
    expect(host.querySelector('[data-market-card="com.example.new"]')).toBeNull()
    clickText(host, '有更新')
    expect(host.querySelector('[data-market-card="com.example.old"]')).not.toBeNull()
    clickText(host, '未安装')
    expect(host.querySelector('[data-market-card="com.example.new"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="com.example.desk"]')).toBeNull()
  })

  it('renders themes only when the catalog has no apps', async () => {
    const { host } = mount([themeRow])
    await act(async () => { await Promise.resolve() })
    expect(host.querySelector('[data-market-card="forest"]')).not.toBeNull()
    expect(host.querySelector('[data-market-filter="primary"]')).toBeNull()
  })

  it('searches by name and cancels a pending confirm', async () => {
    const calls: { id: string; confirm: boolean }[] = []
    const { host } = mount(
      [{ ...appRow, tracked: false }, { ...appRow, id: 'com.example.other', name: 'Other', tracked: false }],
      async (id, confirm) => { calls.push({ id, confirm }) },
    )
    await act(async () => { await Promise.resolve() })
    const search = host.querySelector('[data-market-search]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(search, 'Other')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.querySelector('[data-market-card="com.example.other"]')).not.toBeNull()
    expect(host.querySelector('[data-market-card="com.example.desk"]')).toBeNull()
    clickText(host, '安装')
    clickText(host, '取消')
    expect(calls).toEqual([])
    const unavailable = document.createElement('div')
    document.body.append(unavailable)
    const root = createRoot(unavailable)
    act(() => {
      root.render(
        <MarketView locale="en" mode="production" onInstalled={() => undefined} />,
      )
    })
    await act(async () => { await Promise.resolve() })
    expect(unavailable.textContent).toContain('Market is not available')
  })
})

describe('market refresh', () => {
  it('tells chrome when a catalog read settles', async () => {
    let settled = 0
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let tick = 0
    const render = () => act(() => {
      root.render(
        <MarketView
          locale="en"
          mode="production"
          refreshTick={tick}
          list={async () => ({ rows: [appRow], packs: [] })}
          onCatalogSettled={() => { settled += 1 }}
          onInstalled={() => undefined}
        />,
      )
    })
    render()
    await act(async () => { await Promise.resolve() })
    expect(settled).toBe(1)
    tick = 1
    render()
    await act(async () => { await Promise.resolve() })
    expect(settled).toBe(2)
    await act(async () => { root.unmount() })
    host.remove()
  })

  it('reads the catalog again when chrome bumps the tick and after an install', async () => {
    const untracked = { ...appRow, tracked: false }
    const installed = { ...appRow, tracked: true, installedVersion: appRow.version }
    let calls = 0
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let tick = 0
    const render = () => act(() => {
      root.render(
        <MarketView
          locale="en"
          mode="production"
          refreshTick={tick}
          list={async () => {
            calls += 1
            // The third read is the one after the install lands.
            return { rows: calls < 3 ? [untracked] : [installed], packs: [] }
          }}
          install={async () => undefined}
          onInstalled={() => undefined}
        />,
      )
    })
    render()
    await act(async () => { await Promise.resolve() })
    expect(calls).toBe(1)
    tick = 1
    render()
    await act(async () => { await Promise.resolve() })
    expect(calls).toBe(2)
    // A finished install reads the catalog again instead of trusting the row in memory.
    const card = host.querySelector('[data-market-card="com.example.desk"]') as HTMLElement
    const ask = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('Replace'))
    await act(async () => { ask?.click() })
    const confirm = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('Confirm'))
    await act(async () => { confirm?.click() })
    await act(async () => {
      for (let round = 0; round < 8; round += 1) await Promise.resolve()
    })
    expect(calls).toBe(3)
    expect([...host.querySelectorAll('button')].some(item => item.textContent?.includes('Installed'))).toBe(true)
  })

  it('clears the post-install Installed mark when a later catalog read offers an update', async () => {
    // Install pins `done` on the card. A chrome refresh must drop that pin so a newer catalog can show Update.
    let phase: 'before' | 'installed' | 'update' = 'before'
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let tick = 0
    const render = () => act(() => {
      root.render(
        <MarketView
          locale="en"
          mode="production"
          refreshTick={tick}
          list={async () => {
            if (phase === 'before') return { rows: [{ ...appRow, tracked: false }], packs: [] }
            if (phase === 'installed') return { rows: [{ ...appRow, tracked: true, installedVersion: appRow.version }], packs: [] }
            return { rows: [{ ...appRow, version: '2.0.0', tracked: true, installedVersion: appRow.version }], packs: [] }
          }}
          install={async () => { phase = 'installed' }}
          onInstalled={() => undefined}
        />,
      )
    })
    render()
    await act(async () => { await Promise.resolve() })
    const card = host.querySelector('[data-market-card="com.example.desk"]') as HTMLElement
    const ask = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('Replace'))
    await act(async () => { ask?.click() })
    const confirm = [...card.querySelectorAll('button')].find(item => item.textContent?.includes('Confirm'))
    await act(async () => { confirm?.click() })
    await act(async () => {
      for (let round = 0; round < 8; round += 1) await Promise.resolve()
    })
    expect([...host.querySelectorAll('button')].some(item => item.textContent?.includes('Installed'))).toBe(true)
    phase = 'update'
    tick = 1
    render()
    await act(async () => {
      for (let round = 0; round < 8; round += 1) await Promise.resolve()
    })
    expect([...host.querySelectorAll('button')].some(item => item.textContent?.includes('Update'))).toBe(true)
    expect([...host.querySelectorAll('button')].some(item => item.textContent === 'Installed')).toBe(false)
    await act(async () => { root.unmount() })
    host.remove()
  })
})
