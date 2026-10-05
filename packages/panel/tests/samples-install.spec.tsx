/** @vitest-environment jsdom */
import { act } from 'react'
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

describe('sample apps', () => {
  it('installs from the settings section and reports what was skipped', async () => {
    let calls = 0
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      installSamples: () => {
        calls += 1
        return Promise.resolve({ installed: ['com.mohou.lab'], skipped: ['com.mohou.today', 'com.mohou.board'] })
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<PanelSettings client={client} locale="en" mode="production" />)
    })
    await act(async () => {
      host.querySelector('button[data-nav="agent"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Sample apps')
    await act(async () => {
      ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Install samples')?.click()
      await Promise.resolve()
    })
    expect(calls).toBe(1)
    expect(host.textContent).toContain('installed 1')
    expect(host.textContent).toContain('already here 2')
    await act(async () => { root.unmount() })
    host.remove()
  })
})
