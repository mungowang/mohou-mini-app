import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ensureRuntimeAppsLayout,
  installStartupSamples,
  startupSamples,
  startupSeedMarker,
} from '../src/apps/startup-seed.ts'

async function writeTemplate(skill: string, name: string, id: string, title: string): Promise<void> {
  const template = join(skill, 'templates', name)
  await mkdir(template, { recursive: true })
  await writeFile(join(template, 'manifest.json'), JSON.stringify({
    id,
    name: title,
    description: 'sample',
    version: '0.1.0',
    entry: 'ui.tsx',
  }))
  await writeFile(join(template, 'ui.tsx'), 'export default function App() { return null }\n')
  await writeFile(join(template, 'main.api.ts'), 'export default {}\n')
}

describe('ensureRuntimeAppsLayout', () => {
  it('seeds every startup sample from the skill templates once on an empty runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-seed-'))
    const skill = await mkdtemp(join(tmpdir(), 'mma-skill-'))
    await writeTemplate(skill, 'today', 'com.example.today', '今日台子')
    await writeTemplate(skill, 'board', 'com.example.board', '阶段看板')
    await writeTemplate(skill, 'lab', 'com.example.lab', '实验台')

    const first = await ensureRuntimeAppsLayout(root, skill)
    expect(first.kind).toBe('seeded')
    if (first.kind !== 'seeded') return
    expect(first.appIds).toEqual(startupSamples.map(sample => sample.appId))
    for (const sample of startupSamples) {
      const manifest = JSON.parse(await readFile(join(root, 'apps', sample.appId, 'manifest.json'), 'utf8')) as {
        id: string
      }
      expect(manifest.id).toBe(sample.appId)
    }
    expect(await readFile(join(root, startupSeedMarker), 'utf8')).toContain('com.mohou.board')

    const second = await ensureRuntimeAppsLayout(root, skill)
    expect(second).toEqual({ kind: 'skipped', reason: 'marked' })
  })

  it('installs the samples a library is missing and leaves the rest alone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-samples-'))
    const skill = await mkdtemp(join(tmpdir(), 'mma-samples-skill-'))
    await writeTemplate(skill, 'today', 'com.example.today', '今日台子')
    await writeTemplate(skill, 'board', 'com.example.board', '阶段看板')
    await writeTemplate(skill, 'lab', 'com.example.lab', '实验台')
    // One of them is already here, with the owner's own edit in it.
    const mine = join(root, 'apps', 'com.mohou.today')
    await mkdir(mine, { recursive: true })
    await writeFile(join(mine, 'manifest.json'), JSON.stringify({
      id: 'com.mohou.today',
      name: '我的今日',
      description: 'edited',
      version: '9',
      entry: 'ui.tsx',
    }))

    const first = await installStartupSamples(root, skill)
    expect(first.installed).toEqual(['com.mohou.board', 'com.mohou.lab'])
    expect(first.skipped).toEqual(['com.mohou.today'])
    const kept = JSON.parse(await readFile(join(mine, 'manifest.json'), 'utf8')) as { name: string }
    expect(kept.name).toBe('我的今日')

    // Asking again installs nothing and skips everything.
    const second = await installStartupSamples(root, skill)
    expect(second.installed).toEqual([])
    expect(second.skipped).toEqual(startupSamples.map(sample => sample.appId))

    // No skill source means nothing to copy, and nothing is reported as installed.
    const bare = await installStartupSamples(await mkdtemp(join(tmpdir(), 'mma-samples-bare-')), undefined)
    expect(bare.installed).toEqual([])
  })

  it('skips when apps already exist and still writes the marker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-seed-has-'))
    const apps = join(root, 'apps')
    await mkdir(join(apps, 'com.example.mine'), { recursive: true })
    await writeFile(join(apps, 'com.example.mine', 'manifest.json'), JSON.stringify({
      id: 'com.example.mine',
      name: 'Mine',
      description: 'x',
      version: '1',
      entry: 'ui.tsx',
    }))
    const result = await ensureRuntimeAppsLayout(root, '/missing-skill')
    expect(result).toEqual({ kind: 'skipped', reason: 'has-apps' })
    expect(await readFile(join(root, startupSeedMarker), 'utf8')).toContain('has-apps')
  })
})
