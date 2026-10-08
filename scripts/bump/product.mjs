#!/usr/bin/env node
/**
 * Set the product version in every carrier.
 *
 * The product version is `@mohou/shell`'s `version`. The publishable workspace packages, the
 * Tauri crate and its lockfile entry, the window config, and the author skill all state it.
 * The release note is prose and stays with the author, so a bump refuses to run while
 * `docs/changelog.md` has no section for the new version.
 *
 * Inputs: the new version as the only argument; packages/shell/package.json; docs/changelog.md
 * Writes: the `version` field of every carrier, plus the packaged skill copy
 * Side effects: none
 * Run as: pnpm bump:product 1.0.47
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { workspacePackages } from '../publish/packages.mjs'
import { readShellVersion, readSkillVersion, setSkillVersion, syncSkillIntoShell } from '../sync/skill-into-shell.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const tauriDir = 'packages/launcher/tauri'
const skillSource = 'skills/mohou-mini-app'
const changelog = 'docs/changelog.md'

const VERSION = /^\d+\.\d+\.\d+$/

export function isVersion(text) {
  return typeof text === 'string' && VERSION.test(text)
}

/** Numeric per field, so `1.0.9` sorts below `1.0.10`. */
export function compareVersions(left, right) {
  const leftFields = left.split('.').map(Number)
  const rightFields = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftFields[index] === rightFields[index]) continue
    return leftFields[index] < rightFields[index] ? -1 : 1
  }
  return 0
}

/**
 * Every file that states the product version, with the value it states and a rewrite of that
 * one field. A publishable package is one that `workspacePackages` returns, so the bump and
 * the publish gate agree on the set. The skill goes through the sync module's frontmatter
 * setter; the sync step at the end of a bump owns the packaged copy.
 */
export function carriers(rootDir) {
  const tomlFile = join(rootDir, tauriDir, 'Cargo.toml')
  const lockFile = join(rootDir, tauriDir, 'Cargo.lock')
  const skillFile = join(rootDir, skillSource, 'SKILL.md')
  const crate = /^name = "([^"]+)"/m.exec(readText(tomlFile))?.[1] ?? ''
  return [
    ...workspacePackages(rootDir).map(item => jsonCarrier(join(rootDir, item.dir, 'package.json'))),
    {
      file: tomlFile,
      read: () => /^version = "([^"]+)"/m.exec(readText(tomlFile))?.[1] ?? null,
      write: (text, from, to) => swap(text, new RegExp(`(^version = ")${escapeRegExp(from)}(")`, 'm'), to),
    },
    {
      file: lockFile,
      read: () => lockVersion(crate, readText(lockFile)),
      write: (text, from, to) => swap(text, lockPattern(crate, from), to),
    },
    jsonCarrier(join(rootDir, tauriDir, 'tauri.conf.json')),
    {
      file: skillFile,
      read: () => readSkillVersion(skillFile),
      write: (text, _from, to) => setSkillVersion(text, to),
    },
  ]
}

/** Policy failures that stop a bump. A missing or invalid shell package.json throws instead. */
export function bumpFailures(rootDir, next) {
  if (!isVersion(next)) return [`"${next}" is not a plain x.y.z version`]
  const failures = []
  const current = readShellVersion(join(rootDir, 'packages/shell/package.json'))
  if (compareVersions(next, current) <= 0) failures.push(`${next} is not newer than the current ${current}`)
  if (!hasReleaseNote(rootDir, next)) failures.push(`${changelog} has no "## ${next}" section — write the release note first`)
  for (const carrier of carriers(rootDir)) {
    if (!existsSync(carrier.file)) failures.push(`${relative(rootDir, carrier.file)} is missing`)
  }
  return failures
}

/** Every carrier that does not state the shell version. Empty means the checkout agrees. */
export function carrierFailures(rootDir) {
  const expected = readShellVersion(join(rootDir, 'packages/shell/package.json'))
  const failures = []
  for (const carrier of carriers(rootDir)) {
    const file = relative(rootDir, carrier.file)
    if (!existsSync(carrier.file)) failures.push(`${file} is missing`)
    else if (carrier.read() !== expected) failures.push(`${file} does not state ${expected}`)
  }
  return failures
}

/** Write `next` into every carrier. It throws before writing anything when a check fails. */
export function bumpProduct(rootDir, next) {
  const failures = bumpFailures(rootDir, next)
  if (failures.length > 0) throw new Error(failures.join('\n'))
  const current = readShellVersion(join(rootDir, 'packages/shell/package.json'))
  const writes = []
  for (const carrier of carriers(rootDir)) {
    const file = relative(rootDir, carrier.file)
    const text = readFileSync(carrier.file, 'utf8')
    const from = carrier.read()
    if (from === null) {
      failures.push(`${file} does not state a version`)
      continue
    }
    if (from === next) continue
    const updated = carrier.write(text, from, next)
    if (updated === text) failures.push(`${file} states ${from}, which the rewrite did not reach`)
    else writes.push({ file, text: updated })
  }
  if (failures.length > 0) throw new Error(failures.join('\n'))
  for (const write of writes) writeFileSync(join(rootDir, write.file), write.text)
  const synced = syncSkillIntoShell(rootDir)
  const after = carrierFailures(rootDir)
  if (after.length > 0) throw new Error(after.join('\n'))
  return { from: current, to: next, files: writes.map(write => write.file), skillCopy: relative(rootDir, synced.dest) }
}

/** The lockfile entry of `crate`, matched on both lines so no dependency version is reached. */
function lockPattern(crate, from) {
  return new RegExp(`(name = "${escapeRegExp(crate)}"\\nversion = ")${escapeRegExp(from)}(")`)
}

function lockVersion(crate, text) {
  return new RegExp(`name = "${escapeRegExp(crate)}"\\nversion = "([^"]+)"`).exec(text)?.[1] ?? null
}

function hasReleaseNote(rootDir, version) {
  return new RegExp(`^## ${escapeRegExp(version)}\\s*$`, 'm').test(readText(join(rootDir, changelog)))
}

function jsonCarrier(file) {
  return {
    file,
    read: () => {
      const value = JSON.parse(readText(file)).version
      return typeof value === 'string' ? value : null
    },
    write: (text, from, to) => swap(text, new RegExp(`("version"\\s*:\\s*")${escapeRegExp(from)}(")`), to),
  }
}

/** Rewrite one captured value in place, keeping the file's own spacing. */
function swap(text, pattern, to) {
  return text.replace(pattern, (_match, open, close) => `${open}${to}${close}`)
}

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  if (args.length !== 1) throw new Error('bump:product: usage: pnpm bump:product <x.y.z>')
  const result = bumpProduct(root, args[0])
  console.log(`product version ${result.from} → ${result.to}`)
  for (const file of result.files) console.log(`  ${file}`)
  console.log(`skill copy: ${result.skillCopy}`)
  const stat = execFileSync('git', ['diff', '--stat'], { cwd: root, encoding: 'utf8' }).trimEnd()
  if (stat !== '') console.log(stat)
  console.log('Next: pnpm run check, then commit.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
