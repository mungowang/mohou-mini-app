/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { McpServerDraft, PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { McpSettings } from '../src/settings/mcp-view.tsx'
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

const calendar: McpServerDraft = {
  id: 'calendar',
  description: 'dates',
  url: 'https://example.com/mcp',
  transport: 'streamable-http',
}

describe('McpSettings', () => {
  it('says which server the last boot left out, and why', async () => {
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      listMcp: () => Promise.resolve({
        servers: [{ id: 'git', command: 'npx', env: { TOKEN: '${credential:nope}' } }],
        unresolved: [{ id: 'git', code: 'mcp-reference-unknown', message: 'git env.TOKEN names an unknown credential: nope' }],
      }),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={client} locale="en" mode="production" />)
    })
    expect(host.textContent).toContain('Not started: git env.TOKEN names an unknown credential: nope')
    expect(host.textContent).toContain('Add it in Credentials, then restart the host.')
  })


  it('shows what a save left out, without waiting for a reload', async () => {
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      listMcp: () => Promise.resolve({ servers: [calendar], unresolved: [] }),
      writeMcp: () => Promise.resolve({
        unresolved: [{ id: 'calendar', code: 'mcp-reference-unknown', message: 'calendar headers.AUTH names an unknown credential: nope' }],
      }),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={client} locale="en" mode="production" />)
    })
    await flush()
    expect(host.textContent).not.toContain('Not started')
    const toggle = host.querySelector('[role="switch"]')
    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Not started: calendar headers.AUTH names an unknown credential: nope')
    expect(host.textContent).toContain('Add it in Credentials, then restart the host.')
  })

  it('adds, checks, toggles, imports, and deletes a server without writing on check', async () => {
    const written: McpServerDraft[][] = []
    let listed: McpServerDraft[] = [calendar]
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      listMcp: () => Promise.resolve({ servers: listed, unresolved: [] }),
      writeMcp: (servers) => {
        listed = [...servers]
        written.push(listed)
        return Promise.resolve({ unresolved: [] })
      },
      checkMcp: server => Promise.resolve({
        ok: true,
        tools: [
          { name: 'a', description: 'one' },
          { name: 'b' },
          { name: 'c' },
          { name: 'd' },
          { name: 'e' },
        ],
        ...server.id === 'bad' ? { ok: false, tools: [], message: 'down' } : {},
      }),
      admitMcp: text => Promise.resolve(text.includes('two')
        ? [{ id: 'alpha', command: 'npx' }, { id: 'beta', command: 'npx' }]
        : text.includes('none')
          ? []
          : [{ id: 'pasted', command: 'npx', args: ['-y', 'x'], env: { K: 'v' } }]),
      importMcp: source => source === 'empty'
        ? Promise.resolve([])
        : Promise.resolve([{ id: 'pi-cal', url: 'https://pi.example/mcp', description: 'from pi' }]),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={client} locale="en" mode="production" />)
    })
    await flush()
    expect(host.textContent).toContain('calendar')
    const check = [...host.querySelectorAll('button')].find(button => button.textContent === 'Check connection')
    await act(async () => {
      check?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('a')
    expect(written).toEqual([])
    const extra = [...host.querySelectorAll('button')].find(button => (button.textContent ?? '').includes('more'))
    await act(async () => {
      extra?.click()
    })
    const toolA = [...host.querySelectorAll('button')].find(button => button.textContent === 'a')
    await act(async () => {
      toolA?.click()
    })
    expect(host.textContent).toContain('one')
    await act(async () => { closeOverlay(host) })
    const add = [...host.querySelectorAll('button')].find(button => button.textContent === 'Add server')
    await act(async () => {
      add?.click()
    })
    await act(async () => {
      fill(host, 'e.g. filesystem', 'echo')
      fill(host, 'e.g. npx', 'echo')
    })
    const saveAdd = [...host.querySelectorAll('button')].filter(button => button.textContent === 'Add server').at(-1)
    await act(async () => {
      saveAdd?.click()
      await Promise.resolve()
    })
    expect(written.at(-1)?.some(server => server.id === 'echo')).toBe(true)
    const paste = [...host.querySelectorAll('button')].find(button => button.textContent === 'Paste')
    await act(async () => {
      paste?.click()
    })
    const area = host.querySelector('textarea')
    if (area instanceof HTMLTextAreaElement) {
      await act(async () => {
        area.value = '{"pasted":{"command":"npx"}}'
        area.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const admit = [...host.querySelectorAll('button')].find(button => button.textContent === 'Recognize')
    await act(async () => {
      admit?.click()
      await Promise.resolve()
    })
    expect([...host.querySelectorAll('input')].some(input => input instanceof HTMLInputElement && input.value === 'pasted')).toBe(true)
    await act(async () => { closeOverlay(host) })
    await act(async () => {
      paste?.click()
    })
    await act(async () => {
      const box = host.querySelector('textarea')
      if (box instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(box, 'two')
        box.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'Recognize')?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('alpha')
    expect(host.textContent).toContain('beta')
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel')?.click()
    })
    const fromPi = [...host.querySelectorAll('button')].find(button => button.textContent === 'From Pi')
    await act(async () => {
      fromPi?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('pi-cal')
    const pickAdd = [...host.querySelectorAll('button')].filter(button => button.textContent === 'Add server').at(-1)
    await act(async () => {
      pickAdd?.click()
    })
    expect([...host.querySelectorAll('input')].some(input => input instanceof HTMLInputElement && input.value === 'pi-cal')).toBe(true)
    await act(async () => { closeOverlay(host) })
    const toggle = host.querySelector('button[role="switch"]')
    await act(async () => {
      if (toggle instanceof HTMLButtonElement) toggle.click()
      await Promise.resolve()
    })
    expect(written.at(-1)?.[0]?.enabled).toBe(false)
    const remove = [...host.querySelectorAll('button')].find(button => button.textContent === 'Delete')
    await act(async () => {
      remove?.click()
    })
    const confirm = [...host.querySelectorAll('button')].find(button => button.textContent === 'Delete' && button.className.includes('bg-destructive'))
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
    })
    expect(written.at(-1)?.some(server => server.id === 'calendar')).toBe(false)
    root.unmount()
    host.remove()
  })

  it('shows load and import failures, and empty paste', async () => {
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      listMcp: () => Promise.reject(new Error('down')),
      writeMcp: () => Promise.reject(new Error('no')),
      admitMcp: () => Promise.resolve([]),
      importMcp: () => Promise.reject(new Error('missing')),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={client} locale="en" mode="production" />)
    })
    await flush()
    expect(host.textContent).toContain('The MCP file could not be read.')
    const paste = [...host.querySelectorAll('button')].find(button => button.textContent === 'Paste')
    await act(async () => {
      paste?.click()
    })
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'Recognize')?.click()
      await Promise.resolve()
    })
    expect(host.textContent.length).toBeGreaterThan(0)
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel')?.click()
    })
    const fromPi = [...host.querySelectorAll('button')].find(button => button.textContent === 'From Pi')
    await act(async () => {
      fromPi?.click()
      await Promise.resolve()
    })
    const add = [...host.querySelectorAll('button')].find(button => button.textContent === 'Add server')
    await act(async () => {
      add?.click()
    })
    const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'Add server' && button.className.includes('bg-primary'))
    await act(async () => {
      save?.click()
      await Promise.resolve()
    })
    root.unmount()
    host.remove()
  })

  it('hides MCP when Host exposes no list, and opens the section from settings', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={{
        readPolicy: () => Promise.resolve(policy),
        writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
        probe: () => Promise.resolve({ healthy: true }),
      }} locale="en" mode="production" />)
    })
    expect(host.textContent).toContain('No servers yet')
    await act(async () => {
      root.render(<PanelSettings client={{
        readPolicy: () => Promise.resolve(policy),
        writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
        probe: () => Promise.resolve({ healthy: true }),
        listMcp: () => Promise.resolve({ servers: [], unresolved: [] }),
      }} locale="en" mode="production" />)
    })
    await flush()
    const mcp = host.querySelector('button[data-nav="mcp"]')
    await act(async () => {
      mcp?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toMatch(/MCP/)
    root.unmount()
    host.remove()
  })

  it('edits HTTP, imports a file, and surfaces a failed check', async () => {
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
      probe: () => Promise.resolve({ healthy: true }),
      listMcp: () => Promise.resolve({ servers: [{ id: 'web', url: 'https://example.com/mcp', transport: 'sse', headers: { A: 'b' } }], unresolved: [] }),
      writeMcp: () => Promise.resolve({ unresolved: [] }),
      checkMcp: () => Promise.reject(new Error('down')),
      admitMcp: () => Promise.reject(new Error('bad')),
      importMcp: () => Promise.resolve([]),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={client} locale="en" mode="production" />)
    })
    await flush()
    await act(async () => {
      host.querySelector('button[aria-label="Edit server"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('SSE')
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'HTTP')?.click()
    })
    await act(async () => {
      [...host.querySelectorAll('button')].filter(button => button.textContent === 'Check connection').at(-1)?.click()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('down')
    await act(async () => { closeOverlay(host) })
    const file = new File(['{"from-file":{"command":"npx"}}'], 'mcp.json', { type: 'application/json' })
    const picker = host.querySelector('input[type="file"]')
    await act(async () => {
      picker?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
    await act(async () => {
      picker?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.textContent).toMatch(/could not recognize|没能识别|No servers|Save failed/i)
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'OK' || button.textContent === 'Confirm')?.click()
    })
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'From Pi')?.click()
      await Promise.resolve()
    })
    root.unmount()
    host.remove()
  })

  it('no-ops import and paste when Host did not expose them', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<McpSettings client={{
        readPolicy: () => Promise.resolve(policy),
        writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
        probe: () => Promise.resolve({ healthy: true }),
        listMcp: () => Promise.resolve({ servers: [{ id: 'echo', command: 'echo', args: ['hi'], env: { A: 'b' } }], unresolved: [] }),
        writeMcp: () => Promise.resolve({ unresolved: [] }),
      }} locale="en" mode="production" />)
    })
    await flush()
    await act(async () => {
      const fromPi = [...host.querySelectorAll('button')].find(button => button.textContent === 'From Pi')
      fromPi?.click()
      await Promise.resolve()
    })
    await act(async () => {
      const paste = [...host.querySelectorAll('button')].find(button => button.textContent === 'Paste')
      paste?.click()
    })
    await act(async () => {
      const recognize = [...host.querySelectorAll('button')].find(button => button.textContent === 'Recognize')
      recognize?.click()
    })
    await act(async () => {
      host.querySelector('button[aria-label="Edit server"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      const http = [...host.querySelectorAll('button')].find(button => button.textContent === 'HTTP')
      http?.click()
      const sse = [...host.querySelectorAll('button')].find(button => button.textContent === 'SSE')
      sse?.click()
      const local = [...host.querySelectorAll('button')].find(button => button.textContent === 'Local command')
      local?.click()
    })
    root.unmount()
    host.remove()
  })
})

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function closeOverlay(host: HTMLElement): void {
  host.querySelector('.fixed.inset-0')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function fill(host: HTMLElement, hint: string, value: string): void {
  const input = [...host.querySelectorAll('input')].find(item => item.placeholder === hint)
  if (!(input instanceof HTMLInputElement)) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
