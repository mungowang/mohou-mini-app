import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { snapshotSkip } from '../files/skip.ts'
import { bundleUi } from './bundle-ui.ts'

/** Generated UI bundle and stylesheet. Snapshots and listings skip this name. */
export const autogenDirName = '.autogen'

const entryFile = 'entry.js'
const sheetFile = 'ui.css'

/**
 * Freshness of the app sources. `.autogen` and other skipped names do not count.
 * The same stamp invalidates the bundle and the stylesheet.
 * @param appDir - absolute app directory
 */
/**
 * A stamp over one directory's files: how many, and the newest mtime.
 *
 * `extra` is for the inputs that are not in the directory — an app's stylesheet is compiled from
 * the app *and* from the kit and view sources the compiler scans, so a stamp over the app alone
 * would keep serving a sheet built from an older kit.
 * @param appDir - directory to walk
 * @param extra - further stamp material, concatenated
 */
export async function sourceStamp(appDir: string, extra = ''): Promise<string> {
  let max = 0
  let count = 0
  const walk = async (dir: string): Promise<void> => {
    const names = await readdir(dir).catch(() => [])
    for (const name of names) {
      if (snapshotSkip.has(name) || name === autogenDirName) continue
      const file = path.join(dir, name)
      const info = await stat(file).catch(() => undefined)
      if (info === undefined) continue
      if (info.isDirectory()) {
        await walk(file)
        continue
      }
      count += 1
      if (info.mtimeMs > max) max = info.mtimeMs
    }
  }
  await walk(appDir)
  return extra.length === 0 ? `${max}-${count}` : `${max}-${count}-${extra}`
}

/** Read one generated file when its stamp still matches the sources. */
export async function readAutogen(appDir: string, file: string, extra = ''): Promise<string | undefined> {
  const dir = path.join(appDir, autogenDirName)
  const saved = await readFile(path.join(dir, `${file}.stamp`), 'utf8').catch(() => '')
  if (saved !== await sourceStamp(appDir, extra)) return undefined
  return readFile(path.join(dir, file), 'utf8').catch(() => undefined)
}

/** Write one generated file and its stamp. A write failure does not change the returned body. */
export async function writeAutogen(appDir: string, file: string, body: string, extra = ''): Promise<void> {
  const dir = path.join(appDir, autogenDirName)
  await mkdir(dir, { recursive: true })
  const stamp = await sourceStamp(appDir, extra)
  await writeFile(path.join(dir, file), body)
  await writeFile(path.join(dir, `${file}.stamp`), stamp)
}

/** Remove the generated directory. `cleanCaches` uses this for both files. */
export async function purgeAutogen(appDir: string): Promise<void> {
  await rm(path.join(appDir, autogenDirName), { recursive: true, force: true })
}

/** Bundle `ui.tsx`, or read `.autogen/entry.js` when the stamp matches. The bytes are not kept. */
export async function cachedUiBundle(appDir: string): Promise<string> {
  const hit = await readAutogen(appDir, entryFile)
  if (hit !== undefined) return hit
  const code = (await bundleUi(appDir)).code
  await writeAutogen(appDir, entryFile, code).catch(() => undefined)
  return code
}

export { sheetFile }
