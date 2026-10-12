/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attemptCard, UpdateDialog, type UpdateCard, type UpdateSkillActions } from '../src/settings/update-dialog.tsx'

const status = {
  skillId: 'mohou-mini-app',
  version: '1.0.17',
  agents: [{
    id: 'claude',
    label: 'Claude',
    skillsDir: '/Users/me/.claude/skills',
    homePresent: true,
    dest: '/Users/me/.claude/skills/mohou-mini-app',
    installed: true,
    updateAvailable: true,
    version: '1.0.16',
  }, {
    id: 'kiro',
    label: 'Kiro',
    skillsDir: '/Users/me/.kiro/skills',
    homePresent: false,
    dest: '/Users/me/.kiro/skills/mohou-mini-app',
    installed: false,
    updateAvailable: false,
    version: null,
  }],
  customs: [],
}

beforeEach(() => {
  installMemoryStorage()
})

afterEach(() => {
  vi.useRealTimers()
  delete document.documentElement.dataset.mode
  localStorage.removeItem('mini-app.panel.skill-agents')
  localStorage.removeItem('mini-app.panel.skill-dirs')
})

describe('UpdateDialog', () => {
  it('offers the version and installs the one it names', async () => {
    const installed: string[] = []
    const { host, root } = await render(
      { kind: 'offer', current: '1.0.16', latest: '1.0.17', channel: 'tarball' },
      { onInstall: version => installed.push(version) },
    )
    expect(host.textContent).toContain('Update available')
    expect(host.textContent).toContain('1.0.16')
    expect(host.textContent).toContain('1.0.17')
    expect(host.textContent).toContain('Local package')
    expect(host.textContent).toContain('Do not close it.')
    await click(host, 'Install update')
    expect(installed).toEqual(['1.0.17'])
    await unmount(root, host)
  })

  it('counts an install up and cannot be dismissed while it runs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'))
    let closed = 0
    const { host, root } = await render(
      { kind: 'installing', version: '1.0.17', startedAt: Date.now() },
      { onClose: () => { closed += 1 } },
    )
    expect(host.textContent).toContain('Installing 1.0.17')
    expect(host.textContent).toContain('0:00 elapsed')
    await act(async () => { vi.advanceTimersByTime(65_000) })
    expect(host.textContent).toContain('1:05 elapsed')
    await act(async () => { host.querySelector('.fixed')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(closed).toBe(0)
    await unmount(root, host)
  })

  it('names the reason, the version it fell back to, and the log', async () => {
    const installed: string[] = []
    const { host, root } = await render(
      { kind: 'failed', reason: { code: 'exit', exitCode: 1 }, target: '1.0.17', back: '1.0.16', log: '/tmp/update.log' },
      { onInstall: version => installed.push(version) },
    )
    expect(host.textContent).toContain('The update did not finish')
    expect(host.textContent).toContain('The installer exited with code 1.')
    expect(host.textContent).toContain('Back on 1.0.16, still running.')
    expect(host.textContent).toContain('/tmp/update.log')
    await click(host, 'Install again')
    expect(installed).toEqual(['1.0.17'])
    await unmount(root, host)
  })

  it('confirms the version that is running now', async () => {
    const { host, root } = await render({ kind: 'done', version: '1.0.17' })
    expect(host.textContent).toContain('Updated to 1.0.17')
    expect(host.textContent).toContain('The new version is running.')
    expect(host.textContent).toContain('Update it in Settings → Agent, or update it here.')
    await unmount(root, host)
  })

  it('updates the writing skill from the assistants already chosen', async () => {
    localStorage.setItem('mini-app.panel.skill-agents', JSON.stringify(['claude']))
    localStorage.setItem('mini-app.panel.skill-dirs', JSON.stringify(['~/extra/skills']))
    const installed: Array<{ ids: readonly string[]; dirs: readonly string[] }> = []
    const after = {
      ...status,
      agents: status.agents.map(agent => agent.id === 'claude'
        ? { ...agent, updateAvailable: false, version: '1.0.17' }
        : agent),
    }
    const skill = {
      readSkill: async () => status,
      installSkill: async (ids: readonly string[], dirs: readonly string[]) => {
        installed.push({ ids, dirs })
        return after
      },
    }
    const { host, root } = await render({ kind: 'done', version: '1.0.17' }, { skill })
    expect(host.textContent).toContain('Choose assistants')
    expect(host.querySelector('details')?.open).toBe(false)
    // Open the list first so a stale read is on screen, then the one-click install must replace it.
    await act(async () => {
      const summary = host.querySelector('details summary')
      summary?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Update available')
    expect(host.textContent).toContain('1.0.16')
    await click(host, 'Update writing skill')
    expect(installed).toEqual([{ ids: ['claude'], dirs: ['~/extra/skills'] }])
    expect(host.textContent).toContain('Installed')
    expect(host.textContent).toContain('1.0.17')
    expect(host.textContent).not.toContain('Update available')
    expect(host.textContent).not.toContain('1.0.16')
    await unmount(root, host)
  })

  it('uses assistants whose home exists when nothing was chosen, and names a failed install', async () => {
    localStorage.removeItem('mini-app.panel.skill-agents')
    localStorage.removeItem('mini-app.panel.skill-dirs')
    const installed: string[][] = []
    const { host, root } = await render({ kind: 'done', version: '1.0.17' }, {
      skill: {
        readSkill: async () => status,
        installSkill: async (ids) => {
          installed.push([...ids])
          throw new Error('disk')
        },
      },
    })
    await click(host, 'Update writing skill')
    expect(installed).toEqual([['claude']])
    expect(host.textContent).toContain('The skill could not be installed.')
    await unmount(root, host)
  })

  it('renders every state in both locales and both themes', async () => {
    const cards: readonly UpdateCard[] = [
      { kind: 'offer', current: '1.0.16', latest: '1.0.17', channel: 'registry' },
      { kind: 'installing', version: '1.0.17', startedAt: Date.now() },
      { kind: 'failed', reason: { code: 'timeout' }, back: '1.0.16' },
      { kind: 'failed', reason: { text: 'update install needs an app prefix' } },
      { kind: 'done', version: '1.0.17' },
    ]
    for (const mode of ['light', 'dark'] as const) {
      document.documentElement.dataset.mode = mode
      for (const card of cards) {
        for (const locale of ['en', 'zh-CN'] as const) {
          // `development` throws on a label one locale is missing.
          const { host, root } = await render(card, {
            locale,
            mode: 'development',
            ...card.kind === 'done' ? { skill: { readSkill: async () => status, installSkill: async () => status } } : {},
          })
          expect(host.textContent).not.toBe('')
          expect(host.querySelector('[class*="bg-white"], [class*="text-black"], [class*="bg-black"]')).toBeNull()
          await unmount(root, host)
        }
      }
    }
  })
})

describe('attemptCard', () => {
  it('reads a recorded failure', () => {
    expect(attemptCard({
      state: 'failed',
      code: 'timeout',
      from: '1.0.16',
      to: '1.0.17',
      rolledBack: true,
      log: '/tmp/update.log',
      at: 1,
    }, '1.0.16')).toEqual({
      kind: 'failed',
      reason: { code: 'timeout' },
      target: '1.0.17',
      back: '1.0.16',
      log: '/tmp/update.log',
    })
  })

  it('reads a recorded success and falls back to the running version', () => {
    expect(attemptCard({ state: 'done', to: '1.0.17', at: 1 }, '1.0.16')).toEqual({ kind: 'done', version: '1.0.17' })
    expect(attemptCard({ state: 'done', at: 1 }, '1.0.16')).toEqual({ kind: 'done', version: '1.0.16' })
  })

  it('keeps a failure that did not roll back without a version to name', () => {
    expect(attemptCard({
      state: 'failed',
      code: 'prepare',
      rolledBack: false,
      at: 1,
    }, '1.0.16')).toEqual({ kind: 'failed', reason: { code: 'prepare' } })
  })
})

async function render(
  card: UpdateCard,
  overrides: {
    readonly locale?: 'en' | 'zh-CN'
    readonly mode?: 'development' | 'production'
    readonly onClose?: () => void
    readonly onInstall?: (version: string) => void
    readonly skill?: UpdateSkillActions
  } = {},
): Promise<{ readonly host: HTMLElement; readonly root: ReturnType<typeof createRoot> }> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<UpdateDialog
      locale={overrides.locale ?? 'en'}
      mode={overrides.mode ?? 'production'}
      card={card}
      onClose={overrides.onClose ?? (() => undefined)}
      onInstall={overrides.onInstall ?? (() => undefined)}
      {...overrides.skill === undefined ? {} : { skill: overrides.skill }}
    />)
  })
  return { host, root }
}

async function click(host: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    ;[...host.querySelectorAll('button')].find(button => button.textContent === text)?.click()
    await Promise.resolve()
  })
}

async function unmount(root: ReturnType<typeof createRoot>, host: HTMLElement): Promise<void> {
  await act(async () => { root.unmount() })
  host.remove()
}

function installMemoryStorage(): void {
  const memory = new Map<string, string>()
  const storage = {
    getItem(key: string): string | null {
      const value = memory.get(key)
      return value === undefined ? null : value
    },
    setItem(key: string, value: string): void {
      memory.set(key, String(value))
    },
    removeItem(key: string): void {
      memory.delete(key)
    },
    clear(): void {
      memory.clear()
    },
    key(index: number): string | null {
      return [...memory.keys()][index] ?? null
    },
    get length(): number {
      return memory.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
}
