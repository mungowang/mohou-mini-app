import { describe, expect, it } from 'vitest'

import { ContractError, assertImportAllowed, defineApp, parseAppId, resolveManifest, workbenchEntries } from '../src/index.ts'

const manifest = {
  id: 'com.example.app',
  name: 'Example',
  description: 'One line',
  version: '1',
  entry: 'ui.tsx',
}

describe('parseAppId', () => {
  it('admits a reverse-DNS id', () => {
    expect(parseAppId('com.example.app')).toBe('com.example.app')
  })

  it('rejects a bare name by code', () => {
    expect(() => parseAppId('example')).toThrow(ContractError)
    try {
      parseAppId('example')
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError)
      expect((error as ContractError).code).toBe('app-id-invalid')
    }
  })
})

describe('resolveManifest', () => {
  it('returns a frozen-shape manifest when the directory matches', () => {
    expect(resolveManifest(manifest, 'com.example.app').entry).toBe('ui.tsx')
  })

  it('rejects a missing name', () => {
    expect(() => resolveManifest({ ...manifest, name: '' }, 'com.example.app')).toThrow(ContractError)
  })

  it('rejects an id that does not match the directory', () => {
    expect(() => resolveManifest(manifest, 'com.other.app')).toThrow(ContractError)
  })

  it('rejects a non-object, a bad entry, a bad id, and a bad acronym', () => {
    expect(() => resolveManifest(null, 'com.example.app')).toThrow(ContractError)
    expect(() => resolveManifest({ ...manifest, entry: 'ui.ts' }, 'com.example.app')).toThrow(ContractError)
    expect(() => resolveManifest({ ...manifest, id: 'nope' }, 'nope')).toThrow(ContractError)
    expect(() => resolveManifest({ ...manifest, acronym: 'ABC' }, 'com.example.app')).toThrow(ContractError)
    expect(resolveManifest({ ...manifest, acronym: 'Ex' }, 'com.example.app').acronym).toBe('Ex')
    expect(resolveManifest({ ...manifest, acronym: '笔记' }, 'com.example.app').acronym).toBe('笔记')
    expect(() => resolveManifest({ ...manifest, acronym: '笔' }, 'com.example.app')).toThrow(ContractError)
  })

  it('admits unique tags and rejects an empty or illegal list', () => {
    expect(resolveManifest({ ...manifest, tags: ['tools', 'tools', 'desk'] }, 'com.example.app').tags).toEqual(['tools', 'desk'])
    expect(resolveManifest(manifest, 'com.example.app').tags).toBeUndefined()
    expect(() => resolveManifest({ ...manifest, tags: [] }, 'com.example.app')).toThrow(ContractError)
    expect(() => resolveManifest({ ...manifest, tags: ['Tools'] }, 'com.example.app')).toThrow(ContractError)
    try {
      resolveManifest({ ...manifest, tags: ['Tools'] }, 'com.example.app')
    } catch (error) {
      expect((error as ContractError).code).toBe('manifest-invalid')
    }
  })

  it('admits a workbench and rejects an unknown kind', () => {
    expect(resolveManifest(manifest, 'com.example.app').kind).toBeUndefined()
    expect(resolveManifest({ ...manifest, kind: 'app' }, 'com.example.app').kind).toBeUndefined()
    expect(resolveManifest({ ...manifest, kind: 'workbench' }, 'com.example.app').kind).toBe('workbench')
    expect(() => resolveManifest({ ...manifest, kind: 'desk' }, 'com.example.app')).toThrow(ContractError)
  })

  it('admits a website with url and rejects a bare website', () => {
    expect(resolveManifest({
      ...manifest,
      kind: 'website',
      url: 'http://127.0.0.1:5173',
    }, 'com.example.app')).toMatchObject({
      kind: 'website',
      url: 'http://127.0.0.1:5173',
    })
    expect(() => resolveManifest({ ...manifest, kind: 'website' }, 'com.example.app')).toThrow(ContractError)
    expect(() => resolveManifest({ ...manifest, url: 'http://127.0.0.1:1' }, 'com.example.app')).toThrow(ContractError)
  })
})

describe('workbenchEntries', () => {
  it('marks the builtin library until a workbench app is stored', () => {
    const apps = [
      { id: 'com.example.todo', name: 'Todo', description: 'A list', version: '1', acronym: 'TO' },
      { id: 'com.example.desk', name: 'Desk', description: 'Home', version: '1', acronym: 'DE', kind: 'workbench' as const },
    ]
    expect(workbenchEntries(apps, undefined, 'Library')[0]).toMatchObject({ id: 'default', default: true })
    expect(workbenchEntries(apps, 'com.example.desk', 'Library')[1]).toMatchObject({ id: 'com.example.desk', default: true })
    expect(workbenchEntries(apps, 'com.example.missing', 'Library')[0]).toMatchObject({ id: 'default', default: true })
  })
})

describe('defineApp', () => {
  it('returns the same object and keeps the declared state type', () => {
    const def = defineApp({
      name: 'Example',
      description: 'One line',
      state: { count: 0 },
      api: {
        inc(ctx) {
          ctx.state.count += 1
          return ctx.state.count
        },
      },
    })
    expect(def.state.count).toBe(0)
  })

  it('keeps the args object the author named', () => {
    const def = defineApp({
      name: 'Example',
      description: 'One line',
      api: {
        open(_ctx, args?: { appId?: string; title?: string }) {
          return args?.appId
        },
      },
    })
    const args: Parameters<typeof def.api.open>[1] = { appId: 'com.example.app', title: 'Desk' }
    type KeepsString = ReturnType<typeof def.api.open> extends string | undefined ? true : never
    const kept: KeepsString = true
    expect(args?.appId).toBe('com.example.app')
    expect(kept).toBe(true)
  })

  it('rejects a missing description, a bad api, a bad state, and a bad host hook by code', () => {
    expect(() => defineApp({ name: 'Example', description: '', api: {} })).toThrow(ContractError)
    expect(() => defineApp({ name: 'Example', description: 'One line', api: [] as never })).toThrow(ContractError)
    expect(() => defineApp({
      name: 'Example',
      description: 'One line',
      api: {},
      state: [] as never,
    })).toThrow(ContractError)
    expect(() => defineApp({
      name: 'Example',
      description: 'One line',
      api: {},
      onHostEvents: 'nope' as never,
    })).toThrow(ContractError)
  })

  it('keeps onHostEvents on the returned object', () => {
    const def = defineApp({
      name: 'Example',
      description: 'One line',
      api: {},
      onHostEvents(ctx, event) {
        ctx.push('desk', event)
      },
    })
    expect(typeof def.onHostEvents).toBe('function')
  })
})

describe('assertImportAllowed', () => {
  it('rejects a path that leaves the app', () => {
    expect(() => {
      assertImportAllowed('../outside', 'ui')
    }).toThrow(ContractError)
  })

  it('rejects a UI import of the backend and allows a relative file', () => {
    expect(() => {
      assertImportAllowed('api/secret.ts', 'ui')
    }).toThrow(ContractError)
    expect(() => {
      assertImportAllowed('./panel.tsx', 'ui')
    }).not.toThrow()
    expect(() => {
      assertImportAllowed('C:/outside.ts', 'ui')
    }).toThrow(ContractError)
    expect(() => {
      assertImportAllowed('ui/panel.tsx', 'backend')
    }).toThrow(ContractError)
    expect(() => {
      assertImportAllowed('api/row.ts', 'shared')
    }).toThrow(ContractError)
    expect(() => {
      assertImportAllowed('././row.ts', 'shared')
    }).not.toThrow()
  })
})
