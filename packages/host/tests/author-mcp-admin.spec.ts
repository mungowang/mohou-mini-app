import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { readMcpEditor } from '../src/host/mcp-editor.ts'
import { hostMcpPath } from '../src/host/layout.ts'
import { createAppRegistry, createAuthorTools, emptyCredentials, startAuthorHttp, type AuthorCallPorts } from '../src/index.ts'

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: { theme: 'light', palette: 'default', locale: 'zh-CN', chatLanguage: 'zh-CN', hostPort: 0, llm: null },
    log() {},
    push() {},
    http: () => Promise.reject(new Error('unused')),
    bash: () => Promise.reject(new Error('unused')),
    pwsh: () => Promise.reject(new Error('unused')),
    metrics: () => Promise.reject(new Error('unused')),
    processDirectory: tmpdir(),
    createTemp: () => tmpdir(),
    provider: createEchoProvider(),
  }
}

async function saved(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(hostMcpPath(root), 'utf8')) as Record<string, unknown>
}

interface Added {
  added: boolean
  id: string
  check?: { ok: boolean; code?: string; tools: Array<{ name: string }> }
  servers: Array<{ id: string }>
}

describe('mini_app_mcp_add and mini_app_mcp_remove', () => {
  it('adds a server, checks it by opening it, and makes it live', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-admin-'))
    const mcp = new McpClient({})
    const author = createAuthorTools({ registry: createAppRegistry(root), mcp, env: {}, ports: ports() })
    const http = await startAuthorHttp({ author, token: 'secret' })
    try {
      // The host's own MCP endpoint is the fixture server: an accepted check proves the whole path.
      const added = await author.invoke('mini_app_mcp_add', {
        id: 'self',
        url: `http://127.0.0.1:${http.port}/mcp`,
        transport: 'streamable-http',
        headers: { authorization: 'Bearer secret' },
      }) as Added
      expect(added).toMatchObject({ added: true, id: 'self' })
      expect(added.check?.ok).toBe(true)
      expect(added.check?.tools.map(tool => tool.name)).toContain('mini_app_list')
      expect(added.servers.map(server => server.id)).toEqual(['self'])
      expect(await saved(root)).toMatchObject({ self: { url: `http://127.0.0.1:${http.port}/mcp`, transport: 'streamable-http' } })
      // The token went in. The result shows a masked form, not the value.
      expect(await saved(root)).toMatchObject({ self: { headers: { authorization: 'Bearer secret' } } })
      expect(JSON.stringify(added)).not.toContain('Bearer secret')
      expect(added.servers[0]).toMatchObject({ headers: { authorization: 'Bearer se*****et' } })
      // Live: no restart. The authoring surface lists what the client holds.
      expect(mcp.serverIds()).toEqual(['self'])
      expect(JSON.stringify(await author.invoke('mini_app_mcp_list', {}))).toContain('mini_app_list')

      const replaced = await author.invoke('mini_app_mcp_add', {
        id: 'self',
        url: `http://127.0.0.1:${http.port}/mcp`,
        transport: 'streamable-http',
        headers: { authorization: 'Bearer secret' },
        description: 'this host',
      }) as Added
      expect(replaced.servers.map(server => server.id)).toEqual(['self'])
      expect(await saved(root)).toMatchObject({ self: { description: 'this host' } })

      const removed = await author.invoke('mini_app_mcp_remove', { id: 'self' }) as { removed: boolean }
      expect(removed.removed).toBe(true)
      expect(mcp.serverIds()).toEqual([])
      expect(await author.invoke('mini_app_mcp_remove', { id: 'self' })).toMatchObject({ removed: false })
      expect(await saved(root)).toEqual({})
    } finally {
      await http.close()
      await mcp.dispose()
      await author.dispose()
    }
  })

  it('refuses a row whose check fails, and keeps it with force', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-admin-bad-'))
    const mcp = new McpClient({})
    const author = createAuthorTools({ registry: createAppRegistry(root), mcp, env: {}, ports: ports() })
    try {
      const down = { id: 'down', url: 'http://127.0.0.1:1/mcp', transport: 'streamable-http' as const }
      const refused = await author.invoke('mini_app_mcp_add', down) as Added
      expect(refused.added).toBe(false)
      expect(refused.check?.ok).toBe(false)
      expect(refused.servers).toEqual([])
      // Neither the file nor the client took the row.
      expect(mcp.serverIds()).toEqual([])
      await expect(readMcpEditor(root, {})).resolves.toEqual([])

      const forced = await author.invoke('mini_app_mcp_add', { ...down, force: true }) as Added
      expect(forced.added).toBe(true)
      expect(mcp.serverIds()).toEqual(['down'])
      expect(await saved(root)).toHaveProperty('down')

      const skipped = await author.invoke('mini_app_mcp_add', { id: 'quiet', command: 'node', args: ['-e', '0'], env: { GITHUB_TOKEN: 'ghp_shh' }, check: false }) as Added
      expect(skipped.added).toBe(true)
      expect(skipped.check).toBeUndefined()
      expect(mcp.serverIds()).toEqual(['down', 'quiet'])
      expect(await saved(root)).toMatchObject({ quiet: { env: { GITHUB_TOKEN: 'ghp_shh' } } })
      expect(JSON.stringify(skipped)).not.toContain('ghp_shh')
      expect(skipped.servers.find(server => server.id === 'quiet')).toMatchObject({ env: { GITHUB_TOKEN: 'ghp_*****' } })
    } finally {
      await mcp.dispose()
      await author.dispose()
    }
  })

  it('rejects a row with neither command nor url, a bad transport, and a bad env map', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-admin-args-'))
    const mcp = new McpClient({})
    const author = createAuthorTools({ registry: createAppRegistry(root), mcp, env: {}, ports: ports() })
    try {
      await expect(author.invoke('mini_app_mcp_add', { id: 'x' })).rejects.toMatchObject({ code: 'tool-args' })
      await expect(author.invoke('mini_app_mcp_add', { id: 'x', url: 'http://127.0.0.1:1/mcp', transport: 'nope' })).rejects.toMatchObject({ code: 'tool-args' })
      await expect(author.invoke('mini_app_mcp_add', { id: 'x', command: 'node', env: { A: 1 } })).rejects.toMatchObject({ code: 'tool-args' })
      await expect(author.invoke('mini_app_mcp_remove', {})).rejects.toMatchObject({ code: 'tool-args' })
      expect(mcp.serverIds()).toEqual([])
      expect(await readMcpEditor(root, {})).toEqual([])
    } finally {
      await mcp.dispose()
      await author.dispose()
    }
  })
})
