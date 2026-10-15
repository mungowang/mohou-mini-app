import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { workspacePackages } from '../publish/packages.mjs'
import { fileDependencies, packedFileName } from './prefix-deps.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('prefix dependencies', () => {
  it('names packs the way pnpm pack does and refuses a missing tarball', () => {
    expect(packedFileName('@mohou/app-view', '1.0.0')).toBe('mohou-app-view-1.0.0.tgz')
    const names = workspacePackages(root).map(item => packedFileName(item.pkg.name, '1.2.3'))
    expect(names).toContain('mohou-shell-1.2.3.tgz')
    expect(names).toHaveLength(10)
    expect(() => fileDependencies(root, join(root, 'artifacts', 'npm-missing-for-test'), '1.0.0')).toThrow(/missing tarball/)
  })

  it('ships the Tauri binary as the macOS executable', () => {
    const app = readFileSync(join(root, 'scripts/build/app.mjs'), 'utf8')
    const local = readFileSync(join(root, 'scripts/local-app/index.mjs'), 'utf8')
    const plist = readFileSync(join(root, 'scripts/build/macos-Info.plist'), 'utf8')
    const run = readFileSync(join(root, 'scripts/build/run-launcher.sh'), 'utf8')
    const win = readFileSync(join(root, 'scripts/build/sidecar.cmd'), 'utf8')
    expect(app).toContain('copyInstallPrefix')
    expect(app).not.toContain('cpSync(prefix')
    expect(app).toContain("'MacOS'")
    expect(app).toContain('chmodSync(executable, 0o755)')
    expect(app).toContain('macos-Info.plist')
    expect(app).not.toContain('unix-sidecar.sh')
    expect(app).not.toContain('link_pi_peer')
    expect(local).toContain('run-launcher.sh')
    expect(local).toContain('sidecar.cmd')
    expect(run).toContain('exec "$here/Mohou"')
    expect(win).toContain('Mohou.exe')
    expect(win).not.toContain('dev.ts')
    expect(plist).toContain('__VERSION__')
    expect(plist).toContain('CFBundleExecutable')
    const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
    expect(app).toContain('macOS-arm64')
    expect(app).toContain('windows-x64')
    expect(release).toContain('macos-14')
    expect(release).toContain('windows-latest')
    expect(release).toContain('macOS-arm64')
    expect(release).toContain('windows-x64')
    expect(release).toContain('dist:app:release')
    expect(app).toContain('--channel=tarball')
    expect(app).toContain('--channel=registry')
  })
})
