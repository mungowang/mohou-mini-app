/** @vitest-environment jsdom */
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { PanelSettings } from '../src/settings/view.tsx'

const policy: PanelPolicy = {
  theme: 'light',
  palette: 'default',
  locale: 'en',
  chatLanguage: 'en',
  hostPort: 9743,
  llm: null,
  runtimeProvider: { id: 'echo' },
}

function client(extra: Partial<PanelSettingsClient> = {}): PanelSettingsClient {
  return {
    readPolicy: () => Promise.resolve(policy),
    writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
    probe: () => Promise.resolve({ healthy: true }),
    ...extra,
  }
}

async function mount(node: ReactNode): Promise<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(node)
  })
  await act(async () => {
    await Promise.resolve()
  })
  return { host, root }
}

function button(host: ParentNode, text: string): HTMLElement | undefined {
  return [...host.querySelectorAll<HTMLElement>('button, [role="button"]')].find(item => item.textContent === text || item.textContent?.includes(text))
}

describe('PanelSettings gaps', () => {
  it('edits appearance and asks before discarding a dirty form', async () => {
    const closed: string[] = []
    const { host, root } = await mount(
      <PanelSettings
        client={client()}
        locale="en"
        mode="production"
        palettes={[{ id: 'slate', name: 'Slate', swatch: '#000', style: '' }]}
        onClose={() => closed.push('closed')}
      />,
    )
    expect(host.textContent).not.toContain('Card style')
    // Live locale preview switches chrome copy; assert with the active language after each step.
    await act(async () => {
      button(host, 'System')?.click()
    })
    expect(button(host, 'System')?.getAttribute('data-on')).toBe('1')
    await act(async () => {
      button(host, 'Chinese')?.click()
    })
    expect(button(host, '中文')?.getAttribute('data-on')).toBe('1')
    await act(async () => {
      button(host, '跟随系统')?.click()
      button(host, 'Slate')?.click()
    })
    expect(button(host, '跟随系统')?.getAttribute('data-on')).toBe('1')
    expect(button(host, '中文')?.getAttribute('data-on')).toBe('1')
    expect(button(host, 'Slate')?.getAttribute('data-on')).toBe('1')
    await act(async () => {
      button(host, '取消修改')?.click()
    })
    expect(host.textContent).toContain('放弃未保存的修改？')
    await act(async () => {
      button(host, '确认')?.click()
    })
    expect(button(host, 'Chinese')?.getAttribute('data-on')).toBe('0')
    await act(async () => {
      button(host, 'Chinese')?.click()
    })
    await act(async () => {
      button(host, '关闭设置')?.click()
    })
    expect(host.textContent).toContain('放弃未保存的修改？')
    await act(async () => {
      button(host, '确认')?.click()
    })
    expect(closed).toEqual(['closed'])
    root.unmount()
    host.remove()
  })

  it('shows an empty runtime, keeps the saved provider after a failed refresh, and probes', async () => {
    const missing = await mount(
      <PanelSettings
        client={client({
          readPolicy: () => Promise.resolve({ ...policy, runtimeProvider: { id: '' } }),
          listRuntimes: () => Promise.resolve([]),
        })}
        locale="en"
        mode="production"
      />,
    )
    await act(async () => {
      missing.host.querySelector('button[data-nav="agent"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(missing.host.textContent).toContain('No runtime is registered.')
    expect(missing.host.textContent).toContain('This runtime does not list models.')
    missing.root.unmount()
    missing.host.remove()

    let listed = 0
    const refreshed = await mount(
      <PanelSettings
        client={client({
          listRuntimes: () => {
            listed += 1
            return listed === 1
              ? Promise.resolve([{ id: 'echo', label: 'Echo', models: [] }])
              : Promise.reject(new Error('no'))
          },
        })}
        locale="en"
        mode="production"
      />,
    )
    await act(async () => {
      refreshed.host.querySelector('button[data-nav="agent"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const refresh = refreshed.host.querySelector('button[aria-label="Refresh"]')
    expect(refresh).toBeInstanceOf(HTMLButtonElement)
    await act(async () => {
      if (refresh instanceof HTMLButtonElement) refresh.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(listed).toBe(2)
    expect(refreshed.host.textContent).toContain('echo')
    expect(refreshed.host.textContent).toContain('This runtime does not list models.')
    refreshed.root.unmount()
    refreshed.host.remove()

    const probed = await mount(
      <PanelSettings
        client={client({
          listRuntimes: () => Promise.resolve([{
            id: 'echo',
            label: 'Echo',
            models: [
              { provider: 'local', models: ['a', 'b'] },
              { provider: 'other', models: ['c'] },
            ],
          }]),
          probe: () => Promise.resolve({ healthy: true }),
        })}
        locale="en"
        mode="production"
      />,
    )
    await act(async () => {
      probed.host.querySelector('button[data-nav="agent"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const vendor = [...probed.host.querySelectorAll('select')].at(1)
    if (vendor instanceof HTMLSelectElement) {
      vendor.value = 'other'
      vendor.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await act(async () => {
      button(probed.host, 'Probe')?.click()
      await Promise.resolve()
    })
    expect(probed.host.textContent).toContain('Healthy')
    probed.root.unmount()
    probed.host.remove()
  })

  it('reports a non-error save and an update note', async () => {
    const { host, root } = await mount(
      <PanelSettings
        client={client({
          writePolicy: () => Promise.reject('nope'),
          checkUpdate: () => Promise.resolve({ name: 'host', current: '1', latest: null, updateAvailable: false, error: 'registry down' }),
          restartHost: () => Promise.resolve(),
        })}
        locale="en"
        mode="production"
        versions="host 1"
      />,
    )
    await act(async () => {
      button(host, 'Save')?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Save failed')
    expect(host.textContent).not.toContain('nope')
    await act(async () => {
      host.querySelector('button[data-nav="about"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      button(host, 'Check for updates')?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('registry down')
    root.unmount()
    host.remove()
  })

  it('keeps the stored workbench when another setting is saved', async () => {
    const written: Array<string | undefined> = []
    const stored = { ...policy, defaultWorkbenchId: 'com.example.desk' }
    const { host, root } = await mount(
      <PanelSettings
        client={client({
          readPolicy: () => Promise.resolve(stored),
          writePolicy: (next) => {
            written.push(next.defaultWorkbenchId)
            return Promise.resolve({ policy: next, restartRequired: false })
          },
        })}
        locale="en"
        mode="production"
      />,
    )
    expect(host.querySelector('button[data-nav="workbench"]')).toBeNull()
    await act(async () => {
      button(host, 'Save')?.click()
      await Promise.resolve()
    })
    expect(written).toEqual(['com.example.desk'])
    root.unmount()
    host.remove()
  })
})
