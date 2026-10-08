#!/usr/bin/env node
/**
 * Pack or upload the workspace packages.
 *
 * Inputs: workspace package.json files under packages/
 * Writes: artifacts/npm/*.tgz on check; the configured registry on publish
 * Side effects: publish uploads only when MINI_APP_PUBLISH=1.
 *   After the upload, each package is queued on npmmirror unless
 *   --no-mirror-sync is set or MINI_APP_MIRROR_SYNC is 0 or false.
 * Run as: pnpm publish:check
 *         MINI_APP_PUBLISH=1 pnpm publish:packages
 *         MINI_APP_MIRROR_SYNC=0 pnpm publish:packages
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export function publishFailures(rootDir) {
  const rootPkg = readJson(join(rootDir, 'package.json'))
  const packages = workspacePackages(rootDir)
  const failures = []
  if (rootPkg.private !== true) failures.push(`${rootPkg.name} must stay private`)
  if (typeof rootPkg.engines?.node !== 'string' || rootPkg.engines.node.length === 0) {
    failures.push('root engines.node is missing')
  }
  const shell = packages.find(item => item.pkg.name === '@mohou/shell')
  const version = shell?.pkg.version
  if (packages.length === 0) failures.push('no workspace packages')
  for (const item of packages) {
    const { dir, pkg } = item
    if (pkg.private === true) failures.push(`${pkg.name} is private`)
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@mohou/')) failures.push(`${dir} name must be @mohou/*`)
    if (pkg.version !== version) failures.push(`${pkg.name} version ${pkg.version} is not ${version}`)
    if (pkg.version === '0.0.0') failures.push(`${pkg.name} version is 0.0.0`)
    if (pkg.license !== 'MIT') failures.push(`${pkg.name} license is not MIT`)
    if (pkg.type !== 'module') failures.push(`${pkg.name} is not a module`)
    if (!Array.isArray(pkg.files) || !pkg.files.includes('src') || !pkg.files.includes('README.md') || !pkg.files.includes('!**/*.tsbuildinfo')) {
      failures.push(`${pkg.name} files must include src and README.md and exclude tsbuildinfo`)
    }
    if (pkg.name === '@mohou/shell' && (pkg.files.includes('src-tauri') || pkg.files.some(f => String(f).includes('src-tauri')))) {
      failures.push('@mohou/shell must not pack the Tauri launcher (packages/launcher/tauri)')
    }
    if (pkg.name === '@mohou/host') {
      if (!Array.isArray(pkg.files) || !pkg.files.includes('themes')) {
        failures.push('@mohou/host files must include themes (builtin palettes)')
      }
      if (!existsSync(join(rootDir, dir, 'themes', 'theme-default.css'))) {
        failures.push('@mohou/host themes/theme-default.css is missing')
      }
    }
    const access = pkg.publishConfig?.access
    if (access !== 'public' && access !== 'restricted') failures.push(`${pkg.name} publishConfig.access is missing`)
    if (pkg.engines?.node !== rootPkg.engines?.node) failures.push(`${pkg.name} engines.node does not match the root`)
    if (!existsSync(join(rootDir, dir, 'README.md'))) failures.push(`${pkg.name} README.md is missing`)
  }
  return failures
}

export function workspacePackages(rootDir) {
  const found = []
  walkPackages(join(rootDir, 'packages'), 'packages', found)
  found.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))
  return found
}

function walkPackages(dir, rel, found) {
  const file = join(dir, 'package.json')
  if (existsSync(file)) {
    const pkg = readJson(file)
    if (pkg.private !== true) found.push({ dir: rel, pkg })
    return
  }
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    if (!child.isDirectory() || child.name === 'node_modules') continue
    walkPackages(join(dir, child.name), join(rel, child.name), found)
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function packDestination(rootDir) {
  return join(rootDir, 'artifacts', 'npm')
}

export function packedNames(rootDir) {
  const dir = packDestination(rootDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => name.endsWith('.tgz')).sort()
}

export function tarballFailures(rootDir, list) {
  const failures = []
  for (const name of list) {
    const entries = execFileSync('tar', ['-tzf', join(packDestination(rootDir), name)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    if (entries.some(entry => entry.includes('/tests/') || entry.includes('/node_modules/') || entry.includes('src-tauri/'))) {
      failures.push(`${name} packs tests, node_modules, or src-tauri`)
    }
    if (!entries.some(entry => entry.endsWith('/src/index.ts'))) failures.push(`${name} is missing src/index.ts`)
    if (name.startsWith('mohou-shell-') && !entries.some(entry => entry.includes('/skill/mohou-mini-app/SKILL.md'))) {
      failures.push(`${name} is missing packaged skill (run pnpm sync:skill)`)
    }
    if (name.startsWith('mohou-shell-') && !entries.some(entry => entry.endsWith('/dist/panel.html'))) {
      failures.push(`${name} is missing panel dist (run pnpm build:panel)`)
    }
  }
  return failures
}

function packAll(rootDir) {
  execFileSync('pnpm', ['run', 'types'], { cwd: rootDir, stdio: 'inherit' })
  const dest = packDestination(rootDir)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const item of workspacePackages(rootDir)) {
    execFileSync('pnpm', ['pack', '--pack-destination', dest], {
      cwd: join(rootDir, item.dir),
      stdio: 'inherit',
    })
  }
  const names = packedNames(rootDir)
  const failures = tarballFailures(rootDir, names)
  if (names.length !== workspacePackages(rootDir).length) failures.push('pack count does not match the workspace packages')
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  for (const name of names) console.log(join(dest, name))
}

/** npmmirror is the Settings mirror that accepts a sync. Tencent's mirror has no such route. */
export const npmmirrorSyncRegistry = 'https://registry.npmmirror.com'

/** On unless `--no-mirror-sync` is present or `MINI_APP_MIRROR_SYNC` is `0` or `false`. The flag wins. */
export function mirrorSyncEnabled(argv, env) {
  if (argv.includes('--no-mirror-sync')) return false
  const raw = env.MINI_APP_MIRROR_SYNC?.trim() ?? ''
  return raw !== '0' && raw !== 'false'
}

export function mirrorSyncUrl(name, registry = npmmirrorSyncRegistry) {
  return `${registry}/-/package/${encodeURIComponent(name)}/syncs`
}

/**
 * Queue one sync per package. A 2xx body is the mirror's log line.
 * A transport error or a non-2xx response is one failure string. The caller decides the exit.
 */
export async function syncMirrors(names, fetchImpl = globalThis.fetch) {
  const failures = []
  for (const name of names) {
    const url = mirrorSyncUrl(name)
    let response
    try {
      response = await fetchImpl(url, { method: 'PUT' })
    } catch (error) {
      failures.push(`${name} ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const body = await response.text()
    if (!response.ok) {
      failures.push(`${name} ${response.status} ${body}`)
      continue
    }
    console.log(`mirror sync ${name} ${body}`)
  }
  return failures
}

async function publishAll(rootDir) {
  if (process.env.MINI_APP_PUBLISH !== '1') {
    console.error('Refusing to upload. Set MINI_APP_PUBLISH=1 when you mean to publish.')
    process.exit(1)
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' })
  if (dirty !== '') {
    console.error('Refusing to upload from a dirty tree.')
    process.exit(1)
  }
  const access = process.env.MINI_APP_NPM_ACCESS === 'restricted' ? 'restricted' : 'public'
  execFileSync('pnpm', ['run', 'check'], { cwd: rootDir, stdio: 'inherit' })
  execFileSync('pnpm', ['run', 'types'], { cwd: rootDir, stdio: 'inherit' })
  execFileSync('pnpm', ['-r', '--filter', './packages/**', 'publish', '--access', access, '--no-git-checks'], {
    cwd: rootDir,
    stdio: 'inherit',
  })
  if (!mirrorSyncEnabled(process.argv, process.env)) return
  const names = workspacePackages(rootDir).map(item => item.pkg.name)
  const failures = await syncMirrors(names)
  if (failures.length > 0) {
    console.error(`npm upload finished. npmmirror sync failed:\n${failures.join('\n')}`)
    process.exit(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = publishFailures(root)
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  if (process.argv.includes('--publish')) await publishAll(root)
  else packAll(root)
}
