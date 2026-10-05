#!/usr/bin/env node
/**
 * Build a double-clickable macOS Mohou.app (own tree under artifacts/app).
 * Does not read or write artifacts/local-app — that stays pnpm dist:local.
 *
 * Writes: artifacts/app/.
 * macOS: Mohou.app, zip, and dmg named macOS-<arch>.
 * Windows: zip of Mohou.exe beside prefix/, named windows-<arch>.
 * Run as: pnpm dist:app:local | pnpm dist:app:release
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fileDependencies } from '../pack/prefix-deps.mjs'
import { runCommand } from './run-command.mjs'
import { syncSkillIntoShell } from '../sync/skill-into-shell.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const npmDir = join(root, 'artifacts', 'npm')
const outDir = join(root, 'artifacts', 'app')
const stage = join(outDir, 'stage')
const prefix = join(stage, 'prefix')
const appName = 'Mohou.app'
const appRoot = join(outDir, appName)
const contents = join(appRoot, 'Contents')
const macos = join(contents, 'MacOS')
const resources = join(contents, 'Resources')

function run(cmd, args, opts = {}) {
  return runCommand(cmd, args, { cwd: root, ...opts })
}

/** Artifact id. CI builds macOS-arm64 and windows-x64. */
function bundleLabel() {
  const arch = process.arch
  if (process.platform === 'darwin') return `macOS-${arch}`
  if (process.platform === 'win32') return `windows-${arch}`
  return null
}

function shellVersion() {
  return JSON.parse(readFileSync(join(root, 'packages/shell/package.json'), 'utf8')).version
}

/** `local` installs file: tarballs. `release` installs `@mohou/shell` from the registry. */
function distChannel(argv) {
  const named = argv.find(arg => arg === '--channel=tarball' || arg === '--channel=registry')
  if (named === '--channel=tarball') return 'tarball'
  if (named === '--channel=registry') return 'registry'
  return null
}

function localPackagesDir() {
  return join(homedir(), '.mini-app', 'packages')
}

function copyTarballs(from, to) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (!name.endsWith('.tgz')) continue
    cpSync(join(from, name), join(to, name))
  }
  console.log(`tarballs: ${to}`)
}

function prefixPackage(channel, version, engines) {
  const shared = {
    name: 'mohou-app',
    private: true,
    version,
    type: 'module',
    engines,
  }
  if (channel === 'registry') {
    return {
      ...shared,
      description: 'Mohou install prefix from the npm registry.',
      mohou: { channel: 'registry', registry: 'https://registry.npmjs.org' },
      dependencies: {
        '@mohou/shell': version,
        tsx: '^4.20.0',
      },
    }
  }
  return {
    ...shared,
    description: 'Mohou install prefix from workspace tarballs.',
    mohou: { channel: 'tarball', tarballDir: localPackagesDir() },
    dependencies: {
      ...fileDependencies(root, npmDir, version),
      tsx: '^4.20.0',
    },
  }
}

/**
 * Ship prune contract (A only):
 * A1 all .map files
 * A2-A4 umd directories (named umd, or dist/umd, build/umd)
 * date-fns locales stay intact — barrel rewrite is not worth the break risk.
 */
function pruneShipModules(nodeModules) {
  let files = 0
  let dirs = 0
  let bytes = 0

  function sizeOf(path) {
    try {
      const st = statSync(path)
      if (st.isFile()) return st.size
      if (!st.isDirectory()) return 0
      let total = 0
      for (const name of readdirSync(path)) total += sizeOf(join(path, name))
      return total
    } catch {
      return 0
    }
  }

  function rmPath(path) {
    if (!existsSync(path)) return
    const n = sizeOf(path)
    const st = statSync(path)
    rmSync(path, { recursive: true, force: true })
    bytes += n
    if (st.isDirectory()) dirs += 1
    else files += 1
  }

  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'umd') {
          rmPath(full)
          continue
        }
        if (entry.name === 'dist' || entry.name === 'build') {
          const umd = join(full, 'umd')
          if (existsSync(umd)) rmPath(umd)
        }
        walk(full)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.map')) rmPath(full)
    }
  }

  if (existsSync(nodeModules)) walk(nodeModules)

  return { files, dirs, mb: (bytes / (1024 * 1024)).toFixed(1) }
}

function sleep(seconds) {
  execFileSync('sleep', [String(seconds)])
}

function osascript(source) {
  // Finder automation hangs on a headless runner. The symlink fallback still makes a dmg.
  if (process.env.CI === 'true') return { status: 1, stderr: 'skipped in CI' }
  return spawnSync('osascript', ['-e', source], { encoding: 'utf8' })
}

function parseHdiutilAttach(output) {
  let device
  let mount
  for (const line of output.split('\n')) {
    const dev = line.match(/^(\/dev\/disk\d+)\b/)
    if (dev && !device) device = dev[1]
    const vol = line.match(/(\/Volumes\/\S+)\s*$/)
    if (vol) mount = vol[1]
  }
  if (!device || !mount) {
    throw new Error(`hdiutil attach did not yield a volume:\n${output}`)
  }
  return { device, mount }
}

function detachVolume(device) {
  for (let i = 0; i < 6; i += 1) {
    const force = i >= 3
    const args = force ? ['detach', '-force', device] : ['detach', device]
    const result = spawnSync('hdiutil', args, { encoding: 'utf8' })
    if (result.status === 0) return
    sleep(1)
  }
  throw new Error(`hdiutil detach failed for ${device}`)
}

/**
 * Installer DMG: .app + /Applications alias, then UDZO.
 * Do not `hdiutil -srcfolder` a tree that already contains an Applications
 * symlink — hdiutil copies /Applications into the image.
 */
function createInstallerDmg({ bundleRoot, bundleName, dmgPath, volName }) {
  const volumePath = `/Volumes/${volName}`
  if (existsSync(volumePath)) {
    spawnSync('hdiutil', ['detach', '-force', volumePath], { encoding: 'utf8' })
  }

  const appMb = Number(execFileSync('du', ['-sm', bundleRoot], { encoding: 'utf8' }).split(/\s+/)[0])
  const sizeMb = Math.ceil(appMb * 1.2) + 32
  const rwPath = `${dmgPath}.rw.dmg`
  rmSync(rwPath, { force: true })
  rmSync(dmgPath, { force: true })
  run('hdiutil', ['create', '-size', `${sizeMb}m`, '-fs', 'HFS+', '-volname', volName, '-ov', rwPath])

  const attachOut = execFileSync(
    'hdiutil',
    ['attach', '-readwrite', '-noverify', '-noautoopen', rwPath],
    { encoding: 'utf8' },
  )
  const { device, mount } = parseHdiutilAttach(attachOut)
  try {
    run('ditto', [bundleRoot, join(mount, bundleName)])
    const alias = osascript(
      `tell application "Finder"
  set a to make new alias file at POSIX file "${mount}" to POSIX file "/Applications"
  set name of a to "Applications"
end tell`,
    )
    if (alias.status !== 0) {
      console.warn(`Applications alias via Finder failed; using symlink\n${alias.stderr}`)
      symlinkSync('/Applications', join(mount, 'Applications'))
    }
    const layout = osascript(
      `tell application "Finder"
  tell disk "${volName}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {400, 160, 940, 520}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 128
    delay 0.5
    set position of item "${bundleName}" of container window to {140, 180}
    set position of item "Applications" of container window to {400, 180}
    close
    open
    update without registering applications
    delay 1
    close
  end tell
end tell`,
    )
    if (layout.status !== 0) {
      console.warn(`dmg window layout skipped\n${layout.stderr}`)
    }
    spawnSync('bless', ['--folder', mount, '--openfolder', mount], { encoding: 'utf8' })
    sleep(1)
  } finally {
    detachVolume(device)
  }

  run('hdiutil', [
    'convert',
    rwPath,
    '-format',
    'UDZO',
    '-imagekey',
    'zlib-level=9',
    '-ov',
    '-o',
    dmgPath,
  ])
  rmSync(rwPath, { force: true })
}

const channel = distChannel(process.argv.slice(2))
if (channel === null) {
  console.error('Pick one: pnpm dist:app:local (tarball) or pnpm dist:app:release (registry)')
  process.exit(1)
}
const label = bundleLabel()
if (label === null) {
  console.error(`dist:app does not build a bundle on ${process.platform}`)
  process.exit(1)
}

const version = shellVersion()
console.log(`dist:app: Mohou ${version} (${label}, ${channel})`)

// Local packs the workspace and installs those tarballs. Release installs the published shell.
if (channel === 'tarball') {
  syncSkillIntoShell(root)
  run('pnpm', ['build:panel'])
  run('pnpm', ['publish:check'])
  copyTarballs(npmDir, localPackagesDir())
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(prefix, { recursive: true })

const engines = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines
writeFileSync(join(prefix, 'package.json'), `${JSON.stringify(prefixPackage(channel, version, engines), null, 2)}\n`)

const installArgs = ['install', '--no-fund', '--no-audit']
if (channel === 'registry') installArgs.push('--registry', 'https://registry.npmjs.org')
run('npm', installArgs, { cwd: prefix })

const shellRoot = join(prefix, 'node_modules', '@mohou', 'shell')
if (!existsSync(join(shellRoot, 'skill', 'mohou-mini-app', 'SKILL.md'))) {
  throw new Error('installed shell missing skill')
}
if (!existsSync(join(shellRoot, 'dist', 'panel.html'))) {
  throw new Error('installed shell missing panel dist')
}

// 2b. prune ship modules (A: maps + umd only)
const pruned = pruneShipModules(join(prefix, 'node_modules'))
console.log(`prune: removed ${pruned.files} files / ${pruned.dirs} dirs (~${pruned.mb} MB)`)

// 3. Tauri binary is the app executable. It spawns the sidecar.
const builtName = process.platform === 'win32' ? 'mini-app-window.exe' : 'mini-app-window'
const built = join(root, 'packages/launcher/tauri/target/release', builtName)
// Always rebuild. A leftover release binary hides launcher fixes such as shell PATH.
run('cargo', ['build', '--release', '--manifest-path', 'packages/launcher/tauri/Cargo.toml'])
if (!existsSync(built)) throw new Error(`window binary missing: ${built}`)

if (process.platform === 'win32') {
  writeWindowsBundle({ version, label, prefix, built })
} else {
  writeMacBundle({ version, label, prefix, built })
}

function writeMacBundle({ version, label, prefix, built }) {
  mkdirSync(macos, { recursive: true })
  mkdirSync(resources, { recursive: true })
  cpSync(prefix, join(resources, 'prefix'), { recursive: true })
  const executable = join(macos, 'Mohou')
  cpSync(built, executable)
  chmodSync(executable, 0o755)
  writeFileSync(join(resources, 'VERSION'), `${version}\n`)

  const icnsSrc = join(root, 'packages/launcher/tauri/icons/icon.icns')
  if (!existsSync(icnsSrc)) throw new Error(`missing app icon: ${icnsSrc}`)
  cpSync(icnsSrc, join(resources, 'AppIcon.icns'))

  const plistSrc = join(root, 'scripts/build/macos-Info.plist')
  const plist = readFileSync(plistSrc, 'utf8').replaceAll('__VERSION__', version)
  if (plist.includes('__VERSION__')) throw new Error(`version was not filled in ${plistSrc}`)
  writeFileSync(join(contents, 'Info.plist'), plist)

  const zipPath = join(outDir, `Mohou-${version}-${label}.zip`)
  const zip = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appRoot, zipPath], { stdio: 'inherit' })
  if (zip.status !== 0) throw new Error(`ditto failed to zip ${appRoot}`)

  const dmgPath = join(outDir, `Mohou-${version}-${label}.dmg`)
  createInstallerDmg({ bundleRoot: appRoot, bundleName: appName, dmgPath, volName: 'Mohou' })

  writeFileSync(join(outDir, 'README.md'), macReadme(version, label))
  console.log(`\ndist:app ready: ${appRoot}`)
  console.log(`stage: ${stage}`)
  console.log(`zip: ${zipPath}`)
  console.log(`dmg: ${dmgPath}`)
}

function writeWindowsBundle({ version, label, prefix, built }) {
  const folderName = `Mohou-${version}-${label}`
  const folder = join(outDir, folderName)
  mkdirSync(folder, { recursive: true })
  cpSync(built, join(folder, 'Mohou.exe'))
  cpSync(prefix, join(folder, 'Resources/prefix'), { recursive: true })
  cpSync(join(root, 'scripts/build/sidecar.cmd'), join(folder, 'run.cmd'))
  writeFileSync(join(folder, 'VERSION'), `${version}\n`)
  writeFileSync(join(folder, 'README.md'), windowsReadme(version, label))
  const zipPath = join(outDir, `${folderName}.zip`)
  rmSync(zipPath, { force: true })
  run('tar', ['-a', '-c', '-f', zipPath, '-C', outDir, folderName])
  console.log(`\ndist:app ready: ${folder}`)
  console.log(`zip: ${zipPath}`)
}

function macReadme(version, label) {
  return `# Mohou ${version} (${label})

Built by \`pnpm dist:app\` into \`artifacts/app/\`. Unsigned.

## Install

**DMG (preferred)**

1. Open \`Mohou-${version}-${label}.dmg\`
2. Drag \`Mohou.app\` onto the Applications alias
3. First open: right-click → Open if Gatekeeper blocks
4. Requires **Node.js 22+** on the machine

**Zip**

1. Unzip \`Mohou-${version}-${label}.zip\`
2. Open \`Mohou.app\` the same way

## Runtime

Default data dir: \`~/.mini-app/runtime\` (override with \`MINI_APP_RUNTIME\`).

## Restart host

Settings → Restart host exits the Node sidecar with code 75. The Mohou executable starts it again and keeps the window.
`
}

function windowsReadme(version, label) {
  return `# Mohou ${version} (${label})

Built by \`pnpm dist:app\`. Unsigned. SmartScreen may warn on first open.

## Install

1. Unzip \`Mohou-${version}-${label}.zip\`
2. Open \`Mohou.exe\` (or \`run.cmd\`, which starts the same executable)
3. Requires **Node.js 22+** on the machine

\`Mohou.exe\` sits beside \`Resources/prefix\`. It spawns the shell sidecar and opens the window.

## Runtime

Default data dir: \`%USERPROFILE%\\.mini-app\\runtime\` (override with \`MINI_APP_RUNTIME\`).

## Restart host

Settings → Restart host exits the Node sidecar with code 75. The Mohou executable starts it again and keeps the window.
`
}
