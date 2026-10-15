/**
 * Copy an npm install prefix into the app bundle.
 *
 * npm links `node_modules/.bin` with a relative target. `fs.cp` rewrites that
 * target to an absolute path of the source tree unless `verbatimSymlinks` is set,
 * so the installed app still names the build machine. An absolute link whose
 * target sits inside the source prefix is stored as the same relative path in
 * the copy. A link that points outside the prefix stays as it was.
 */
import { cpSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

export function copyInstallPrefix(from, to) {
  cpSync(from, to, { recursive: true, verbatimSymlinks: true })
  const fromReal = realpathSync(from)
  const toReal = realpathSync(to)
  rewriteInternalLinks(fromReal, toReal)
}

function rewriteInternalLinks(fromReal, toReal) {
  walk(toReal)

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        rewriteLink(fromReal, toReal, full)
        continue
      }
      if (entry.isDirectory()) walk(full)
    }
  }
}

function rewriteLink(fromReal, toReal, full) {
  const raw = readlinkSync(full)
  if (!isAbsolute(raw)) return
  let landedReal
  try {
    landedReal = realpathSync(raw)
  } catch {
    return
  }
  const landed = isInside(fromReal, landedReal)
    ? join(toReal, relative(fromReal, landedReal))
    : isInside(toReal, landedReal)
      ? landedReal
      : null
  if (landed === null) return
  const next = relative(dirname(full), landed)
  unlinkSync(full)
  const type = process.platform === 'win32' && statSync(landed).isDirectory() ? 'junction' : undefined
  if (type) symlinkSync(next, full, type)
  else symlinkSync(next, full)
}

function isInside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}
