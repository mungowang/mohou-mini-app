import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { McpClient } from '@mohou/mcp-client'

import { createAppRegistry } from '../src/apps/registry.ts'
import { emptyCredentials } from '../src/credentials/provider.ts'
import { createEchoProvider } from '@mohou/runtime-provider'
import { createAuthorTools } from '../src/tools/author.ts'
import { resolveCatalog, versionCompared } from '../src/market/catalog.ts'
import { MarketError } from '../src/market/error.ts'
import { installAppTree, installThemeFile, themeColors, themesPackageSum } from '../src/market/install.ts'
import { extractTarball, fetchCatalog, fetchPackage, readLocalCatalog } from '../src/market/fetch.ts'
import { assertLocalSource, installMarket, listMarket, uninstallMarket } from '../src/market/service.ts'
import { themePreview, readThemeCss } from '../src/market/install.ts'
import { sourceSum } from '../src/market/sum.ts'
import { searchMarket } from '../src/market/search.ts'
import { openStorage } from '../src/storage/open.ts'
import { registerWithFiles } from './author-seed.ts'

const row = {
  id: 'com.example.desk',
  name: 'Desk',
  description: 'Today',
  package: '@mohou-apps/com.example.desk',
  version: '1.1.0',
  kind: 'app' as const,
  source: 'npm' as const,
}

describe('market catalog', () => {
  it('admits a row and treats an omitted kind as app', () => {
    const catalog = resolveCatalog({
      version: '1.0.0',
      mohou: { apps: [{ ...row, kind: undefined }] },
    })
    expect(catalog.apps[0]?.kind).toBe('app')
    expect(catalog.apps[0]?.source).toBe('npm')
  })

  it('compares semver and refuses a bad catalog', () => {
    expect(versionCompared('1.10.0', '1.2.0')).toBe('greater')
    expect(versionCompared('1.0.0', '1.0.0')).toBe('equal')
    expect(() => resolveCatalog({ version: '1' })).toThrow(MarketError)
  })
})

describe('market theme packs', () => {
  /** A theme row is the base; `themePackId` points at a `themePacks` entry. */
  const theme = (extra: Record<string, unknown> = {}) => ({
    id: 'sakura', name: 'Sakura', description: 'd', package: '@mohou-apps/themes',
    version: '1.0.0', kind: 'theme', ...extra,
  })
  const pack = { id: 'spring', name: 'Spring', nameZh: '春', description: 'Soft light', author: 'Mohou', official: true }

  it('admits a bundle and the row that names it', () => {
    const catalog = resolveCatalog({
      version: '1.0.0',
      mohou: { themePacks: [pack], apps: [theme({ themePackId: 'spring' })] },
    })
    expect(catalog.themePacks[0]).toMatchObject({ id: 'spring', nameZh: '春', official: true })
    expect(catalog.apps[0]).toMatchObject({ themePackId: 'spring' })
  })

  it('reads a catalog with no bundle list as no bundles', () => {
    expect(resolveCatalog({ version: '1.0.0', mohou: { apps: [theme()] } }).themePacks).toEqual([])
  })

  it('ignores a key it does not declare, which is what keeps an older Host listing every row', () => {
    const catalog = resolveCatalog({
      version: '1.0.0',
      mohou: {
        // A sibling the current resolver knows nothing about, and a row field it does not read.
        futureThings: [{ id: 'x' }],
        apps: [theme({ futureField: 'ignored', themePackId: undefined })],
      },
    })
    expect(catalog.apps).toHaveLength(1)
    expect(catalog.apps[0]).not.toHaveProperty('futureField')
    expect(catalog.apps[0]).not.toHaveProperty('themePackId')
  })

  it('refuses a bundle that names nothing, a bundle id reused, a row id reused, and a bundle on an app row', () => {
    const bad = [
      // Missing referent is a catalog error, not an ungrouped row.
      { version: '1.0.0', mohou: { apps: [theme({ themePackId: 'ghost' })] } },
      { version: '1.0.0', mohou: { themePacks: 'no', apps: [] } },
      { version: '1.0.0', mohou: { themePacks: [pack, { ...pack, name: 'Second' }], apps: [] } },
      { version: '1.0.0', mohou: { themePacks: [{ name: 'No id' }], apps: [] } },
      { version: '1.0.0', mohou: { themePacks: [{ id: 'Spring!', name: 'X' }], apps: [] } },
      // Two rows, one id: one flat file and one lock cannot carry both.
      { version: '1.0.0', mohou: { apps: [theme(), theme()] } },
      { version: '1.0.0', mohou: { themePacks: [pack], apps: [{ ...row, themePackId: 'spring' }] } },
      { version: '1.0.0', mohou: { themePacks: [pack], apps: [theme({ themePackId: 'Spring' })] } },
    ]
    for (const entry of bad) {
      expect(() => resolveCatalog(entry)).toThrow(MarketError)
    }
  })

  it('drops a bundle whose rows are all filtered out of this channel', async () => {
    const original = globalThis.fetch
    // 春 ships only a `local` row, which a registry channel hides. 秋 keeps an npm row.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      version: '1.0.0',
      mohou: {
        themePacks: [pack, { id: 'autumn', name: 'Autumn' }],
        apps: [
          theme({ themePackId: 'spring', source: 'local', file: 'themes.tgz' }),
          theme({ id: 'reed', name: 'Reed', themePackId: 'autumn' }),
        ],
      },
    }), { status: 200 }))
    try {
      const root = mkdtempSync(path.join(tmpdir(), 'mohou-pack-'))
      const listed = await listMarket({
        registry: 'https://registry.example',
        runtimeRoot: path.join(root, 'runtime'),
        localDist: false,
        home: path.join(root, 'home'),
      })
      expect(listed.rows.map(item => item.id)).toEqual(['reed'])
      expect(listed.packs.map(item => item.id)).toEqual(['autumn'])
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('market search', () => {
  it('matches a name before a description and keeps kind on the row', () => {
    const apps = [
      { ...row, id: 'com.example.other', name: 'Other', description: 'desk notes' },
      { ...row, name: 'Desk', description: 'today' },
    ]
    expect(searchMarket(apps, 'desk').map(item => item.id)).toEqual(['com.example.desk', 'com.example.other'])
    expect(searchMarket(apps, 'zzz')).toEqual([])
    expect(searchMarket(apps, 'com.example.desk')[0]?.id).toBe('com.example.desk')
    expect(searchMarket(apps, 'dsk').map(item => item.id)).toContain('com.example.desk')
    expect(searchMarket(apps, 'today')[0]?.id).toBe('com.example.desk')
  })
})

describe('market install', () => {
  it('copies app source, keeps storage, and writes a lock', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(path.join(app, 'storage'), { recursive: true })
    writeFileSync(path.join(app, 'storage', 'keep.txt'), 'records')
    writeFileSync(path.join(app, 'ui.tsx'), 'old')
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'ui.tsx'), 'new')
    const sum = sourceSum(path.join(packed, 'app'))
    await installAppTree({ runtimeRoot: runtime, packageRoot: packed, row, expectedSum: sum, confirm: true })
    expect(readFileSync(path.join(app, 'ui.tsx'), 'utf8')).toBe('new')
    expect(readFileSync(path.join(app, 'storage', 'keep.txt'), 'utf8')).toBe('records')
    expect(readFileSync(path.join(app, '.market.lock'), 'utf8')).toContain(row.version)
  })

  it('refuses a sum mismatch before writing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-'))
    const packed = path.join(root, 'package', 'app')
    mkdirSync(packed, { recursive: true })
    writeFileSync(path.join(packed, 'manifest.json'), JSON.stringify({ id: row.id }))
    await expect(installAppTree({
      runtimeRoot: path.join(root, 'runtime'),
      packageRoot: path.join(root, 'package'),
      row,
      expectedSum: 'nope',
      confirm: true,
    })).rejects.toMatchObject({ code: 'market-sum' })
  })
})

describe('local tarball source', () => {
  it('installs from catalog.json and a tarball, not the registry', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-local-'))
    const packed = path.join(root, 'stage', 'package', 'app')
    mkdirSync(packed, { recursive: true })
    writeFileSync(path.join(packed, 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'ui.tsx'), 'local')
    writeFileSync(path.join(root, 'stage', 'package', 'package.json'), JSON.stringify({ mohou: { sum: sourceSum(packed) } }))
    const tar = spawnSync('tar', ['-czf', path.join(root, 'desk.tgz'), '-C', path.join(root, 'stage'), 'package'])
    expect(tar.status).toBe(0)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [{ ...row, source: 'local', file: 'desk.tgz' }] },
    }))
    const runtime = path.join(root, 'runtime')
    await installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: runtime,
      id: row.id,
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
    })
    expect(readFileSync(path.join(runtime, 'apps', row.id, 'ui.tsx'), 'utf8')).toBe('local')
    const trashed: string[] = []
    await uninstallMarket({
      runtimeRoot: runtime,
      id: row.id,
      kind: 'app',
      confirm: false,
      trashApp: async (appId) => { trashed.push(appId) },
    })
    expect(trashed).toEqual([row.id])
    await expect(uninstallMarket({
      runtimeRoot: runtime,
      id: 'missing.app',
      kind: 'app',
      confirm: true,
      trashApp: async () => undefined,
    })).rejects.toMatchObject({ code: 'market-catalog' })
    expect(() => {
      assertLocalSource('local', false)
    }).toThrow(MarketError)
    expect(() => {
      assertLocalSource('npm', false)
    }).not.toThrow()
  })
})

describe('theme colors', () => {
  it('reads primary then background for each mode', () => {
    const css = ':root[data-mode="light"] { --primary: #111; --background: #eee; } :root[data-mode="dark"] { --primary: #222; --background: #000; }'
    expect(themeColors(css)).toEqual(['#111', '#eee', '#222', '#000'])
  })
})

describe('theme install', () => {
  const themeCss = [
    '/* name: Forest */',
    ':root[data-mode="light"] { --background: #fff; --foreground: #111; --primary: #060; }',
    ':root[data-mode="dark"] { --background: #000; --foreground: #eee; --primary: #0a0; }',
  ].join('\n')

  it('writes a theme file and lock after the package sum matches', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-'))
    const packageRoot = path.join(root, 'package')
    mkdirSync(path.join(packageRoot, 'themes'), { recursive: true })
    writeFileSync(path.join(packageRoot, 'themes', 'theme-forest.css'), themeCss)
    const sum = themesPackageSum(packageRoot)
    writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ mohou: { sum } }))
    const themesDir = path.join(root, 'themes')
    installThemeFile({
      themesDir,
      fileName: 'theme-forest.css',
      css: themeCss,
      row: { ...row, id: 'forest', kind: 'theme', package: '@mohou-apps/themes' },
      packageSum: sum,
      expectedSum: sum,
      confirm: true,
    })
    expect(readFileSync(path.join(themesDir, 'theme-forest.css'), 'utf8')).toBe(themeCss)
    expect(readFileSync(path.join(themesDir, '.market-forest.lock'), 'utf8')).toContain('forest')
  })

  it('refuses an untracked theme file without confirm', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-confirm-'))
    const themesDir = path.join(root, 'themes')
    mkdirSync(themesDir, { recursive: true })
    writeFileSync(path.join(themesDir, 'theme-forest.css'), 'old')
    expect(() => {
      installThemeFile({
        themesDir,
        fileName: 'theme-forest.css',
        css: themeCss,
        row: { ...row, id: 'forest', kind: 'theme', package: '@mohou-apps/themes' },
        packageSum: 'a',
        expectedSum: 'a',
        confirm: false,
      })
    }).toThrow(MarketError)
  })
})

describe('app lockfile reinstall', () => {
  it('skips npm when the lockfile is unchanged and rejects a thrown npm error', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-npm-skip-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(app, { recursive: true })
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'ui.tsx'), 'x')
    const sum = sourceSum(path.join(packed, 'app'))
    let ran = 0
    await installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
      runNpm: async () => {
        ran += 1
        return { exitCode: 0, stderr: '' }
      },
    })
    expect(ran).toBe(0)
    writeFileSync(path.join(packed, 'app', 'package.json'), '{"name":"x"}')
    writeFileSync(path.join(packed, 'app', 'package-lock.json'), '{"lockfileVersion":3}')
    const next = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: next,
      confirm: true,
      runNpm: async () => {
        throw new Error('spawn failed')
      },
    })).rejects.toMatchObject({ code: 'market-install' })
  })

  it('runs npm when the lockfile changes and keeps the new lock on success', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-npm-ok-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(app, { recursive: true })
    writeFileSync(path.join(app, 'package.json'), '{"name":"old"}')
    writeFileSync(path.join(app, 'package-lock.json'), '{"lockfileVersion":1}')
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'package.json'), '{"name":"new"}')
    writeFileSync(path.join(packed, 'app', 'package-lock.json'), '{"lockfileVersion":2}')
    const sum = sourceSum(path.join(packed, 'app'))
    await installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
      runNpm: async () => ({ exitCode: 0, stderr: '' }),
    })
    expect(readFileSync(path.join(app, 'package-lock.json'), 'utf8')).toBe('{"lockfileVersion":2}')
  })

  it('runs npm when the lockfile changes and restores it on failure', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-npm-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(app, { recursive: true })
    writeFileSync(path.join(app, 'package.json'), '{"name":"old"}')
    writeFileSync(path.join(app, 'package-lock.json'), '{"lockfileVersion":1}')
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'package.json'), '{"name":"new"}')
    writeFileSync(path.join(packed, 'app', 'package-lock.json'), '{"lockfileVersion":2}')
    const sum = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
      runNpm: async () => ({ exitCode: 1, stderr: 'boom' }),
    })).rejects.toMatchObject({ code: 'market-install' })
    expect(readFileSync(path.join(app, 'package.json'), 'utf8')).toBe('{"name":"old"}')
    expect(readFileSync(path.join(app, 'package-lock.json'), 'utf8')).toBe('{"lockfileVersion":1}')
  })
})

describe('author market tools', () => {
  it('lists with search and refuses a kind mismatch', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-author-market-'))
    const installs: { id: string; kind: string; overwrite: boolean }[] = []
    const uninstalls: { id: string; kind: string; confirm: boolean }[] = []
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: {
        credentials: emptyCredentials(),
        config: { theme: 'light', palette: 'default', locale: 'zh-CN', chatLanguage: 'zh-CN', hostPort: 0, llm: null },
        log() {},
        push() {},
        http: () => Promise.reject(new Error('unused')),
        bash: () => Promise.reject(new Error('unused')),
        pwsh: () => Promise.reject(new Error('unused')),
        metrics: () => Promise.reject(new Error('unused')),
        processDirectory: root,
        createTemp: () => root,
        provider: createEchoProvider(),
      },
      market: {
        list: async () => ({ rows: [{ ...row, kind: 'app' as const }], packs: [] }),
        install: async (id, kind, overwrite) => { installs.push({ id, kind, overwrite }) },
        uninstall: async (id, kind, confirm) => { uninstalls.push({ id, kind, confirm }) },
      },
    })
    const listed = await author.invoke('mini_app_market_list', { search: 'desk' }) as { apps: { id: string }[] }
    expect(listed.apps.map(item => item.id)).toEqual([row.id])
    expect((await author.invoke('mini_app_market_list', { kind: 'theme' }) as { apps: unknown[] }).apps).toEqual([])
    expect((await author.invoke('mini_app_market_list', {}) as { apps: unknown[] }).apps).toHaveLength(1)
    await expect(author.invoke('mini_app_market_list', { kind: 'plugin' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_market_install', { appId: row.id, kind: 'theme' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_market_install', { appId: 'missing', kind: 'app' })).rejects.toMatchObject({ code: 'market-catalog' })
    await expect(author.invoke('mini_app_market_install', { appId: row.id, kind: 'nope' })).rejects.toMatchObject({ code: 'tool-args' })
    await author.invoke('mini_app_market_install', { appId: row.id, kind: 'app', overwrite: true })
    expect(installs).toEqual([{ id: row.id, kind: 'app', overwrite: true }])
    await expect(author.invoke('mini_app_market_uninstall', { appId: row.id, kind: 'theme' })).rejects.toMatchObject({ code: 'tool-args' })
    await expect(author.invoke('mini_app_market_uninstall', { appId: row.id, kind: 'nope' })).rejects.toMatchObject({ code: 'tool-args' })
    await author.invoke('mini_app_market_uninstall', { appId: row.id, kind: 'app', confirm: true })
    expect(uninstalls).toEqual([{ id: row.id, kind: 'app', confirm: true }])

    // A live backend swaps and the open view is told to refetch; a not-yet-live install signals created.
    const liveRoot = mkdtempSync(path.join(tmpdir(), 'mma-author-market-live-'))
    const events: Array<{ type: string; change?: string }> = []
    const live = createAuthorTools({
      registry: createAppRegistry(liveRoot),
      mcp: new McpClient({}),
      ports: {
        credentials: emptyCredentials(),
        config: { theme: 'light', palette: 'default', locale: 'zh-CN', chatLanguage: 'zh-CN', hostPort: 0, llm: null },
        log() {},
        push() {},
        http: () => Promise.reject(new Error('unused')),
        bash: () => Promise.reject(new Error('unused')),
        pwsh: () => Promise.reject(new Error('unused')),
        metrics: () => Promise.reject(new Error('unused')),
        processDirectory: liveRoot,
        createTemp: () => liveRoot,
        provider: createEchoProvider(),
      },
      env: {},
      market: {
        list: async () => ({ rows: [{ ...row, kind: 'app' as const }], packs: [] }),
        install: async () => undefined,
        uninstall: async () => undefined,
      },
    })
    live.hostEvents.observe((event) => {
      if (event.type === 'market:install' || event.type === 'app:changed' || event.type === 'app:reload') {
        events.push(event.type === 'app:changed' ? { type: event.type, change: event.change } : { type: event.type })
      }
    })
    await registerWithFiles(live, row.id, {
      'manifest.json': JSON.stringify({ id: row.id, name: row.name, description: row.description, version: '1', entry: 'ui.tsx' }),
      'ui.tsx': 'export {}',
      'main.api.ts': `import { defineApp } from '@mohou/contract'
export default defineApp({
  name: 'Desk',
  description: 'Today',
  api: { ping() { return 'pong' } },
})
`,
    })
    events.length = 0
    await live.invoke('mini_app_market_install', { appId: row.id, kind: 'app' })
    expect(events).toEqual([
      { type: 'market:install' },
      { type: 'app:reload' },
      { type: 'app:changed', change: 'created' },
    ])
    expect(await live.invoke('mini_app_call', { appId: row.id, method: 'ping' })).toMatchObject({ ok: true, value: 'pong' })
    await live.invoke('mini_app_market_install', { appId: row.id, kind: 'app', overwrite: true })
    expect(events.slice(-3)).toEqual([
      { type: 'market:install' },
      { type: 'app:reload' },
      { type: 'app:changed', change: 'updated' },
    ])
    expect(await live.invoke('mini_app_call', { appId: row.id, method: 'ping' })).toMatchObject({ ok: true, value: 'pong' })
    const bare = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: {
        credentials: emptyCredentials(),
        config: { theme: 'light', palette: 'default', locale: 'zh-CN', chatLanguage: 'zh-CN', hostPort: 0, llm: null },
        log() {},
        push() {},
        http: () => Promise.reject(new Error('unused')),
        bash: () => Promise.reject(new Error('unused')),
        pwsh: () => Promise.reject(new Error('unused')),
        metrics: () => Promise.reject(new Error('unused')),
        processDirectory: root,
        createTemp: () => root,
        provider: createEchoProvider(),
      },
    })
    await expect(bare.invoke('mini_app_market_list', {})).rejects.toMatchObject({ code: 'market-catalog' })
    await expect(bare.invoke('mini_app_market_install', { appId: row.id, kind: 'app' })).rejects.toMatchObject({ code: 'market-catalog' })
  })
})

describe('list and local theme install', () => {
  const themeCss = [
    '/* name: Forest */',
    ':root[data-mode="light"] { --background: #fff; --foreground: #111; --primary: #060; --card: #fafafa; --border: #ddd; --muted-foreground: #666; --secondary: #eee; --primary-foreground: #fff; }',
    ':root[data-mode="dark"] { --background: #000; --foreground: #eee; --primary: #0a0; --card: #111; --border: #333; --muted-foreground: #aaa; --secondary: #222; --primary-foreground: #000; }',
  ].join('\n')

  it('lists a local catalog with lock state and installs a local theme css', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-list-'))
    const runtime = path.join(root, 'runtime')
    const appDir = path.join(runtime, 'apps', row.id)
    mkdirSync(appDir, { recursive: true })
    writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(appDir, 'ui.tsx'), 'local')
    writeFileSync(path.join(appDir, '.market.lock'), JSON.stringify({
      id: row.id,
      package: row.package,
      version: '1.0.0',
      sum: 'old',
      installedAt: '2026-01-01T00:00:00.000Z',
    }))
    writeFileSync(path.join(root, 'theme-forest.css'), themeCss)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: {
        apps: [
          { ...row, source: 'local', file: 'desk.tgz' },
          {
            id: 'forest',
            name: 'Forest',
            description: 'Green',
            package: '@mohou-apps/themes',
            version: '1.0.0',
            kind: 'theme',
            source: 'local',
            file: 'theme-forest.css',
            colors: ['#060', '#fff', '#0a0', '#000'],
            official: true,
            requires: '99.0.0',
          },
        ],
      },
    }))
    const listed = await listMarket({
      registry: 'https://invalid.example',
      runtimeRoot: runtime,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
    })
    const app = listed.rows.find(item => item.id === row.id)
    const theme = listed.rows.find(item => item.id === 'forest')
    expect(app).toMatchObject({ tracked: true, modified: true, installedVersion: '1.0.0' })
    expect(theme).toMatchObject({ kind: 'theme', installable: false })
    expect(theme?.preview?.light.primary).toBe('#060')
    await installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: runtime,
      id: 'forest',
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
      home: root,
    })
    const written = path.join(root, '.mini-app', 'themes', 'theme-forest.css')
    expect(readFileSync(written, 'utf8')).toBe(themeCss)
  })

  it('refuses app replace without confirm when source changed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-confirm-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(app, { recursive: true })
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(app, 'ui.tsx'), 'old')
    writeFileSync(path.join(app, '.market.lock'), JSON.stringify({
      id: row.id, package: row.package, version: '1.0.0', sum: 'different', installedAt: 't',
    }))
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'ui.tsx'), 'new')
    const sum = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: false,
    })).rejects.toMatchObject({ code: 'market-confirm' })
  })

  it('builds a theme preview from tokens', () => {
    expect(themePreview(themeCss)?.dark.background).toBe('#000')
    expect(themePreview('not a theme')).toBeUndefined()
  })

  it('covers catalog, fetch, and install refusals', () => {
    for (const bad of [
      null,
      { version: '1.0.0' },
      { version: '1.0.0', mohou: {} },
      { version: '1.0.0', mohou: { apps: 'no' } },
      { version: '1.0.0', mohou: { apps: [null] } },
      { version: '1.0.0', mohou: { apps: [{ name: 'X' }] } },
      { version: '1.0.0', mohou: { apps: [{ id: 'x', name: 'X', description: 'd', package: 'p', version: '1', kind: 'plugin' }] } },
      { version: '1.0.0', mohou: { apps: [{ id: 'x', name: 'X', description: 'd', package: 'p', version: '1', source: 'disk' }] } },
      { version: '1.0.0', mohou: { apps: [{ id: 'x', name: 'X', description: 'd', package: 'p', version: '1', source: 'local' }] } },
      { version: '1.0.0', mohou: { apps: [{ id: 'x', name: 'X', description: 'd', package: 'p', version: '1', tags: [1] }] } },
      { version: '1.0.0', mohou: { apps: [{ id: 'x', name: 'X', description: 'd', package: 'p', version: '1', colors: [1] }] } },
    ]) {
      expect(() => resolveCatalog(bad)).toThrow(MarketError)
    }
    expect(resolveCatalog({
      version: '1.0.0',
      mohou: {
        apps: [{
          id: 'x', name: 'X', description: 'd', package: 'p', version: '1',
          appKind: 'workbench', tags: ['a'], requires: '1.0.0', author: 'me',
          downloads: 1, official: true, colors: ['#111'],
        }],
      },
    }).apps[0]).toMatchObject({ appKind: 'workbench', official: true, author: 'me' })
    expect(versionCompared('1.0.0', 'nope')).toBe('invalid')
    expect(versionCompared('nope', '1.0.0')).toBe('invalid')
    expect(versionCompared('1.0.0', '1.0.1')).toBe('less')
    expect(versionCompared('2.0.0', '1.9.9')).toBe('greater')
    expect(versionCompared('1.0.0', '1.0.0')).toBe('equal')
    expect(versionCompared('1.2.0', '1.10.0')).toBe('less')
    expect(readLocalCatalog(path.join(tmpdir(), 'missing-market-dir'))).toBeUndefined()
    expect(() => extractTarball(path.join(tmpdir(), 'nope.tgz'))).toThrow(MarketError)
    expect(() => readThemeCss(tmpdir(), 'theme-missing.css')).toThrow(MarketError)
    expect(searchMarket([{ ...row }], undefined)).toEqual([row])
    expect(searchMarket([{ ...row }], '   ')).toEqual([row])
    expect(searchMarket([{ ...row, version: '2.3.4' }], '2.3').map(item => item.id)).toEqual([row.id])
    expect(searchMarket([{ ...row, tags: ['notes'] }], 'notes')[0]?.id).toBe(row.id)
    expect(searchMarket([{ ...row, name: 'Alpha' }, { ...row, id: 'b', name: 'Alpine' }], 'alp').map(item => item.name)).toEqual(['Alpha', 'Alpine'])
    expect(searchMarket([{ ...row, name: 'Desk', description: '' }], 'zzzzzz')).toEqual([])
  })

  it('surfaces registry fetch failures', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response('nope', { status: 500 })
    try {
      await expect(fetchCatalog('https://registry.example')).rejects.toMatchObject({ code: 'market-catalog' })
      await expect(fetchPackage('https://registry.example', '@mohou-apps/x')).rejects.toMatchObject({ code: 'market-package' })
    } finally {
      globalThis.fetch = original
    }
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/latest')) return new Response(JSON.stringify({ dist: {} }), { status: 200 })
      return new Response('nope', { status: 404 })
    }
    try {
      await expect(fetchPackage('https://registry.example', '@mohou-apps/x')).rejects.toMatchObject({ code: 'market-package' })
    } finally {
      globalThis.fetch = original
    }
  })

  it('fetches a registry catalog and package through fetch()', async () => {
    const original = globalThis.fetch
    const packed = path.join(mkdtempSync(path.join(tmpdir(), 'mohou-fetch-pkg-')), 'stage')
    mkdirSync(path.join(packed, 'package', 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'package', 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'package', 'package.json'), JSON.stringify({ mohou: { sum: sourceSum(path.join(packed, 'package', 'app')) } }))
    const tarPath = path.join(packed, 'pack.tgz')
    expect(spawnSync('tar', ['-czf', tarPath, '-C', packed, 'package']).status).toBe(0)
    const tarball = readFileSync(tarPath)
    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('catalog')) {
        return new Response(JSON.stringify({
          version: '1.0.0',
          mohou: { apps: [{ ...row, source: 'npm' }] },
        }), { status: 200 })
      }
      if (url.endsWith('/latest') && url.includes('com.example.desk')) {
        return new Response(JSON.stringify({ dist: { tarball: 'https://registry.example/pack.tgz' } }), { status: 200 })
      }
      if (url.endsWith('pack.tgz')) {
        return new Response(tarball, { status: 200 })
      }
      return new Response('missing', { status: 404 })
    })
    try {
      const listed = await listMarket({
        registry: 'https://registry.example',
        runtimeRoot: path.join(packed, 'runtime'),
        localDist: false,
      })
      expect(listed.rows[0]?.id).toBe(row.id)
      await installMarket({
        registry: 'https://registry.example',
        runtimeRoot: path.join(packed, 'runtime'),
        id: row.id,
        confirm: true,
        localDist: false,
      })
      expect(readFileSync(path.join(packed, 'runtime', 'apps', row.id, 'manifest.json'), 'utf8')).toContain(row.id)
    } finally {
      globalThis.fetch = original
    }
  })

  it('refuses a missing applied schema file before write', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-schema-missing-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(path.join(app, 'storage'), { recursive: true })
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    const db = new Database(path.join(app, 'storage', 'app.sqlite'))
    db.exec('CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, checksum TEXT NOT NULL)')
    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)').run(1, 'any')
    db.close()
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    const sum = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
    })).rejects.toMatchObject({ code: 'market-schema' })
  })

  it('refuses a schema checksum change before write', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-schema-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(path.join(app, 'storage'), { recursive: true })
    writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({ id: row.id }))
    const db = new Database(path.join(app, 'storage', 'app.sqlite'))
    db.exec('CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, checksum TEXT NOT NULL)')
    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)').run(1, 'old')
    db.close()
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app', 'schema'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'schema', '001_init.sql'), 'SELECT 1;')
    const sum = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: runtime,
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
    })).rejects.toMatchObject({ code: 'market-schema' })
  })

  it('installs over applied zero-padded migrations and applies the new file on open', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-schema-applied-'))
    const runtime = path.join(root, 'runtime')
    const app = path.join(runtime, 'apps', row.id)
    mkdirSync(path.join(app, 'schema'), { recursive: true })
    writeFileSync(path.join(app, 'schema', '001_tasks_init.sql'), 'CREATE TABLE tasks (id INTEGER PRIMARY KEY)')
    const live = await openStorage(app)
    live.close()
    writeFileSync(path.join(app, 'ui.tsx'), 'old')
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app', 'schema'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'schema', '001_tasks_init.sql'), 'CREATE TABLE tasks (id INTEGER PRIMARY KEY)')
    writeFileSync(path.join(packed, 'app', 'schema', '002_seed.sql'), 'INSERT INTO tasks (id) VALUES (1)')
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(packed, 'app', 'ui.tsx'), 'new')
    const sum = sourceSum(path.join(packed, 'app'))
    await installAppTree({ runtimeRoot: runtime, packageRoot: packed, row, expectedSum: sum, confirm: true })
    expect(readFileSync(path.join(app, 'ui.tsx'), 'utf8')).toBe('new')
    const again = await openStorage(app)
    expect(await again.connect().query('SELECT id FROM tasks')).toEqual([{ id: 1 }])
    again.close()
  })

  it('refuses a package id mismatch and a bad theme file', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-market-id-'))
    const packed = path.join(root, 'package')
    mkdirSync(path.join(packed, 'app'), { recursive: true })
    writeFileSync(path.join(packed, 'app', 'manifest.json'), JSON.stringify({ id: 'other.id' }))
    const sum = sourceSum(path.join(packed, 'app'))
    await expect(installAppTree({
      runtimeRoot: path.join(root, 'runtime'),
      packageRoot: packed,
      row,
      expectedSum: sum,
      confirm: true,
    })).rejects.toMatchObject({ code: 'market-id' })
    expect(() => {
      installThemeFile({
        themesDir: path.join(root, 'themes'),
        fileName: 'theme-forest.css',
        css: 'bad',
        row: { ...row, id: 'forest', kind: 'theme', package: '@mohou-apps/themes' },
        packageSum: 'a',
        expectedSum: 'a',
        confirm: true,
      })
    }).toThrow(MarketError)
  })
})

const goodTheme = [
  '/* name: Ink */',
  ':root[data-mode="light"] { --background: #fff; --foreground: #111; --primary: #2563eb; --card: #fafafa; --border: #ddd; --muted-foreground: #666; --secondary: #eee; --primary-foreground: #fff; }',
  ':root[data-mode="dark"] { --background: #000; --foreground: #eee; --primary: #3b82f6; --card: #111; --border: #333; --muted-foreground: #aaa; --secondary: #222; --primary-foreground: #000; }',
].join('\n')

describe('themes package', () => {
  /** Two themes in one tarball, the published shape for @mohou-apps/themes. */
  function stageThemeTarball(root: string, name: string, withSum = true): string {
    const stage = path.join(root, 'stage')
    const themes = path.join(stage, 'package', 'themes')
    mkdirSync(themes, { recursive: true })
    writeFileSync(path.join(themes, 'theme-ink.css'), goodTheme)
    writeFileSync(path.join(themes, 'theme-plum.css'), goodTheme.replace('Ink', 'Plum'))
    const sum = themesPackageSum(path.join(stage, 'package'))
    writeFileSync(
      path.join(stage, 'package', 'package.json'),
      JSON.stringify({ name: '@mohou-apps/themes', ...(withSum ? { mohou: { sum } } : {}) }),
    )
    const tar = path.join(root, name)
    expect(spawnSync('tar', ['-czf', tar, '-C', stage, 'package']).status).toBe(0)
    return tar
  }

  function themeRow(id: string, file: string) {
    return {
      id,
      name: id,
      description: id,
      package: '@mohou-apps/themes',
      version: '1.0.0',
      kind: 'theme' as const,
      source: 'local' as const,
      file,
    }
  }

  it('installs both themes from one tarball and caches the package for previews', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-tar-'))
    stageThemeTarball(root, 'themes.tgz')
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [themeRow('ink', 'themes.tgz'), themeRow('plum', 'themes.tgz')] },
    }))
    const home = path.join(root, 'home')
    const env = { MINI_APP_MARKET_DIR: root }
    const listed = await listMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      localDist: true,
      env,
      home,
    })
    // Both rows get a preview from the one extracted package.
    expect(listed.rows.map(row => row.preview?.light.primary)).toEqual(['#2563eb', '#2563eb'])
    const ink = await installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      id: 'ink',
      confirm: false,
      localDist: true,
      env,
      home,
    })
    expect(ink).toEqual({ id: 'ink', kind: 'theme' })
    expect(readFileSync(path.join(home, '.mini-app/themes/theme-ink.css'), 'utf8')).toBe(goodTheme)
    const after = await listMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      localDist: true,
      env,
      home,
    })
    expect(after.rows.find(row => row.id === 'ink')).toMatchObject({ tracked: true, installedVersion: '1.0.0', modified: false })
    // A hand edit to the installed file is the modified state.
    writeFileSync(path.join(home, '.mini-app/themes/theme-ink.css'), 'edited')
    const edited = await listMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      localDist: true,
      env,
      home,
    })
    expect(edited.rows.find(row => row.id === 'ink')).toMatchObject({ tracked: true, modified: true })
    await expect(uninstallMarket({
      runtimeRoot: path.join(root, 'runtime'),
      id: 'ink',
      kind: 'theme',
      confirm: false,
      home,
      trashApp: async () => undefined,
    })).rejects.toMatchObject({ code: 'market-confirm' })
    await uninstallMarket({
      runtimeRoot: path.join(root, 'runtime'),
      id: 'ink',
      kind: 'theme',
      confirm: true,
      home,
      trashApp: async () => undefined,
    })
    expect(existsSync(path.join(home, '.mini-app/themes/theme-ink.css'))).toBe(false)
  })

  it('lists a theme with no file on disk as not installed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-none-'))
    stageThemeTarball(root, 'themes.tgz')
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [themeRow('ink', 'themes.tgz')] },
    }))
    const listed = await listMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
      home: path.join(root, 'home'),
    })
    expect(listed.rows[0]).toMatchObject({ id: 'ink' })
    expect(listed.rows[0]?.tracked).toBeUndefined()
  })

  it('refuses a themes tarball with no sum, and a tarball that is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-nosum-'))
    stageThemeTarball(root, 'themes.tgz', false)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [themeRow('ink', 'themes.tgz')] },
    }))
    await expect(installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      id: 'ink',
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
      home: path.join(root, 'home'),
    })).rejects.toMatchObject({ code: 'market-sum' })
    const empty = mkdtempSync(path.join(tmpdir(), 'mohou-theme-notar-'))
    writeFileSync(path.join(empty, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [themeRow('ink', 'themes.tgz')] },
    }))
    await expect(installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(empty, 'runtime'),
      id: 'ink',
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: empty },
      home: empty,
    })).rejects.toMatchObject({ code: 'market-package' })
  })

  it('reads a theme that ships at the package root, not under themes/', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-theme-root-'))
    const stage = path.join(root, 'stage')
    mkdirSync(path.join(stage, 'package'), { recursive: true })
    writeFileSync(path.join(stage, 'package', 'theme-ink.css'), goodTheme)
    writeFileSync(
      path.join(stage, 'package', 'package.json'),
      JSON.stringify({ name: '@mohou-apps/themes', mohou: { sum: themesPackageSum(path.join(stage, 'package')) } }),
    )
    expect(spawnSync('tar', ['-czf', path.join(root, 'themes.tgz'), '-C', stage, 'package']).status).toBe(0)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [themeRow('ink', 'themes.tgz')] },
    }))
    const home = path.join(root, 'home')
    await installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      id: 'ink',
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
      home,
    })
    expect(existsSync(path.join(home, '.mini-app/themes/theme-ink.css'))).toBe(true)
  })

  it('returns the app kind from a local app install', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-app-kind-'))
    const stage = path.join(root, 'stage')
    mkdirSync(path.join(stage, 'package', 'app'), { recursive: true })
    writeFileSync(path.join(stage, 'package', 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(stage, 'package', 'app', 'ui.tsx'), 'x')
    writeFileSync(
      path.join(stage, 'package', 'package.json'),
      JSON.stringify({ mohou: { sum: sourceSum(path.join(stage, 'package', 'app')) } }),
    )
    expect(spawnSync('tar', ['-czf', path.join(root, 'desk.tgz'), '-C', stage, 'package']).status).toBe(0)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [{ ...row, source: 'local', file: 'desk.tgz' }] },
    }))
    const installed = await installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      id: row.id,
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
    })
    expect(installed).toEqual({ id: row.id, kind: 'app' })
  })

  it('refuses an app tarball whose package.json has no sum', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mohou-app-nosum-'))
    const stage = path.join(root, 'stage')
    mkdirSync(path.join(stage, 'package', 'app'), { recursive: true })
    writeFileSync(path.join(stage, 'package', 'app', 'manifest.json'), JSON.stringify({ id: row.id }))
    writeFileSync(path.join(stage, 'package', 'package.json'), JSON.stringify({ name: 'x' }))
    expect(spawnSync('tar', ['-czf', path.join(root, 'desk.tgz'), '-C', stage, 'package']).status).toBe(0)
    writeFileSync(path.join(root, 'market-catalog.json'), JSON.stringify({
      version: '1.0.0',
      mohou: { apps: [{ ...row, source: 'local', file: 'desk.tgz' }] },
    }))
    await expect(installMarket({
      registry: 'https://invalid.example',
      runtimeRoot: path.join(root, 'runtime'),
      id: row.id,
      confirm: true,
      localDist: true,
      env: { MINI_APP_MARKET_DIR: root },
    })).rejects.toMatchObject({ code: 'market-sum' })
  })
})
