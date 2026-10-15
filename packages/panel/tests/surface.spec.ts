import { describe, expect, it } from 'vitest'

import { reduceSurface, surfaceState } from '../src/surface/state.ts'

describe('panel surface', () => {
  it('shows the app the host asked for and a storage notice', () => {
    const shown = reduceSurface(surfaceState(), { type: 'show-app', appId: 'com.example.app', title: 'Todo' })
    expect(shown.section).toBe('gallery')
    expect(shown.focus).toEqual({ appId: 'com.example.app', title: 'Todo' })
    const notice = reduceSurface(shown, { type: 'show-notice', appId: 'com.example.app', table: 'kv' })
    expect(notice.section).toBe('storage')
    expect(notice.notice).toBe('kv')
    expect(notice.focus).toEqual({ appId: 'com.example.app', title: 'Todo' })
    expect(reduceSurface(shown, { type: 'show-notice', appId: 'com.example.other', table: 'kv' }).focus).toEqual({ appId: 'com.example.other' })
    const withTheme = reduceSurface(notice, { type: 'toggle-theme' })
    expect(withTheme.themeOpen).toBe(true)
    expect(withTheme.section).toBe('storage')
    expect(reduceSurface(withTheme, { type: 'section', section: 'settings' }).themeOpen).toBe(false)
    const settings = reduceSurface(surfaceState(), { type: 'section', section: 'settings' })
    expect(reduceSurface(settings, { type: 'toggle-theme' })).toMatchObject({ section: 'settings', themeOpen: true })
    expect(reduceSurface(surfaceState(), { type: 'show-app', appId: 'com.example.app' }).focus).toEqual({ appId: 'com.example.app' })
    const missing = reduceSurface(surfaceState(), { type: 'unavailable', appId: 'com.example.app' })
    expect(missing.unavailable).toBe('com.example.app')
    expect(reduceSurface(missing, { type: 'show-app', appId: 'com.example.app' }).unavailable).toBeUndefined()
  })

  it('select-app moves focus without closing storage', () => {
    const open = reduceSurface(surfaceState(), { type: 'show-app', appId: 'com.example.fuze', title: 'Fuze' })
    const storage = reduceSurface(open, { type: 'show-notice', appId: 'com.example.fuze', table: 'kv' })
    expect(storage.section).toBe('storage')
    const switched = reduceSurface(storage, { type: 'select-app', appId: 'com.example.cask', title: 'Cask' })
    expect(switched.section).toBe('storage')
    expect(switched.focus).toEqual({ appId: 'com.example.cask', title: 'Cask' })
    const home = reduceSurface(switched, { type: 'select-app' })
    expect(home.focus).toBeUndefined()
    expect(home.section).toBe('storage')
  })
})
