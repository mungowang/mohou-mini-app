import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildVendorFiles } from '../src/compile/build-vendor.ts'
import { loadBackend, platformBundled, platformImportMap, platformLayout, platformModuleAllowed, platformRuntimePath, platformSdkPath, platformVendorPath } from '../src/index.ts'

describe('platformModuleAllowed', () => {
  it('follows the one table', () => {
    expect(platformModuleAllowed('lodash/get', 'backend')).toBe(true)
    expect(platformBundled('lodash')).toBe(false)
    expect(platformBundled('lodash/get')).toBe(true)
    expect(platformBundled('lodash/fp/get')).toBe(true)
    expect(platformBundled('react/jsx-runtime')).toBe(false)
    expect(platformModuleAllowed('react', 'backend')).toBe(false)
    expect(platformModuleAllowed('left-pad', 'ui')).toBe(false)
    expect(platformModuleAllowed('react/jsx-runtime', 'ui')).toBe(true)
    const imports = platformImportMap()
    expect(imports.react).toBe(platformRuntimePath())
    expect(imports['react/jsx-runtime']).toBe(platformRuntimePath())
    expect(imports['react-dom']).toBe(platformRuntimePath())
    expect(imports['react-dom/client']).toBe(platformRuntimePath())
    expect(imports['@mohou/ui']).toBe(platformSdkPath())
    expect(imports.lodash).toBe(platformVendorPath('lodash'))
    expect(imports['lodash-es']).toBe(imports.lodash)
    expect(imports['motion/react']).toBe(platformVendorPath('motion'))
    expect(imports).not.toHaveProperty('@mohou/contract')
    expect(platformSdkPath()).toBe(`${platformLayout.root}/${platformLayout.sdk}`)
  })

})

describe('buildVendorFiles', () => {
  it('writes one file for rows that share a file and skips a pattern row', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-vendor-'))
    const written = await buildVendorFiles({
      outDir: dir,
      rows: [
        { specifier: 'lodash', side: 'both', file: '/mma/vendors/lodash.js' },
        { specifier: 'lodash-es', side: 'both', file: '/mma/vendors/lodash.js' },
        { specifier: 'lodash/*', side: 'both', bundle: true },
      ],
    })
    expect(written).toEqual([join(dir, 'lodash.js')])
    const code = await readFile(written[0] ?? '', 'utf8')
    expect(code.length).toBeGreaterThan(1000)
    const more = await buildVendorFiles({
      outDir: dir,
      rows: [
        { specifier: 'react', side: 'ui', file: '/mma/runtime.js' },
        { specifier: 'motion', side: 'ui', file: '/mma/vendors/motion.js' },
      ],
    })
    expect(more).toHaveLength(2)
    const sdk = await buildVendorFiles({
      outDir: dir,
      rows: [{ specifier: 'react', side: 'ui', file: '/mma/sdk.js' }],
    })
    const sdkCode = await readFile(sdk[0] ?? '', 'utf8')
    expect(sdkCode).toContain('Dynamic require of')
    expect(sdkCode).toContain('from "react"')
  }, 60_000)
})

describe('loadBackend', () => {
  it('loads defineApp and rejects a ui import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-backend-'))
    await writeFile(join(dir, 'helper.ts'), 'export const n = 1\n')
    await writeFile(join(dir, 'main.api.ts'), `
      import { defineApp } from '@mohou/contract'
      import { n } from './helper.ts'
      export default defineApp({
        name: 'Example',
        description: 'One line',
        api: { ping() { return n } },
      })
    `)
    const loaded = await loadBackend(dir)
    expect(await loaded.api.ping?.({} as never, {})).toBe(1)
    await writeFile(join(dir, 'main.api.ts'), 'import \'ui/button\'\nexport default {}\n')
    await expect(loadBackend(dir, 'silent')).rejects.toMatchObject({ code: 'import-forbidden' })
    await writeFile(join(dir, 'main.api.ts'), `
      import { readFileSync } from 'node:fs'
      import { defineApp } from '@mohou/contract'
      export default defineApp({
        name: 'Example',
        description: 'One line',
        api: { ping: () => typeof readFileSync },
      })
    `)
    const withNode = await loadBackend(dir)
    expect(await withNode.api.ping?.({} as never, {})).toBe('function')
    await writeFile(join(dir, 'main.api.ts'), `
      import get from 'lodash/get'
      import { defineApp } from '@mohou/contract'
      export default defineApp({
        name: 'Example',
        description: 'One line',
        api: { ping: () => get({ a: 1 }, 'a') },
      })
    `)
    const withLodash = await loadBackend(dir)
    expect(await withLodash.api.ping?.({} as never, {})).toBe(1)
    await writeFile(join(dir, 'main.api.ts'), 'export default { api: 1 }\n')
    await expect(loadBackend(dir)).rejects.toMatchObject({ code: 'backend-invalid' })
    await writeFile(join(dir, 'main.api.ts'), 'import "left-pad"\nexport default {}\n')
    await expect(loadBackend(dir, 'silent')).rejects.toMatchObject({ code: 'backend-invalid' })
  })

  it('reports the esbuild text for a name the module does not export', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-backend-export-'))
    await writeFile(join(dir, 'helper.ts'), 'export const other = 1\n')
    await writeFile(join(dir, 'main.api.ts'), "import { missing } from './helper.ts'\nexport default missing\n")
    const failure = await loadBackend(dir, 'silent').catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'backend-invalid' })
    const message = failure instanceof Error ? failure.message : ''
    expect(message).toContain('main.api.ts:1:')
    expect(message).toContain('No matching export in "helper.ts" for import "missing"')
  })

  it('keeps onHostEvents when the module defines it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mma-backend-hook-'))
    await writeFile(join(dir, 'main.api.ts'), `
      import { defineApp } from '@mohou/contract'
      export default defineApp({
        name: 'Example',
        description: 'One line',
        onHostEvents(ctx, event) { ctx.push('desk', event) },
        api: { ping() { return 'ok' } },
      })
    `)
    const loaded = await loadBackend(dir)
    expect(typeof loaded.onHostEvents).toBe('function')
  })
})
