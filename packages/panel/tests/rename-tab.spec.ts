import { describe, expect, it } from 'vitest'

import { initialTabs, openAppTab, renameAppTab } from '../src/gallery/tabs.ts'
import { reduceSurface, surfaceState } from '../src/surface/state.ts'

describe('rename app tab', () => {
  it('keeps a display title and drops a title that was the old id', () => {
    const titled = openAppTab(initialTabs(), 'com.example.old', 'Old')
    expect(renameAppTab(titled.tabs, 'com.example.old', 'com.example.new').tabs[1]).toEqual({
      kind: 'app',
      appId: 'com.example.new',
      title: 'Old',
    })
    const bare = openAppTab(initialTabs(), 'com.example.old')
    expect(renameAppTab(bare.tabs, 'com.example.old', 'com.example.new').tabs[1]).toEqual({
      kind: 'app',
      appId: 'com.example.new',
    })
    expect(renameAppTab(initialTabs(), 'missing', 'com.example.new')).toEqual(initialTabs())
  })

  it('moves the focused app and ignores a rename of another id', () => {
    const shown = reduceSurface(surfaceState(), { type: 'show-app', appId: 'com.example.old', title: 'Old' })
    const next = reduceSurface(shown, { type: 'rename-app', from: 'com.example.old', to: 'com.example.new' })
    expect(next.focus).toEqual({ appId: 'com.example.new', title: 'Old' })
    expect(next.renamed).toEqual({ from: 'com.example.old', to: 'com.example.new' })
    const other = reduceSurface(shown, { type: 'rename-app', from: 'com.example.other', to: 'com.example.new' })
    expect(other.focus).toEqual(shown.focus)
  })
})
