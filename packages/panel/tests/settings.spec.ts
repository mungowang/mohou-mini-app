import { describe, expect, it } from 'vitest'

import type { PanelPolicy, PanelSettingsClient } from '../src/settings/client.ts'
import { reduceSettings, settingsDraft, settingsState } from '../src/settings/state.ts'

const policy: PanelPolicy = {
  theme: 'light',
  palette: 'default',
  locale: 'en',
  chatLanguage: 'en',
  hostPort: 9743,
  llm: null,
  runtimeProvider: { id: 'echo' },
}

describe('settings form', () => {
  it('rejects an illegal port before write and keeps a rejected save dirty', () => {
    let state = reduceSettings(settingsState(), { type: 'loaded', policy })
    expect(state.dirty).toBe(false)
    state = reduceSettings(state, { type: 'edit-port', port: '80' })
    expect(settingsDraft(state)).toEqual({ ok: false, key: 'port-invalid' })
    state = reduceSettings(state, { type: 'port-invalid' })
    expect(state.portError).toBe(true)
    expect(state.dirty).toBe(true)
    state = reduceSettings(state, { type: 'edit-port', port: '2000' })
    state = reduceSettings(state, { type: 'edit-locale', locale: 'zh-CN' })
    const draft = settingsDraft(state)
    expect(draft).toMatchObject({ ok: true, policy: { hostPort: 2000, locale: 'zh-CN', chatLanguage: 'zh-CN' } })
    state = reduceSettings(state, { type: 'save-failed' })
    expect(state.dirty).toBe(true)
    expect(state.saveError).toBe(true)
    expect(reduceSettings(state, { type: 'save-failed', message: 'no' }).saveMessage).toBe('no')
    expect(reduceSettings(reduceSettings(state, { type: 'save-failed', message: 'no' }), { type: 'save-failed' }).saveMessage).toBeUndefined()
    state = reduceSettings(state, { type: 'escape' })
    expect(state.pending).toBe('close')
    expect(state.closed).toBe(false)
    state = reduceSettings(state, { type: 'escape' })
    expect(state.pending).toBeUndefined()
    state = reduceSettings(state, { type: 'restore' })
    expect(state.pending).toBe('restore')
    state = reduceSettings(state, { type: 'confirm' })
    expect(state.palette).toBe(policy.palette)
    expect(state.dirty).toBe(false)
    state = reduceSettings(state, { type: 'edit-palette', palette: 'ink' })
    state = reduceSettings(state, { type: 'escape' })
    state = reduceSettings(state, { type: 'confirm' })
    expect(state.closed).toBe(true)
    state = reduceSettings(reduceSettings(settingsState(), { type: 'loaded', policy }), {
      type: 'saved',
      result: { policy: { ...policy, hostPort: policy.hostPort + 1 }, restartRequired: true },
    })
    expect(state.dirty).toBe(false)
    expect(state.restartRequired).toBe(true)
    expect(state.restartPort).toBe(true)
    expect(state.restartRuntime).toBe(false)
    state = reduceSettings(state, {
      type: 'saved',
      result: { policy: { ...policy, hostPort: state.saved!.hostPort, runtimeProvider: { id: 'other' } }, restartRequired: true },
    })
    expect(state.restartRequired).toBe(true)
    expect(state.restartPort).toBe(false)
    expect(state.restartRuntime).toBe(true)
    // Parent hostPolicy sync after save must keep the restart CTA.
    state = reduceSettings(state, {
      type: 'host-policy',
      policy: { ...policy, hostPort: state.saved!.hostPort, runtimeProvider: { id: 'other' } },
    })
    expect(state.restartRequired).toBe(true)
    expect(state.restartRuntime).toBe(true)
    const synced = reduceSettings(reduceSettings(settingsState(), { type: 'loaded', policy }), {
      type: 'host-policy',
      policy: { ...policy, theme: 'dark', palette: 'ink' },
    })
    expect(synced.theme).toBe('dark')
    expect(synced.palette).toBe('ink')
    expect(synced.restartRequired).toBe(false)
    let dirtyClose = reduceSettings(reduceSettings(settingsState(), { type: 'loaded', policy }), {
      type: 'edit-theme',
      theme: 'dark',
    })
    dirtyClose = reduceSettings(dirtyClose, { type: 'escape' })
    expect(dirtyClose.pending).toBe('close')
    dirtyClose = reduceSettings(dirtyClose, { type: 'confirm' })
    expect(dirtyClose.closed).toBe(true)
    expect(dirtyClose.theme).toBe(policy.theme)
    expect(dirtyClose.dirty).toBe(false)
    state = reduceSettings(state, { type: 'escape' })
    expect(state.closed).toBe(true)
    expect(reduceSettings(settingsState(), { type: 'restore' })).toEqual(settingsState())
    expect(reduceSettings(settingsState(), { type: 'confirm' })).toEqual(settingsState())
    const clean = reduceSettings(settingsState(), { type: 'loaded', policy })
    expect(reduceSettings(clean, { type: 'restore' }).dirty).toBe(false)
  })

  it('does not call write when the port is illegal', async () => {
    let wrote = false
    const client: PanelSettingsClient = {
      readPolicy: () => Promise.resolve(policy),
      writePolicy: () => {
        wrote = true
        return Promise.resolve({ policy, restartRequired: false })
      },
      probe: () => Promise.resolve({ healthy: true }),
    }
    const state = reduceSettings(reduceSettings(settingsState(), { type: 'loaded', policy }), { type: 'edit-port', port: '1' })
    const draft = settingsDraft(state)
    if (draft.ok) await client.writePolicy(draft.policy)
    expect(wrote).toBe(false)
    const loaded = reduceSettings(settingsState(), { type: 'loaded', policy })
    const themed = reduceSettings(loaded, { type: 'edit-theme', theme: 'dark' })
    const modeled = reduceSettings(themed, { type: 'edit-model', provider: 'echo', model: 'one' })
    expect(settingsDraft(modeled)).toMatchObject({ ok: true, policy: { theme: 'dark', llm: { provider: 'echo', model: 'one' } } })
    expect(settingsDraft(reduceSettings(loaded, { type: 'edit-locale', locale: 'fr' }))).toEqual({ ok: false, key: 'save-blocked' })

    // The update registry rides the same draft: an empty value means the packaged default.
    const withRegistry = reduceSettings(loaded, { type: 'edit-registry', registry: 'https://registry.npmmirror.com' })
    expect(settingsDraft(withRegistry)).toMatchObject({ ok: true, policy: { updateRegistry: 'https://registry.npmmirror.com' } })
    const bad = reduceSettings(loaded, { type: 'edit-registry', registry: 'http://mirror.example.com' })
    expect(settingsDraft(bad)).toEqual({ ok: false, key: 'registry-invalid' })
    expect(reduceSettings(bad, { type: 'registry-invalid' }).registryError).toBe(true)
    const cleared = reduceSettings(withRegistry, { type: 'edit-registry', registry: '' })
    expect(settingsDraft(cleared)).toMatchObject({ ok: true, policy: { updateRegistry: '' } })
    expect(reduceSettings(loaded, { type: 'probed', message: 'ok' }).probe).toBe('ok')
    expect(reduceSettings(loaded, { type: 'edit-provider', providerId: 'other' }).providerId).toBe('other')
    expect(reduceSettings(loaded, { type: 'edit-palette', palette: 'ink' }).palette).toBe('ink')
  })
})
