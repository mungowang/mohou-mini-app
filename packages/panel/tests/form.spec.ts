import { describe, expect, it } from 'vitest'

import { admitPanelPort, admitUpdateRegistry, panelLanguageFields, registryChoice, updateRegistryPresets } from '../src/index.ts'

describe('settings form', () => {
  it('rejects an illegal port before a write and pairs the language fields', () => {
    expect(admitPanelPort(1024)).toEqual({ ok: true, port: 1024 })
    expect(admitPanelPort(65535)).toEqual({ ok: true, port: 65535 })
    expect(admitPanelPort(1023)).toEqual({ ok: false, key: 'port-invalid' })
    expect(admitPanelPort(65536)).toEqual({ ok: false, key: 'port-invalid' })
    expect(admitPanelPort(1.5)).toEqual({ ok: false, key: 'port-invalid' })
    expect(admitPanelPort('8787')).toEqual({ ok: false, key: 'port-invalid' })
    expect(panelLanguageFields('zh-CN')).toEqual({ locale: 'zh-CN', chatLanguage: 'zh-CN' })
    expect(() => panelLanguageFields('fr')).toThrow('panel locale is not supported: fr')
  })

  it('admits a mirror only as a plain https url, and reads a preset back', () => {
    expect(admitUpdateRegistry('')).toEqual({ ok: true, registry: '' })
    expect(admitUpdateRegistry('   ')).toEqual({ ok: true, registry: '' })
    expect(admitUpdateRegistry('  https://registry.npmmirror.com  ')).toEqual({ ok: true, registry: 'https://registry.npmmirror.com' })
    expect(admitUpdateRegistry('http://registry.npmmirror.com')).toEqual({ ok: false, key: 'registry-invalid' })
    expect(admitUpdateRegistry('https://user:secret@registry.example.com')).toEqual({ ok: false, key: 'registry-invalid' })
    expect(admitUpdateRegistry('registry.example.com')).toEqual({ ok: false, key: 'registry-invalid' })
    expect(admitUpdateRegistry('file:///tmp/registry')).toEqual({ ok: false, key: 'registry-invalid' })

    expect(registryChoice('')).toBe('default')
    expect(registryChoice(updateRegistryPresets.npmmirror)).toBe('npmmirror')
    expect(registryChoice(updateRegistryPresets.tencent)).toBe('tencent')
    expect(registryChoice('https://registry.example.com/')).toBe('custom')
  })
})
