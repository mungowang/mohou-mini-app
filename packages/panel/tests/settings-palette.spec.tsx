/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { PanelSettings } from '../src/settings/view.tsx'
import type { PaletteChip, ThemeClient } from '../src/theme/client.ts'

const policy: PanelPolicy = {
  theme: 'light',
  palette: 'ink',
  locale: 'en',
  chatLanguage: 'en',
  hostPort: 9743,
  llm: null,
  runtimeProvider: { id: 'echo' },
}

const twoMode = [
  ':root[data-mode="light"] { --background: #fff; --foreground: #111; --primary: #2563eb; --card: #fafafa; --border: #ddd; --muted: #eee; --secondary: #f3f3f3; }',
  ':root[data-mode="dark"] { --background: #0b0b0c; --foreground: #eee; --primary: #3b82f6; --card: #171717; --border: #2a2a2c; --muted: #27272a; --secondary: #27272a; }',
].join('\n')

const ink: PaletteChip = { id: 'ink', name: 'Ink', style: twoMode, origin: 'builtin' }
const plum: PaletteChip = { id: 'plum', name: 'Plum', nameZh: '紫穗', style: twoMode, origin: 'custom' }

function client(
  extra: Partial<PanelSettingsClient> = {},
): PanelSettingsClient {
  return {
    readPolicy: () => Promise.resolve(policy),
    writePolicy: next => Promise.resolve({ policy: next as PanelPolicy, restartRequired: false }),
    probe: () => Promise.resolve({ healthy: true }),
    ...extra,
  }
}

function theme(
  remove: (id: string) => Promise<void>,
  listed: readonly PaletteChip[] = [ink],
): ThemeClient {
  return {
    listPalettes: () => Promise.resolve({ palettes: listed, ignored: [] }),
    deletePalette: remove,
    setPin: async (_appId, pin) => pin,
  }
}

async function mount(node: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(node) })
  await flush()
  return { host, root }
}

/** The delete path awaits the remove, a refetch, then a policy write. */
async function flush() {
  await act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve()
  })
}

function del(host: ParentNode): HTMLButtonElement | undefined {
  return host.querySelector('button[data-palette-delete]') ?? undefined
}

function confirmDelete(host: ParentNode): HTMLButtonElement | undefined {
  return confirmRow(host, 'Delete')
}

function cancelDelete(host: ParentNode): HTMLButtonElement | undefined {
  return confirmRow(host, 'Cancel')
}

function confirmRow(host: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('[data-palette-confirm] button')].find(item => item.textContent === text)
}

describe('settings palette list', () => {
  it('paints the dual preview and marks a custom row', async () => {
    const { host } = await mount(
      <PanelSettings client={client()} locale="en" mode="production" palettes={[ink, plum]} />,
    )
    expect(host.querySelectorAll('[data-theme-preview="workbench"]')).toHaveLength(2)
    expect(host.querySelectorAll('[data-theme-strip]')).toHaveLength(2)
    expect(host.textContent).toContain('Custom')
    expect(del(host)).toBeUndefined()
  })

  it('asks inline before the delete, and a cancel writes nothing', async () => {
    const removed: string[] = []
    const { host } = await mount(
      <PanelSettings
        client={client()}
        locale="en"
        mode="production"
        palettes={[plum]}
        theme={theme(async (id) => { removed.push(id) })}
      />,
    )
    await act(async () => { del(host)?.click() })
    expect(host.textContent).toContain('Delete this file?')
    expect(removed).toEqual([])
    // Trailing control is Cancel so a second click on the same side does not delete.
    expect(del(host)).toBeUndefined()
    const row = host.querySelector('[data-palette-confirm]')
    const actions = [...(row?.querySelectorAll('button') ?? [])]
    expect(actions.map(item => item.textContent)).toEqual(['Delete', 'Cancel'])
    await act(async () => { cancelDelete(host)?.click() })
    expect(host.textContent).not.toContain('Delete this file?')
    expect(removed).toEqual([])
    await act(async () => { del(host)?.click() })
    await act(async () => { confirmDelete(host)?.click() })
    await flush()
    expect(removed).toEqual(['plum'])
  })

  it('offers delete only on a custom row, refetches, and leaves an unselected policy alone', async () => {
    const removed: string[] = []
    const written: PanelPolicy[] = []
    const changed: number[] = []
    const settings = client({
      writePolicy: (next) => {
        written.push(next as PanelPolicy)
        return Promise.resolve({ policy: next as PanelPolicy, restartRequired: false })
      },
    })
    const { host } = await mount(
      <PanelSettings
        client={settings}
        locale="en"
        mode="production"
        palettes={[ink, plum]}
        theme={theme(async (id) => { removed.push(id) })}
        onPalettesChange={next => changed.push(next.length)}
        onPolicy={() => undefined}
      />,
    )
    const remove = del(host)
    expect(remove).toBeDefined()
    await act(async () => { remove?.click() })
    await act(async () => { confirmDelete(host)?.click() })
    await flush()
    expect(removed).toEqual(['plum'])
    expect(changed).toEqual([1])
    // 'plum' is not the selected palette ('ink' is), so no policy write happened.
    expect(written).toEqual([])
  })

  it('writes the default palette when the deleted row was selected', async () => {
    const written: PanelPolicy[] = []
    const settings = client({
      writePolicy: (next) => {
        written.push(next as PanelPolicy)
        return Promise.resolve({ policy: next as PanelPolicy, restartRequired: false })
      },
    })
    const { host } = await mount(
      <PanelSettings
        client={settings}
        locale="en"
        mode="production"
        palettes={[{ ...plum, id: 'ink' }]}
        theme={theme(async () => undefined, [])}
        onPolicy={() => undefined}
      />,
    )
    await act(async () => { del(host)?.click() })
    await act(async () => { confirmDelete(host)?.click() })
    await flush()
    expect(written[0]?.palette).toBe('default')
  })

  it('keeps the row and reports the error when Host refuses the delete', async () => {
    const { host } = await mount(
      <PanelSettings
        client={client()}
        locale="en"
        mode="production"
        palettes={[plum]}
        theme={theme(async () => {
          throw new Error('theme file is read-only')
        })}
      />,
    )
    await act(async () => { del(host)?.click() })
    await act(async () => { confirmDelete(host)?.click() })
    await flush()
    expect(host.textContent).toContain('theme file is read-only')
  })

  it('hides the delete control when Host has no palette delete capability', async () => {
    const { host } = await mount(
      <PanelSettings
        client={client()}
        locale="en"
        mode="production"
        palettes={[plum]}
        theme={{ listPalettes: () => Promise.resolve({ palettes: [plum], ignored: [] }), setPin: async (_a, pin) => pin }}
      />,
    )
    expect(host.textContent).toContain('Custom')
    expect(del(host)).toBeUndefined()
  })

  it('keeps the bar preview when a theme file has one mode only', async () => {
    const { host } = await mount(
      <PanelSettings
        client={client()}
        locale="en"
        mode="production"
        palettes={[{ id: 'odd', name: 'Odd', style: ':root { --primary: #123456 }', origin: 'builtin' }]}
      />,
    )
    expect(host.querySelectorAll('[data-theme-preview="workbench"]')).toHaveLength(0)
    expect(host.textContent).toContain('Odd')
  })
})
