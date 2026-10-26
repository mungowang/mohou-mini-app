import { describe, expect, it } from 'vitest'

import type { GalleryApp } from '../src/gallery/list.ts'
import { chordLabel, isPaletteChord, isTabSwitchChord, matchPanelChord, tabSwitchChordLabel } from '../src/palette/chord.ts'
import { rankApps, rankPalette } from '../src/palette/rank.ts'

const lab: GalleryApp = {
  id: 'com.mohou.lab',
  name: '实验台',
  description: '模型、工具、图片识别',
  version: '1.0.47',
  acronym: '实',
  tags: ['vision'],
  spelling: { name: { full: 'shiyantai', initials: 'syt' } },
}
const chart: GalleryApp = {
  id: 'com.example.chart',
  name: '识图',
  description: '粘贴截图',
  version: '1',
  acronym: '识',
  spelling: { name: { full: 'shitu', initials: 'st' } },
}
const standup: GalleryApp = {
  id: 'com.example.standup',
  name: '每日站会',
  description: 'Daily standup review',
  version: '1',
  acronym: 'SU',
}
const desk: GalleryApp = {
  id: 'com.pwang.desk',
  name: '桌面',
  description: '自定义首页',
  version: '1.0.0',
  acronym: '桌',
  spelling: { name: { full: 'zhuomian', initials: 'zm' } },
}

describe('palette chord', () => {
  it('accepts Command or Ctrl with Shift+P, and not Alt', () => {
    expect(isPaletteChord({ key: 'p', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false })).toBe(true)
    expect(isPaletteChord({ key: 'P', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true })).toBe(true)
    expect(isPaletteChord({ key: 'p', shiftKey: true, altKey: true, metaKey: true, ctrlKey: false })).toBe(false)
    expect(isPaletteChord({ key: 'p', shiftKey: false, altKey: false, metaKey: true, ctrlKey: false })).toBe(false)
    expect(chordLabel(true)).toBe('⌘⇧P')
    expect(chordLabel(false)).toBe('Ctrl+Shift+P')
  })

  it('accepts Mod+Shift+Arrow for tab switch, like the palette chord', () => {
    expect(isTabSwitchChord({ key: 'ArrowLeft', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true })).toBe(true)
    expect(isTabSwitchChord({ key: 'ArrowRight', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false })).toBe(true)
    expect(isTabSwitchChord({ key: 'ArrowLeft', shiftKey: true, altKey: true, metaKey: false, ctrlKey: true })).toBe(false)
    expect(isTabSwitchChord({ key: 'ArrowLeft', shiftKey: false, altKey: false, metaKey: true, ctrlKey: false })).toBe(false)
    expect(isTabSwitchChord({ key: 'ArrowLeft', shiftKey: false, altKey: false, metaKey: false, ctrlKey: false })).toBe(false)
    expect(matchPanelChord({ key: 'ArrowLeft', shiftKey: true, altKey: false, metaKey: true, ctrlKey: false }))
      .toEqual({ kind: 'tab-switch', direction: 'prev' })
    expect(matchPanelChord({ key: 'ArrowRight', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true }))
      .toEqual({ kind: 'tab-switch', direction: 'next' })
    expect(matchPanelChord({ key: 'ArrowUp', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true })).toBeUndefined()
    expect(matchPanelChord({ key: 'a', shiftKey: true, altKey: false, metaKey: false, ctrlKey: true })).toBeUndefined()
    expect(matchPanelChord({ key: 'p', shiftKey: true, altKey: false, metaKey: false, ctrlKey: false })).toBeUndefined()
    expect(tabSwitchChordLabel(true)).toBe('⌘⇧← →')
    expect(tabSwitchChordLabel(false)).toBe('Ctrl+Shift+← →')
  })
})

describe('rankApps', () => {
  it('puts a name hit above a description hit, and does not match the library hint', () => {
    expect(rankApps([standup, chart], 'st', new Set()).map(hit => hit.app.id)).toEqual(['com.example.chart', 'com.example.standup'])
    expect(rankApps([standup, chart], 'st', new Set())[0]?.why).toBe('initials')
    expect(rankApps([desk, lab], 'syt', new Set()).map(hit => hit.app.id)).toEqual(['com.mohou.lab'])
    expect(rankApps([desk, lab], 'lab', new Set()).map(hit => hit.app.id)).toEqual(['com.mohou.lab'])
    expect(rankApps([desk, lab], 'vision', new Set()).map(hit => hit.app.id)).toEqual(['com.mohou.lab'])
    expect(rankApps([desk, lab], '', new Set(['com.pwang.desk'])).map(hit => hit.app.id)).toEqual(['com.pwang.desk', 'com.mohou.lab'])
    expect(rankApps([lab], '1', new Set())).toEqual([])
    expect(rankApps([lab], '1.0', new Set()).map(hit => hit.app.id)).toEqual(['com.mohou.lab'])
    const rows = rankPalette([standup, chart], 'st', new Set(), ['小程序库', 'Library'])
    expect(rows.some(row => row.kind === 'library')).toBe(false)
    const titled = rankPalette([standup], '程序库', new Set(), ['小程序库', 'Library'])
    expect(titled[0]?.kind).toBe('library')
  })
})
