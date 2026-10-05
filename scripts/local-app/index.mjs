#!/usr/bin/env node
/**
 * Pack workspace tarballs and install a local Mohou app prefix from file: tarballs only.
 *
 * Inputs: workspace packages, skills/, optional built window binary
 * Writes: artifacts/npm/*.tgz, artifacts/local-app/**
 * Run as: pnpm dist:local
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fileDependencies } from '../pack/prefix-deps.mjs'
import { runCommand } from '../build/run-command.mjs'
import { syncSkillIntoShell } from '../sync/skill-into-shell.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const npmDir = join(root, 'artifacts', 'npm')
const outDir = join(root, 'artifacts', 'local-app')
const prefix = join(outDir, 'prefix')

function run(cmd, args, opts = {}) {
  return runCommand(cmd, args, { cwd: root, ...opts })
}

function shellVersion() {
  return JSON.parse(readFileSync(join(root, 'packages/shell/package.json'), 'utf8')).version
}

const version = shellVersion()
console.log(`local-app: shell ${version}`)

// 1. skill K≡S + copy into shell package
syncSkillIntoShell(root)

// 2. panel bundle into packages/shell/dist (packed with shell)
run('pnpm', ['build:panel'])

// 3. pack all workspace publishable packages → artifacts/npm
run('pnpm', ['publish:check'])

// 4. install prefix from local tarballs only for @mohou/*
rmSync(outDir, { recursive: true, force: true })
mkdirSync(prefix, { recursive: true })

const deps = fileDependencies(root, npmDir, version)

const appPkg = {
  name: 'mohou-local-app',
  private: true,
  version,
  description: 'Local install of Mohou from workspace tarballs (simulates npm).',
  type: 'module',
  engines: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines,
  dependencies: {
    ...deps,
    // Node refuses --experimental-strip-types under node_modules; tsx runs the packaged .ts entry.
    tsx: '^4.20.0',
  },
}
writeFileSync(join(prefix, 'package.json'), `${JSON.stringify(appPkg, null, 2)}\n`)

// Prefer npm so file: tarballs resolve like a registry consumer
run('npm', ['install', '--no-fund', '--no-audit'], { cwd: prefix })

const shellRoot = join(prefix, 'node_modules', '@mohou', 'shell')
const skillInShell = join(shellRoot, 'skill', 'mohou-mini-app', 'SKILL.md')
if (!existsSync(skillInShell)) throw new Error(`installed shell missing skill: ${skillInShell}`)
const distPanel = join(shellRoot, 'dist', 'panel.html')
if (!existsSync(distPanel)) throw new Error(`installed shell missing panel dist: ${distPanel}`)

// 5. window binary (build if needed)
const platform = process.platform
if (platform !== 'darwin' && platform !== 'win32') {
  console.warn(`window binary not built on ${platform}; run script will need MINI_APP_WINDOW`)
} else {
  const builtName = platform === 'win32' ? 'mini-app-window.exe' : 'mini-app-window'
  const productName = platform === 'win32' ? 'Mohou.exe' : 'Mohou'
  const built = join(root, 'packages/launcher/tauri/target/release', builtName)
  if (!existsSync(built)) {
    run('cargo', ['build', '--release', '--manifest-path', 'packages/launcher/tauri/Cargo.toml'])
  }
  if (!existsSync(built)) throw new Error(`window binary missing after build: ${built}`)
  cpSync(built, join(outDir, productName))
}

// 6. run script. macOS execs the Tauri parent beside prefix/. Windows keeps the cmd wrapper.
const runPath = join(outDir, platform === 'win32' ? 'run.cmd' : 'run')
const launcherSrc = join(root, 'scripts/build', platform === 'win32' ? 'sidecar.cmd' : 'run-launcher.sh')
cpSync(launcherSrc, runPath)
if (platform !== 'win32') chmodSync(runPath, 0o755)

writeFileSync(
  join(outDir, 'VERSION'),
  `${version}\n`,
)
writeFileSync(
  join(outDir, 'README.md'),
  `# Mohou local app (${version})

Installed from workspace tarballs under \`artifacts/npm/\` (file: deps only for \`@mohou/*\`).

## Layout

- \`prefix/\` — npm install tree (\`@mohou/shell\` + deps)
- \`prefix/node_modules/@mohou/shell/skill/\` — writing skill source (K≡S)
- \`Mohou\` — app executable. It spawns the shell sidecar and opens the window
- \`runtime/\` — created on first run (\`MINI_APP_RUNTIME\`)
- \`run\` — execs \`Mohou\` (Windows: \`run.cmd\` execs \`Mohou.exe\`)

## Run

\`\`\`sh
./run
\`\`\`

## Prove skill path

\`\`\`sh
cd prefix && node --import tsx -e "import { resolveAuthorSkillSource } from '@mohou/shell/src/boot.ts'; console.log(resolveAuthorSkillSource())"
\`\`\`
`,
)

// 7. smoke: skill on disk + resolveAuthorSkillSource via tsx (node_modules .ts)
const probe = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    "import { resolveAuthorSkillSource } from '@mohou/shell/src/boot.ts'; import { accessSync } from 'node:fs'; const s = resolveAuthorSkillSource(); accessSync(s + '/SKILL.md'); console.log(s)",
  ],
  { encoding: 'utf8', cwd: prefix },
)
if (probe.status !== 0) {
  console.error(probe.stdout)
  console.error(probe.stderr)
  throw new Error('installed shell could not resolve author skill source')
}
console.log('skill source:', probe.stdout.trim())

console.log(`\nlocal-app ready: ${outDir}`)
console.log(`run: ${runPath}`)
