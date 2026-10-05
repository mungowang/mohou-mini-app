import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { createCredentials, createHost, hostAuthoringToken, hostMcpPath } from '../src/index.ts'

import { freePort } from './free-port.ts'

/**
 * A reference that names nothing leaves that one server out. It must not keep the host from
 * starting: the panel that fixes the credential is served by the host that would have failed.
 */
describe('a reference with no value', () => {
  it('boots the host, reports the server it left out, and keeps the rest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-boot-'))
    await writeFile(hostMcpPath(root), JSON.stringify({
      filesystem: { command: 'node', args: ['--experimental-strip-types', 'packages/mcp/client/tests/fixture-server.ts'] },
      git: { command: 'npx', env: { TOKEN: '${credential:nope}' } },
    }))
    const host = await createHost({
      runtimeRoot: root,
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      credentials: createCredentials([{ kind: 'builtin-json', file: join(root, 'credentials.json') }]),
      seedStartup: false,
    })
    const started = await host.start()
    try {
      const token = readFileSync(hostAuthoringToken(root), 'utf8').trim()
      const body = await fetch(`http://127.0.0.1:${started.port}/api/mcp-servers`, { headers: { authorization: `Bearer ${token}` } })
      const parsed = await body.json() as { result?: { servers?: unknown[]; unresolved?: unknown[] } }
      // The file still lists both: the panel has to show the row it can edit, and say which one is not running.
      expect(parsed.result?.servers).toEqual([
        {
          id: 'filesystem',
          command: 'node',
          args: ['--experimental-strip-types', 'packages/mcp/client/tests/fixture-server.ts'],
        },
        { id: 'git', command: 'npx', env: { TOKEN: '${credential:nope}' } },
      ])
      expect(parsed.result?.unresolved).toEqual([{
        id: 'git',
        code: 'mcp-reference-unknown',
        message: 'git env.TOKEN names an unknown credential: nope',
      }])
      const listed = await host.author.invoke('mini_app_mcp_list', {}) as { servers: Array<{ id: string; error?: { code: string; message?: string } }> }
      expect(listed.servers.find(server => server.id === 'filesystem')?.error).toBeUndefined()
      expect(listed.servers.find(server => server.id === 'git')?.error).toEqual({
        code: 'mcp-reference-unknown',
        message: 'git env.TOKEN names an unknown credential: nope',
      })
      const tools = await host.author.invoke('mini_app_mcp_tools', { serverId: 'git' }) as { error?: { code: string } }
      expect(tools.error?.code).toBe('mcp-reference-unknown')
    } finally {
      await host.dispose()
    }
  }, 60_000)
})
