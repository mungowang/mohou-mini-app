import { describe, expect, it } from 'vitest'

import { spellFields } from '../src/apps/spelling.ts'

describe('spellFields', () => {
  it('keeps a name spelling apart from a description spelling', () => {
    const name = spellFields({ name: '实验台', description: '' })
    expect(name?.name?.full).toContain('shiyantai')
    expect(name?.name?.initials).toContain('syt')
    expect(name?.description).toBeUndefined()
    const both = spellFields({ name: '会计', description: '课表' })
    expect(both?.name?.full).toContain('huiji')
    expect(both?.name?.full).toContain('kuaiji')
    expect(both?.description?.initials).toContain('kb')
    expect(both?.description?.full).not.toContain('kuaiji')
  })

  it('skips a Latin-only value', () => {
    expect(spellFields({ name: 'com.mohou.lab', description: 'schedule' })).toBeUndefined()
    const mixed = spellFields({ name: 'lab', description: '课表' })
    expect(mixed?.description?.full).toContain('kebiao')
    expect(mixed?.description?.full).not.toContain('lab')
    expect(mixed?.name).toBeUndefined()
  })
})
