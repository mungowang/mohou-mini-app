import { describe, expect, it } from 'vitest'

import { McpClient, McpError, resolveMcpConfig, type McpServerSpec } from '../src/index.ts'

describe('resolveMcpConfig', () => {
  it('names what a server printed when it closes before it answers', async () => {
    // A stdio server that dies reports "Connection closed" and nothing else; its stderr is the why.
    const client = new McpClient({
      broken: { command: process.execPath, args: ['-e', "console.error('boom: missing token'); process.exit(3)"] },
    }, {}, 0)
    const error = await client.listTools('broken').catch((thrown: unknown) => thrown)
    expect(error).toMatchObject({ code: 'mcp-start-failed' })
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain('boom: missing token')
    await client.dispose()
  })

  it('accepts a wrapper and skips settings', () => {
    const servers = resolveMcpConfig({
      mcpServers: {
        settings: { theme: 'dark' },
        echo: { command: 'node', args: ['server.js'] },
      },
    })
    expect(servers.echo).toEqual({ command: 'node', args: ['server.js'] })
    expect(servers.settings).toBeUndefined()
  })

  it('rejects a present file that is not a map', () => {
    expect(resolveMcpConfig(undefined)).toEqual({})
    expect(() => resolveMcpConfig([])).toThrow(McpError)
    expect(() => resolveMcpConfig({ broken: { nope: true } })).toThrow(McpError)
    expect(resolveMcpConfig({
      remote: { url: 'https://example.com/mcp', transport: 'sse', headers: { a: 'b' } },
      plain: { url: 'https://example.com/other' },
    }).remote).toEqual({ url: 'https://example.com/mcp', transport: 'sse', headers: { a: 'b' } })
  })
})

describe('McpClient', () => {
  it('passes tool args through and does not unwrap input', async () => {
    const client = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    })
    try {
      const result = await client.call('echo', 'echo', { input: 'plain' })
      expect(result).toBe('plain')
      await expect(client.call('missing', 'echo')).rejects.toMatchObject({ code: 'mcp-not-connected' })
      await expect(client.call('echo', 'fail')).rejects.toMatchObject({ code: 'mcp-tool-failed' })
      const http = new McpClient({
        sse: { url: 'http://127.0.0.1:9/mcp', transport: 'sse' },
        http: { url: 'http://127.0.0.1:9/mcp', headers: { a: 'b' } },
      })
      await expect(http.call('sse', 'echo')).rejects.toMatchObject({ code: 'mcp-start-failed' })
      await expect(http.call('http', 'echo')).rejects.toMatchObject({ code: 'mcp-start-failed' })
      await http.dispose()
    } finally {
      await client.dispose()
    }
  })

  it('replaces a dropped session only after the previous child has exited', async () => {
    const client = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    }, process.env, 1)
    try {
      const first = Number(await client.call('echo', 'pid'))
      await client.call('echo', 'exit')
      await waitUntil(() => !processAlive(first))
      const second = Number(await client.call('echo', 'pid'))
      expect(second).not.toBe(first)
      expect(processAlive(first)).toBe(false)
    } finally {
      await client.dispose()
    }
  })

  it('stops retrying inside one call when the budget is spent', async () => {
    const client = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    }, process.env, 1)
    try {
      await expect(client.call('echo', 'die')).rejects.toMatchObject({ code: 'mcp-start-failed' })
      expect(client.serverIds()).toContain('echo')
    } finally {
      await client.dispose()
    }
  })

  it('returns structured and non-text results, and redacts env secrets', async () => {
    const client = new McpClient({
      echo: {
        command: 'node',
        args: ['packages/mcp/client/tests/fixture-server.ts'],
        env: { LEAK: 'supersecret', SHORT: 'ab' },
      },
    })
    try {
      const [one, two] = await Promise.all([
        client.call('echo', 'pid'),
        client.call('echo', 'echo'),
      ])
      expect(one).toBeTypeOf('string')
      expect(two).toBe('')
      expect(await client.call('echo', 'struct')).toEqual({ ok: true })
      expect(await client.call('echo', 'image')).toEqual([{ type: 'image', data: 'aa', mimeType: 'image/png' }] )
      expect((await client.listTools('echo')).map(tool => tool.name).sort()).toEqual([
        'blank', 'die', 'echo', 'exit', 'fail', 'image', 'pid', 'struct',
      ])
      await expect(client.call('echo', 'fail')).rejects.toThrow(/\[redacted\]/)
      await expect(client.call('echo', 'fail')).rejects.toThrow(/ab/)
      await expect(client.call('echo', 'blank')).rejects.toThrow('mcp tool failed')
    } finally {
      await client.dispose()
    }
  })

  it('opens again on the next call after a dropped session', async () => {
    const client = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    }, process.env, 0)
    try {
      const pid = Number(await client.call('echo', 'pid'))
      await client.call('echo', 'exit')
      await waitUntil(() => !processAlive(pid))
      const next = Number(await client.call('echo', 'pid'))
      expect(next).not.toBe(pid)
      expect(client.serverIds()).toContain('echo')
    } finally {
      await client.dispose()
    }
  })

  it('replaces the live set: a kept spec keeps its session, a changed or removed one does not', async () => {
    const spec: McpServerSpec = { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] }
    const client = new McpClient({ echo: spec })
    try {
      const first = Number(await client.call('echo', 'pid'))

      // An identical spec keeps the child: the set can be re-applied without dropping sessions.
      await client.setServers({ echo: { ...spec }, added: spec })
      expect(client.serverIds()).toEqual(['echo', 'added'])
      expect(Number(await client.call('echo', 'pid'))).toBe(first)

      // A changed spec retires the session. The next call opens the new one.
      await client.setServers({ echo: { ...spec, env: { FIXTURE: 'two' } } })
      expect(client.serverIds()).toEqual(['echo'])
      const second = Number(await client.call('echo', 'pid'))
      expect(second).not.toBe(first)
      await waitUntil(() => !processAlive(first))

      // A removed id is not connected, and its child exits.
      await client.setServers({})
      expect(client.serverIds()).toEqual([])
      await expect(client.call('echo', 'pid')).rejects.toMatchObject({ code: 'mcp-not-connected' })
      await waitUntil(() => !processAlive(second))
    } finally {
      await client.dispose()
    }
  })
})

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntil(ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the child to exit')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
