/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import type { ThemeClient } from '../src/theme/client.ts'
import { applyDocumentMode, ThemeMenu } from '../src/theme/menu.tsx'

const policy: PanelPolicy = {
  theme: 'system',
  palette: 'ink',
  locale: 'en',
  chatLanguage: 'en',
  hostPort: 9743,
  llm: null,
  runtimeProvider: { id: 'echo' },
}

function settings(write: PanelSettingsClient['writePolicy'] = () => Promise.resolve({ policy, restartRequired: false })): PanelSettingsClient {
  return {
    readPolicy: () => Promise.resolve(policy),
    writePolicy: write,
    probe: () => Promise.resolve({ healthy: true }),
  }
}

function theme(extra: Partial<ThemeClient> = {}): ThemeClient {
  return {
    listPalettes: () => Promise.resolve({
      palettes: [
        { id: 'ink', name: 'Ink', swatch: '#111', style: ':root{--primary:1}', origin: 'builtin' },
        { id: 'plain', name: 'Plain', origin: 'custom' },
      ],
      ignored: [],
    }),
    setPin: (_appId, pin) => Promise.resolve(pin),
    readPin: () => Promise.resolve({ kind: 'default' }),
    appFile: () => Promise.resolve(true),
    readAppTheme: () => Promise.resolve({ name: 'Inkstone', nameZh: '砚台', swatch: '#345', style: ':root{--primary:2}' }),
    ...extra,
  }
}

async function render(node: React.ReactNode): Promise<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
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

function button(host: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))
}

describe('ThemeMenu', () => {
  it('paints appearance, palettes, and app pins', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const frame = document.createElement('iframe')
    frame.dataset.appId = 'com.example.app'
    document.body.append(frame)
    const sheet = document.createElement('style')
    sheet.id = 'mma-theme'
    document.head.append(sheet)
    const written: string[] = []
    const { host, root } = await render(
      <ThemeMenu
        locale="en"
        mode="production"
        appId="com.example.app"
        appTitle="Radar"
        theme={theme()}
        settings={settings(async (next) => {
          written.push(next.theme + next.palette)
          return { policy: next, restartRequired: false }
        })}
      />,
    )
    expect(host.textContent).toContain('Radar')
    expect(host.textContent).toContain('Plain')
    expect(host.textContent).toContain('Custom')
    expect(host.textContent).toContain('System')
    expect(button(host, 'App file')).toBeUndefined()
    await act(async () => {
      button(host, 'Dark')?.click()
      await Promise.resolve()
    })
    expect(document.documentElement.dataset.mode).toBe('dark')
    await act(async () => {
      button(host, 'Radar')?.click()
    })
    expect(host.textContent).toContain('Inkstone')
    expect(host.textContent).toContain('App')
    await act(async () => {
      button(host, 'Ink')?.click()
      await Promise.resolve()
    })
    await act(async () => {
      button(host, 'Follow global')?.click()
      await Promise.resolve()
    })
    await act(async () => {
      button(host, 'App file')?.click()
      await Promise.resolve()
    })
    expect(written.some(item => item.includes('dark'))).toBe(true)
    expect(sheet.textContent).toBe('')
    root.unmount()
    host.remove()
    frame.remove()
    sheet.remove()
  })

  it('refetches the palette list when paletteTick bumps', async () => {
    let lists = 0
    const client = theme({
      listPalettes: () => {
        lists += 1
        return Promise.resolve({
          palettes: lists === 1
            ? [{ id: 'ink', name: 'Ink', origin: 'builtin' as const }, { id: 'plum', name: 'Plum', origin: 'custom' as const }]
            : [{ id: 'ink', name: 'Ink', origin: 'builtin' as const }],
          ignored: [],
        })
      },
    })
    const { host, root } = await render(<ThemeMenu locale="en" mode="production" theme={client} paletteTick={0} />)
    expect(host.textContent).toContain('Plum')
    await act(async () => {
      root.render(<ThemeMenu locale="en" mode="production" theme={client} paletteTick={1} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.textContent).not.toContain('Plum')
    expect(host.textContent).toContain('Ink')
    root.unmount()
    host.remove()
  })

  it('shows save failures and ignores a missing client', async () => {
    const { host, root } = await render(<ThemeMenu locale="en" mode="production" />)
    await act(async () => {
      button(host, 'Light')?.click()
      await Promise.resolve()
    })
    expect(host.textContent).not.toContain('Theme pin failed to save')
    root.unmount()
    host.remove()

    const rejected = await render(<ThemeMenu locale="en" mode="production" theme={{
      listPalettes: () => Promise.reject(new Error('list down')),
      setPin: () => Promise.resolve({ kind: 'default' }),
    }} />)
    expect(rejected.host.textContent).toContain('list down')
    rejected.root.unmount()
    rejected.host.remove()

    const blank = await render(<ThemeMenu locale="en" mode="production" theme={{
      listPalettes: () => Promise.reject('no'),
      setPin: () => Promise.resolve({ kind: 'default' }),
    }} settings={{
      readPolicy: () => Promise.reject(new Error('')),
      writePolicy: () => Promise.reject(new Error('')),
      probe: () => Promise.resolve({ healthy: false }),
    }} />)
    expect(blank.host.textContent).toContain('Theme pin failed to save')
    await act(async () => {
      button(blank.host, 'System')?.click()
      await Promise.resolve()
    })
    blank.root.unmount()
    blank.host.remove()

    const pinFail = await render(<ThemeMenu
      locale="en"
      mode="production"
      appId="com.example.app"
      theme={theme({
        readPin: () => Promise.reject(new Error('pin')),
        appFile: () => Promise.reject(new Error('file')),
        setPin: () => Promise.reject('x'),
      })}
      settings={settings(() => Promise.reject(new Error('save')))}
    />)
    await act(async () => {
      button(pinFail.host, pinFail.host.textContent?.includes('App') ? 'App' : 'scope')?.click()
    })
    const app = [...pinFail.host.querySelectorAll('button')].find(item => item.textContent !== 'Global' && item.getAttribute('aria-pressed') !== null && item.textContent !== 'System' && item.textContent !== 'Light' && item.textContent !== 'Dark')
    await act(async () => {
      app?.click()
      await Promise.resolve()
    })
    await act(async () => {
      button(pinFail.host, 'Ink')?.click()
      await Promise.resolve()
    })
    expect(pinFail.host.textContent).toContain('save')
    pinFail.root.unmount()
    pinFail.host.remove()
  })

  it('follows the operating system when appearance is system', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    applyDocumentMode('system')
    expect(document.documentElement.dataset.mode).toBe('light')
    applyDocumentMode('light')
    expect(document.documentElement.dataset.mode).toBe('light')
  })
})
