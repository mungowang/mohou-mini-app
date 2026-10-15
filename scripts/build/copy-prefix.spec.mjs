import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { copyInstallPrefix } from './copy-prefix.mjs'

const fixtures = []

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('copyInstallPrefix', () => {
  it('keeps bin links inside the prefix after the stage tree is gone', () => {
    const root = mkdtempSync(join(tmpdir(), 'mohou-prefix-'))
    fixtures.push(root)
    const src = join(root, 'stage')
    const pkgBin = join(src, 'node_modules/pkg/bin.js')
    mkdirSync(join(src, 'node_modules/.bin'), { recursive: true })
    mkdirSync(join(src, 'node_modules/pkg'), { recursive: true })
    writeFileSync(pkgBin, 'bin\n')
    symlinkSync('../pkg/bin.js', join(src, 'node_modules/.bin/rel'))
    symlinkSync(pkgBin, join(src, 'node_modules/.bin/abs'))
    const outside = join(root, 'outside.js')
    writeFileSync(outside, 'out\n')
    symlinkSync(outside, join(src, 'node_modules/.bin/out'))

    const shipped = join(root, 'shipped')
    copyInstallPrefix(src, shipped)
    rmSync(src, { recursive: true, force: true })
    const prefix = join(root, 'Applications/prefix')
    mkdirSync(join(root, 'Applications'), { recursive: true })
    renameSync(shipped, prefix)

    expect(readlinkSync(join(prefix, 'node_modules/.bin/rel'))).toBe('../pkg/bin.js')
    expect(readlinkSync(join(prefix, 'node_modules/.bin/abs'))).toBe('../pkg/bin.js')
    expect(readFileSync(join(prefix, 'node_modules/.bin/rel'), 'utf8')).toBe('bin\n')
    expect(readFileSync(join(prefix, 'node_modules/.bin/abs'), 'utf8')).toBe('bin\n')
    expect(readlinkSync(join(prefix, 'node_modules/.bin/out'))).toBe(outside)
  })
})
