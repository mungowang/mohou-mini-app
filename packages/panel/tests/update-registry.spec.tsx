/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { updateRegistryPresets } from '../src/settings/form.ts'
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

describe('the update registry field', () => {
  it('offers the mirrors, admits a custom url, and refuses a bad one before a write', async () => {
    const written: PanelPolicy[] = []
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: (next) => {
        written.push(next)
        return Promise.resolve({ policy: next, restartRequired: false })
      },
      probe: () => Promise.resolve({ healthy: true }),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<PanelSettings client={client} locale="en" mode="production" />)
    })
    await act(async () => {
      host.querySelector('button[data-nav="network"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const select = host.querySelector('select[data-field="update-registry"]')
    expect(select).toBeInstanceOf(HTMLSelectElement)
    expect(host.textContent).toContain('Alibaba npmmirror')
    expect(host.textContent).toContain('Tencent Cloud')
    expect(host.textContent).toContain('Packaged default')
    // A preset writes its url, and the field shows no free-text input for it.
    await choose(host, 'npmmirror')
    expect(host.querySelector('input[data-field="update-registry-custom"]')).toBeNull()
    await save(host)
    expect(written.at(-1)?.updateRegistry).toBe(updateRegistryPresets.npmmirror)

    // Custom reveals the input; a bad url is refused in the form and never written.
    await choose(host, 'custom')
    const custom = host.querySelector('input[data-field="update-registry-custom"]')
    expect(custom).toBeInstanceOf(HTMLInputElement)
    await type(host, 'http://mirror.example.com')
    await save(host)
    expect(host.textContent).toContain('Use an https url without a username or password.')
    expect(written).toHaveLength(1)

    // Fixing it writes the trimmed url.
    await type(host, '  https://registry.example.com/  ')
    await save(host)
    expect(written).toHaveLength(2)
    expect(written.at(-1)?.updateRegistry).toBe('https://registry.example.com/')

    // The packaged default is an empty value, not a url.
    await choose(host, 'default')
    await save(host)
    expect(written.at(-1)?.updateRegistry).toBe('')

    await act(async () => { root.unmount() })
    host.remove()
  })
})

async function choose(host: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    const select = host.querySelector('select[data-field="update-registry"]')
    if (select instanceof HTMLSelectElement) {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
}

async function type(host: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    const input = host.querySelector('input[data-field="update-registry-custom"]')
    if (input instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}

async function save(host: HTMLElement): Promise<void> {
  await act(async () => {
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Save')?.click()
    await Promise.resolve()
  })
  // A save keeps the spinner (and a disabled button) up for at least 500ms by design.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Save')
    if (button !== undefined) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  }
}
