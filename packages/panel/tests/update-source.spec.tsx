/** @vitest-environment jsdom */
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { UpdateDialog } from '../src/settings/update-dialog.tsx'
import { checkSource, UpdateSourceChip } from '../src/settings/update-source.tsx'
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

describe('UpdateSourceChip', () => {
  it('names the registry host and keeps the url in the title', async () => {
    const { host, root } = await render(
      <UpdateSourceChip source={{ channel: 'registry', registry: 'https://registry.npmmirror.com/' }} label={key => key} />,
    )
    expect(host.textContent).toContain('update-source')
    expect(host.textContent).toContain('registry.npmmirror.com')
    expect(host.querySelector('span[title]')?.getAttribute('title')).toBe('https://registry.npmmirror.com/')
    await unmount(root, host)
  })

  it('collapses the home prefix on a local drop folder', async () => {
    const { host, root } = await render(
      <UpdateSourceChip source={{ channel: 'tarball', tarballDir: '/Users/someone/.mini-app/packages' }} label={key => key} />,
    )
    expect(host.textContent).toContain('update-source-tarball · ~/.mini-app/packages')
    await unmount(root, host)
  })

  it('says a source tree has no install prefix', async () => {
    const { host, root } = await render(<UpdateSourceChip source={{ channel: 'none' }} label={key => key} />)
    expect(host.textContent).toContain('update-source-none')
    await unmount(root, host)
  })
})

describe('checkSource', () => {
  it('reads the source a check named, and nothing when it named none', () => {
    expect(checkSource({ name: 's', current: '1', latest: '2', updateAvailable: true, channel: 'registry' }))
      .toEqual({ channel: 'registry', registry: 'https://registry.npmjs.org' })
    expect(checkSource({ name: 's', current: '1', latest: '2', updateAvailable: true, channel: 'registry', registry: 'https://registry.npmmirror.com' }))
      .toEqual({ channel: 'registry', registry: 'https://registry.npmmirror.com' })
    expect(checkSource({ name: 's', current: '1', latest: '2', updateAvailable: true, channel: 'tarball', tarballDir: '/tmp/packs' }))
      .toEqual({ channel: 'tarball', tarballDir: '/tmp/packs' })
    expect(checkSource({ name: 's', current: '1', latest: '2', updateAvailable: true, channel: 'tarball' })).toBeUndefined()
    expect(checkSource({ name: 's', current: '1', latest: null, updateAvailable: false })).toBeUndefined()
  })
})

describe('the source in the panel', () => {
  it('shows where an update would come from in the about block', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      readAbout: () => Promise.resolve({
        name: 'Mohou',
        current: '1.0.20',
        platform: 'darwin',
        source: { channel: 'tarball', tarballDir: '/Users/someone/.mini-app/packages' },
        authoring: { url: 'http://127.0.0.1:9743/mcp', token: 't', tools: [] },
      }),
    }
    await act(async () => {
      root.render(<PanelSettings client={client} locale="en" mode="production" versions="@mohou/shell 1.0.20" />)
    })
    await act(async () => {
      host.querySelector('button[data-nav="about"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).toContain('Update source')
    expect(host.textContent).toContain('Local packages · ~/.mini-app/packages')
    await unmount(root, host)
  })

  it('names the source on the offer card', async () => {
    const { host, root } = await render(
      <UpdateDialog
        locale="en"
        mode="production"
        card={{ kind: 'offer', current: '1.0.20', latest: '1.0.21', source: { channel: 'registry', registry: 'https://registry.npmjs.org' } }}
        onClose={() => undefined}
        onInstall={() => undefined}
      />,
    )
    expect(host.textContent).toContain('Update source')
    expect(host.textContent).toContain('registry.npmjs.org')
    await unmount(root, host)
  })
})

async function render(node: ReactNode): Promise<{ readonly host: HTMLElement; readonly root: ReturnType<typeof createRoot> }> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(node) })
  return { host, root }
}

async function unmount(root: ReturnType<typeof createRoot>, host: HTMLElement): Promise<void> {
  await act(async () => { root.unmount() })
  host.remove()
}
