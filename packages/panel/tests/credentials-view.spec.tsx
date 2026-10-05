/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelCredential, PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { CredentialSettings } from '../src/settings/credentials-view.tsx'
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

/** A client that holds rows in memory. It is the whole store as far as this section can see. */
function store(rows: PanelCredential[], writable = true) {
  let held = [...rows]
  const puts: string[] = []
  const removes: string[] = []
  const client: PanelSettingsClient = {
    readPolicy: () => Promise.resolve(policy),
    writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
    probe: () => Promise.resolve({ healthy: true }),
    readCredentials: () => Promise.resolve({ credentials: held, writable }),
    putCredential: (name, description, secret) => {
      puts.push(`${name}:${description}:${secret ?? 'kept'}`)
      held = [...held.filter(row => row.name !== name), { name, description }]
      return Promise.resolve()
    },
    removeCredential: (name) => {
      removes.push(name)
      held = held.filter(row => row.name !== name)
      return Promise.resolve()
    },
  }
  return { client, puts, removes }
}

async function mount(client: PanelSettingsClient) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<CredentialSettings client={client} locale="en" mode="production" />)
  })
  return host
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(item => item.textContent === text)
  if (found === undefined) throw new Error(`no button: ${text}`)
  return found as HTMLButtonElement
}

async function click(host: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    button(host, text).click()
  })
}

/** The confirm dialog repeats the row's label, so a confirmation click takes the last match. */
async function clickLast(host: HTMLElement, text: string): Promise<void> {
  const all = [...host.querySelectorAll('button')].filter(item => item.textContent === text)
  const last = all[all.length - 1]
  if (last === undefined) throw new Error(`no button: ${text}`)
  await act(async () => {
    last.click()
  })
}

async function type(host: HTMLElement, placeholder: string, value: string): Promise<void> {
  const input = host.querySelector(`input[placeholder="${placeholder}"]`)
  if (input === null) throw new Error(`no input: ${placeholder}`)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('CredentialSettings', () => {
  it('lists names and descriptions, and never a secret', async () => {
    const { client } = store([{ name: 'github', description: '个人 GitHub' }])
    const host = await mount(client)
    expect(host.textContent).toContain('github')
    expect(host.textContent).toContain('个人 GitHub')
    expect(host.textContent).toContain('${credential:github}')
    expect(host.querySelector('input')).toBeNull()
  })

  it('adds one: the secret goes out, and the form asks for it again on the next open', async () => {
    const { client, puts } = store([])
    const host = await mount(client)
    await click(host, 'Add credential')
    await type(host, 'e.g. github', 'gitlab')
    await type(host, 'What this account is for', 'GitLab')
    await type(host, 'Paste the token', 'glpat_test')
    await click(host, 'Save')
    expect(puts).toEqual(['gitlab:GitLab:glpat_test'])
    expect(host.textContent).toContain('gitlab')
    expect(host.textContent).not.toContain('glpat_test')
    expect(host.querySelector('input')).toBeNull()
    await click(host, 'Edit credential')
    const secret = host.querySelector('input[type="password"]') as HTMLInputElement | null
    expect(secret?.value).toBe('')
    expect(host.textContent).toContain('Leave the secret empty to keep the stored one.')
  })

  it('refuses a new row with no name or no secret', async () => {
    const { client, puts } = store([])
    const host = await mount(client)
    await click(host, 'Add credential')
    expect(host.textContent).toContain('Give the credential a name first.')
    expect((button(host, 'Save') as HTMLButtonElement).disabled).toBe(true)
    await type(host, 'e.g. github', 'github')
    expect(host.textContent).toContain('A new credential needs a secret.')
    expect((button(host, 'Save') as HTMLButtonElement).disabled).toBe(true)
    await click(host, 'Save')
    expect(puts).toEqual([])
  })

  it('saves a description alone and leaves the stored secret with the host', async () => {
    const { client, puts } = store([{ name: 'github', description: 'GitHub' }])
    const host = await mount(client)
    await click(host, 'Edit credential')
    expect(host.textContent).toContain('Leave the secret empty to keep the stored one.')
    expect((button(host, 'Save') as HTMLButtonElement).disabled).toBe(false)
    await type(host, 'What this account is for', 'Work GitHub')
    await click(host, 'Save')
    // No secret in the call: the form sent the description alone, and Host keeps the stored value.
    expect(puts).toEqual(['github:Work GitHub:kept'])
    expect(host.textContent).toContain('Description saved. The stored secret is unchanged.')
    expect(host.textContent).toContain('Work GitHub')
  })

  it('asks before deleting, and removes on confirm', async () => {
    const { client, removes } = store([{ name: 'github', description: 'GitHub' }])
    const host = await mount(client)
    await click(host, 'Delete')
    expect(removes).toEqual([])
    expect(host.textContent).toContain('Delete this credential?')
    await clickLast(host, 'Delete')
    expect(removes).toEqual(['github'])
    expect(host.textContent).toContain('No credentials yet')
  })

  it('keeps a read-only store to the list', async () => {
    const { client, puts } = store([{ name: 'github', description: 'GitHub' }], false)
    const host = await mount(client)
    expect(host.textContent).toContain('github')
    expect(host.textContent).toContain('This store cannot be written from here.')
    expect([...host.querySelectorAll('button')].map(item => item.textContent)).toEqual([])
    expect(puts).toEqual([])
  })
})

describe('the settings rail', () => {
  it('shows the credentials section only when Host exposes the read call', async () => {
    const withStore = store([]).client
    const host = await act_mount(withStore)
    expect([...host.querySelectorAll('nav button')].map(item => item.getAttribute('data-nav'))).toEqual(
      ['appearance', 'network', 'agent', 'mcp', 'credentials', 'about'],
    )
    const without: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
    }
    const bare = await act_mount(without)
    expect([...bare.querySelectorAll('nav button')].map(item => item.getAttribute('data-nav'))).toEqual(
      ['appearance', 'network', 'agent', 'mcp', 'about'],
    )
  })
})

async function act_mount(client: PanelSettingsClient): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<PanelSettings client={client} locale="en" mode="production" />)
  })
  return host
}
