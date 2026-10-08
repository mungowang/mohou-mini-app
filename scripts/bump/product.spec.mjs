import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { bumpFailures, bumpProduct, carrierFailures, compareVersions, isVersion } from './product.mjs'

const checkout = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixtures = []

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A miniature checkout: the Tauri trio, a publishable package, a private one, the skill, and a
 * release note. The lockfile states a dependency version the rewrite must not reach.
 */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'bump-product-'))
  fixtures.push(dir)
  const files = {
    'packages/shell/package.json': json({ name: '@mohou/shell', version: '1.0.0' }),
    'packages/util/values/package.json': json({ name: '@mohou/values', version: '1.0.0' }),
    'packages/app/templates/package.json': json({ name: '@mohou/templates', version: '0.0.0', private: true }),
    'packages/launcher/tauri/Cargo.toml': '[package]\nname = "mini-app-window"\nversion = "1.0.0"\n\n[dependencies]\nsignal-hook = { version = "0.3", features = ["iterator"] }\n',
    'packages/launcher/tauri/Cargo.lock': '[[package]]\nname = "signal-hook"\nversion = "0.3.18"\n\n[[package]]\nname = "mini-app-window"\nversion = "1.0.0"\ndependencies = [\n "signal-hook",\n]\n',
    'packages/launcher/tauri/tauri.conf.json': json({ productName: 'Mohou', version: '1.0.0' }),
    'skills/mohou-mini-app/SKILL.md': '---\nname: mohou-mini-app\ndescription: x\nversion: 1.0.0\n---\n\n# Mini-app authoring\n',
    'docs/changelog.md': '---\nstatus: locked\n---\n\n# Changelog\n\n## 1.0.1\n\nA note.\n\n## 1.0.0\n\nThe first note.\n',
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function read(dir, rel) {
  return readFileSync(join(dir, rel), 'utf8')
}

describe('product version bump', () => {
  // The guard against a hand-edit that reaches only some files: the gate fails here instead.
  it('keeps the tracked carriers equal to the shell version', () => {
    expect(carrierFailures(checkout)).toEqual([])
  })

  it('writes a newer version into every carrier', () => {
    const dir = fixture()
    const result = bumpProduct(dir, '1.0.1')
    expect(result).toMatchObject({ from: '1.0.0', to: '1.0.1' })
    expect(result.files).toEqual([
      'packages/shell/package.json',
      'packages/util/values/package.json',
      'packages/launcher/tauri/Cargo.toml',
      'packages/launcher/tauri/Cargo.lock',
      'packages/launcher/tauri/tauri.conf.json',
      'skills/mohou-mini-app/SKILL.md',
    ])
    expect(carrierFailures(dir)).toEqual([])
    expect(read(dir, 'packages/launcher/tauri/Cargo.lock')).toContain('name = "mini-app-window"\nversion = "1.0.1"')
    expect(read(dir, 'packages/launcher/tauri/Cargo.lock')).toContain('name = "signal-hook"\nversion = "0.3.18"')
    expect(read(dir, 'packages/launcher/tauri/Cargo.toml')).toContain('signal-hook = { version = "0.3"')
    expect(read(dir, 'packages/app/templates/package.json')).toContain('"0.0.0"')
  })

  it('refreshes the packaged skill copy', () => {
    const dir = fixture()
    bumpProduct(dir, '1.0.1')
    expect(read(dir, 'packages/shell/skill/mohou-mini-app/SKILL.md')).toContain('version: 1.0.1')
  })

  it('skips a carrier that already states the version', () => {
    const dir = fixture()
    writeFileSync(join(dir, 'packages/launcher/tauri/tauri.conf.json'), json({ version: '1.0.1' }))
    const result = bumpProduct(dir, '1.0.1')
    expect(result.files).not.toContain('packages/launcher/tauri/tauri.conf.json')
    expect(carrierFailures(dir)).toEqual([])
  })

  it('refuses a version that is not newer', () => {
    const dir = fixture()
    expect(bumpFailures(dir, '1.0.0')).toEqual(['1.0.0 is not newer than the current 1.0.0'])
    expect(() => bumpProduct(dir, '1.0.0')).toThrow(/is not newer/)
    expect(read(dir, 'packages/shell/package.json')).toContain('"1.0.0"')
  })

  it('refuses a version that is not plain x.y.z', () => {
    expect(bumpFailures(fixture(), '1.0')).toEqual(['"1.0" is not a plain x.y.z version'])
  })

  it('refuses while the release note is missing', () => {
    const dir = fixture()
    expect(bumpFailures(dir, '1.2.0')).toEqual([
      'docs/changelog.md has no "## 1.2.0" section — write the release note first',
    ])
    expect(() => bumpProduct(dir, '1.2.0')).toThrow(/release note first/)
  })

  it('writes nothing when a carrier is missing', () => {
    const dir = fixture()
    rmSync(join(dir, 'packages/launcher/tauri/tauri.conf.json'))
    expect(bumpFailures(dir, '1.0.1')).toEqual(['packages/launcher/tauri/tauri.conf.json is missing'])
    expect(() => bumpProduct(dir, '1.0.1')).toThrow(/is missing/)
    expect(read(dir, 'packages/shell/package.json')).toContain('"1.0.0"')
    expect(read(dir, 'packages/launcher/tauri/Cargo.toml')).toContain('version = "1.0.0"')
  })

  it('reports a carrier that drifted', () => {
    const dir = fixture()
    writeFileSync(join(dir, 'packages/launcher/tauri/tauri.conf.json'), json({ version: '1.0.9' }))
    expect(carrierFailures(dir)).toEqual(['packages/launcher/tauri/tauri.conf.json does not state 1.0.0'])
  })

  it('sorts versions by field, not as text', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('accepts only plain x.y.z', () => {
    expect(isVersion('1.0.47')).toBe(true)
    for (const text of ['v1.0.47', '1.0', '1.0.47-rc.1', '1.0.0.0', '']) {
      expect(isVersion(text)).toBe(false)
    }
  })
})
