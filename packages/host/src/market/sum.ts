import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const skipped = new Set(['storage', 'logs', 'theme.json', '.git', 'node_modules', '.autogen', '.ui-build', '.market.lock'])

/**
 * sha256 of the source tree. Paths are sorted. Each line is path plus bytes.
 * @param root - the directory that will be copied
 */
export function sourceSum(root: string): string {
  const hash = createHash('sha256')
  for (const file of walk(root, '')) {
    hash.update(file.rel)
    hash.update('\0')
    hash.update(readFileSync(file.abs))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function walk(root: string, rel: string): { rel: string; abs: string }[] {
  const abs = rel.length === 0 ? root : path.join(root, rel)
  const entries = readdirSync(abs, { withFileTypes: true })
    .filter(entry => !skipped.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
  const files: { rel: string; abs: string }[] = []
  for (const entry of entries) {
    const next = rel.length === 0 ? entry.name : `${rel}/${entry.name}`
    const full = path.join(root, next)
    if (entry.isDirectory()) files.push(...walk(root, next))
    else if (statSync(full).isFile()) files.push({ rel: next, abs: full })
  }
  return files
}
