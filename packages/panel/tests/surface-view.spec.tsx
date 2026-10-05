/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import type { PanelClient } from '../src/gallery/client.ts'
import type { HistoryClient } from '../src/history/client.ts'
import type { PanelSettingsClient } from '../src/settings/client.ts'
import type { StorageClient } from '../src/storage/client.ts'
import { PanelSurface, type PanelControls } from '../src/surface/view.tsx'
import type { ThemeClient } from '../src/theme/client.ts'

describe('PanelSurface', () => {
  it('hides sections without a client and opens the app Shell names', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let controls: PanelControls | undefined
    await act(async () => {
      root.render(<PanelSurface
        client={client()}
        locale="en"
        mode="production"
        shell="standalone"
        onControls={(value) => { controls = value }}
      />)
    })
    expect(host.textContent).toContain('Library')
    expect(document.title).toBe('Mohou')
    expect(host.textContent).not.toContain('Settings')
    await act(async () => {
      controls?.showApp('com.example.todo', 'Todo')
    })
    expect(host.textContent).toContain('Todo')
    await act(async () => {
      controls?.unavailable('com.example.todo')
    })
    expect(host.textContent).toContain('Host is unreachable')
    root.unmount()
    host.remove()
  })

  it('shows the other sections when their clients exist', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let controls: PanelControls | undefined
    let closed = false
    await act(async () => {
      root.render(<PanelSurface
        client={client()}
        settings={settings()}
        history={history()}
        storage={storage()}
        theme={theme()}
        appId="com.example.todo"
        locale="en"
        mode="production"
        shell="overlay"
        versions="0.0.0"
        onClosePanel={() => {
          closed = true
        }}
        onControls={(value) => { controls = value }}
      />)
    })
    expect(host.textContent).toContain('Close panel')
    const close = [...host.querySelectorAll('button')].find(item => item.textContent === 'Close panel')
    await act(async () => {
      close?.click()
    })
    expect(closed).toBe(true)
    expect(host.textContent).toContain('Settings')
    await act(async () => {
      controls?.showApp('com.example.todo', 'Todo')
    })
    for (const name of ['Settings', 'History', 'Theme', 'Storage']) {
      const button = [...host.querySelectorAll('button')].find(item => item.textContent === name)
      await act(async () => {
        button?.click()
      })
      if (name === 'Settings') {
        const about = host.querySelector('button[data-nav="about"]')
        await act(async () => {
          about?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        expect(host.textContent).toContain('0.0.0')
        expect(host.textContent).toContain('Mohou')
        expect(host.textContent).toContain('grind ink')
      }
    }
    await act(async () => {
      controls?.showNotice('com.example.todo', 'kv')
    })
    expect(host.textContent).toContain('kv')
    root.unmount()
    host.remove()
  })

  it('reads history for the focused app, not the injected id', async () => {
    const seen: string[] = []
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let controls: PanelControls | undefined
    await act(async () => {
      root.render(<PanelSurface
        client={client()}
        history={{
          readHistory: (appId) => {
            seen.push(appId)
            return new Promise(() => undefined)
          },
          readCommit: () => new Promise(() => undefined),
        }}
        appId="com.example.todo"
        locale="en"
        mode="production"
        shell="standalone"
        onControls={(value) => { controls = value }}
      />)
    })
    await act(async () => {
      controls?.showApp('com.example.other', 'Other')
    })
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'History')
    await act(async () => {
      button?.click()
    })
    expect(seen).toEqual(['com.example.other'])
    root.unmount()
    host.remove()
  })

  it('shows the default workbench in the slot and clears it from the host event', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let controls: PanelControls | undefined
    const policy = {
      theme: 'light' as const,
      palette: 'default',
      locale: 'en' as const,
      chatLanguage: 'en',
      hostPort: 9743,
      llm: null,
      runtimeProvider: { id: 'echo' },
      defaultWorkbenchId: 'com.example.desk',
    }
    await act(async () => {
      root.render(<PanelSurface
        client={{
          list: () => Promise.resolve([{ id: 'com.example.desk', name: 'Desk', description: 'Home', version: '1', acronym: 'DE', kind: 'workbench' }]),
          open: () => Promise.resolve(),
          deleteApp: () => Promise.resolve(),
        }}
        settings={{
          readPolicy: () => Promise.resolve(policy),
          writePolicy: () => Promise.resolve({ policy, restartRequired: false }),
          probe: () => Promise.resolve({ healthy: true }),
        }}
        locale="en"
        mode="production"
        shell="standalone"
        frame={() => <span>desk-frame</span>}
        onControls={(value) => { controls = value }}
      />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.textContent).toContain('desk-frame')
    const written: Array<string | undefined> = []
    await act(async () => {
      controls?.setWorkbench('default')
    })
    expect(host.textContent).toContain('Library')
    root.unmount()
    host.remove()
    const host2 = document.createElement('div')
    document.body.append(host2)
    const root2 = createRoot(host2)
    await act(async () => {
      root2.render(<PanelSurface
        client={{
          list: () => Promise.resolve([{ id: 'com.example.desk', name: 'Desk', description: 'Home', version: '1', acronym: 'DE', kind: 'workbench' }]),
          open: () => Promise.resolve(),
          deleteApp: () => Promise.resolve(),
        }}
        settings={{
          readPolicy: () => Promise.resolve(policy),
          writePolicy: (next) => {
            written.push(next.defaultWorkbenchId)
            const { defaultWorkbenchId: stored, ...rest } = next
            void stored
            return Promise.resolve({ policy: next.defaultWorkbenchId === 'default' ? rest : next, restartRequired: false })
          },
          probe: () => Promise.resolve({ healthy: true }),
        }}
        locale="en"
        mode="production"
        shell="standalone"
        frame={() => <span>desk-frame</span>}
      />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    const back = [...host2.querySelectorAll('button')].find(item => item.textContent === 'Library')
    await act(async () => {
      back?.click()
      await Promise.resolve()
    })
    expect(written).toEqual(['default'])
    expect(host2.textContent).toContain('Library')
    expect(host2.textContent).not.toContain('desk-frame')
    root2.unmount()
    host2.remove()
  })
})

function client(): PanelClient {
  return {
    list: () => new Promise(() => undefined),
    open: () => Promise.resolve(),
    deleteApp: () => Promise.resolve(),
  }
}

it('asks to install an update found on open', async () => {
  sessionStorage.clear()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const offer = {
    name: '@mohou/shell',
    current: '1.0.0',
    latest: '1.1.0',
    updateAvailable: true,
    installable: true,
    channel: 'tarball' as const,
  }
  await act(async () => {
    root.render(<PanelSurface
      client={client()}
      locale="en"
      mode="production"
      shell="standalone"
      settings={{
        ...settings(),
        checkUpdate: () => Promise.resolve(offer),
        installUpdate: () => pending(),
      }}
    />)
  })
  await act(async () => { await Promise.resolve() })
  expect(host.textContent).toContain('Update available')
  await act(async () => {
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Install update')?.click()
    await Promise.resolve()
  })
  expect(host.textContent).toContain('Installing 1.1.0')
  expect(host.textContent).toContain('0:00 elapsed')
  root.unmount()

  const refused = document.createElement('div')
  document.body.append(refused)
  const second = createRoot(refused)
  await act(async () => {
    second.render(<PanelSurface
      client={client()}
      locale="en"
      mode="production"
      shell="standalone"
      settings={{
        ...settings(),
        checkUpdate: () => Promise.resolve(offer),
        installUpdate: () => Promise.reject(new Error('update install needs an app prefix')),
      }}
    />)
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => {
    ;[...refused.querySelectorAll('button')].find(button => button.textContent === 'Install update')?.click()
    await Promise.resolve()
  })
  expect(refused.textContent).toContain('The update did not finish')
  expect(refused.textContent).toContain('update install needs an app prefix')
  await act(async () => {
    ;[...refused.querySelectorAll('button')].find(button => button.textContent === 'Close')?.click()
  })
  expect(refused.textContent).not.toContain('The update did not finish')
  second.unmount()
  host.remove()
  refused.remove()
})

it('shows the outcome the launcher recorded, acknowledges it, and offers again after that', async () => {
  sessionStorage.clear()
  const acked: number[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const check = {
    name: '@mohou/shell',
    current: '1.0.16',
    latest: '1.0.17',
    updateAvailable: true,
    installable: true,
    lastAttempt: {
      state: 'failed' as const,
      code: 'timeout' as const,
      from: '1.0.16',
      to: '1.0.17',
      rolledBack: true,
      log: '/tmp/update.log',
      at: 1_000,
    },
  }
  await act(async () => {
    root.render(<PanelSurface
      client={client()}
      locale="en"
      mode="production"
      shell="standalone"
      settings={{
        ...settings(),
        checkUpdate: () => Promise.resolve(check),
        ackUpdate: (at) => { acked.push(at); return Promise.resolve() },
      }}
    />)
  })
  const offerOnly = {
    name: '@mohou/shell',
    current: '1.0.16',
    latest: '1.0.17',
    updateAvailable: true,
    installable: true,
  }
  await act(async () => { await Promise.resolve() })
  expect(host.textContent).toContain('The update did not finish')
  expect(host.textContent).toContain('The install ran past two minutes.')
  expect(host.textContent).toContain('Back on 1.0.16, still running.')
  expect(host.textContent).not.toContain('Update available')
  expect(acked).toEqual([1_000])
  root.unmount()

  const again = document.createElement('div')
  document.body.append(again)
  const next = createRoot(again)
  await act(async () => {
    next.render(<PanelSurface
      client={client()}
      locale="en"
      mode="production"
      shell="standalone"
      settings={{
        ...settings(),
        checkUpdate: () => Promise.resolve(offerOnly),
      }}
    />)
  })
  await act(async () => { await Promise.resolve() })
  expect(again.textContent).not.toContain('The update did not finish')
  expect(again.textContent).toContain('Update available')
  await act(async () => {
    ;[...again.querySelectorAll('button')].find(button => button.textContent === 'Cancel')?.click()
  })
  expect(sessionStorage.getItem('mini-app.update-dismissed')).toBe('1.0.17')
  next.unmount()
  host.remove()
  again.remove()
})

function pending<T>(): Promise<T> {
  return new Promise(() => undefined)
}

function settings(): PanelSettingsClient {
  return {
    readPolicy: () => pending(),
    writePolicy: () => pending(),
    probe: () => pending(),
  }
}

function history(): HistoryClient {
  return {
    readHistory: () => pending(),
    readCommit: () => pending(),
  }
}

function storage(): StorageClient {
  return {
    readStorage: () => pending(),
    readTable: () => pending(),
  }
}

function theme(): ThemeClient {
  return {
    listPalettes: () => pending(),
    setPin: () => pending(),
  }
}
