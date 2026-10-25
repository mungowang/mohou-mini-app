import { describe, expect, it } from 'vitest'

import { McpClient, McpError } from '@mohou/mcp-client'

import { listMcpForAuthor, listMcpServersForApp, listMcpToolsForApp, toolsMcpForAuthor } from '../src/index.ts'

describe('listMcpForAuthor', () => {
  it('lists tool names only and keeps a missing server from dropping the rest', async () => {
    const client = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
      gone: { command: 'mma-missing-mcp' },
    })
    try {
      const listed = await listMcpForAuthor(client)
      const echo = listed.servers.find(server => server.id === 'echo')
      const gone = listed.servers.find(server => server.id === 'gone')
      expect(echo?.tools?.slice().sort()).toEqual(['blank', 'die', 'echo', 'exit', 'fail', 'image', 'pid', 'struct'])
      expect(echo?.tools?.[0] && typeof echo.tools[0] === 'string').toBe(true)
      expect(gone?.error?.code).toBe('mcp-start-failed')
    } finally {
      await client.dispose()
    }
  })

  it('maps known list failures without dropping siblings', async () => {
    const client = {
      serverIds: () => ['ok', 'missing', 'broken'],
      listTools: async (id: string) => {
        if (id === 'ok') return [{ name: 'ping', description: 'says hi', inputSchema: { type: 'object' } }]
        if (id === 'missing') throw new McpError('mcp-not-connected', 'gone')
        throw new Error('boom')
      },
    }
    const listed = await listMcpForAuthor(client as never)
    expect(listed.servers).toEqual([
      { id: 'ok', tools: ['ping'] },
      { id: 'missing', error: { code: 'mcp-not-connected' } },
      { id: 'broken', error: { code: 'mcp-start-failed' } },
    ])
  })
})

describe('toolsMcpForAuthor', () => {
  it('returns full tool detail for one server, and one tool when named', async () => {
    const client = {
      listTools: async () => [
        { name: 'ping', description: 'says hi', inputSchema: { type: 'object' } },
        { name: 'pong', inputSchema: { type: 'object', properties: {} } },
      ],
    }
    expect(await toolsMcpForAuthor(client as never, 'demo')).toEqual({
      id: 'demo',
      tools: [
        { name: 'ping', description: 'says hi', inputSchema: { type: 'object' } },
        { name: 'pong', inputSchema: { type: 'object', properties: {} } },
      ],
    })
    expect(await toolsMcpForAuthor(client as never, 'demo', 'ping')).toEqual({
      id: 'demo',
      tools: [{ name: 'ping', description: 'says hi', inputSchema: { type: 'object' } }],
    })
    await expect(toolsMcpForAuthor(client as never, 'demo', 'missing')).rejects.toMatchObject({
      code: 'tool-args',
      message: 'unknown tool: missing on demo',
    })
  })

  it('returns a server error without throwing when list fails', async () => {
    const client = {
      listTools: async () => {
        throw new McpError('mcp-not-connected', 'gone')
      },
    }
    expect(await toolsMcpForAuthor(client as never, 'gone')).toEqual({
      id: 'gone',
      error: { code: 'mcp-not-connected' },
    })
  })
})

describe('listMcpServersForApp', () => {
  const client = {
    serverIds: () => ['ok', 'missing', 'broken'],
    listTools: async (id: string) => {
      if (id === 'ok') return [{ name: 'ping', description: 'says hi', inputSchema: { type: 'object' } }]
      if (id === 'missing') throw new McpError('mcp-not-connected', 'gone')
      throw new Error('boom')
    },
  }
  const failures = [{ id: 'boot-out', code: 'mcp-reference-unknown', message: 'no such reference' }]

  it('lists the alive only by default, with statuses and tool names', async () => {
    expect(await listMcpServersForApp(client as never, failures)).toEqual({
      servers: [{ id: 'ok', status: 'alive', tools: ['ping'] }],
    })
  })

  it('includes the failed and the boot-left-out under includeAll', async () => {
    expect(await listMcpServersForApp(client as never, failures, true)).toEqual({
      servers: [
        { id: 'boot-out', status: 'failed', error: { code: 'mcp-reference-unknown', message: 'no such reference' } },
        { id: 'ok', status: 'alive', tools: ['ping'] },
        { id: 'missing', status: 'failed', error: { code: 'mcp-not-connected', message: 'gone' } },
        { id: 'broken', status: 'failed', error: { code: 'mcp-start-failed' } },
      ],
    })
  })

  it('lists tool names of a live stdio server end to end', async () => {
    const live = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    })
    try {
      const listed = await listMcpServersForApp(live)
      expect(listed.servers).toHaveLength(1)
      expect(listed.servers[0]?.status).toBe('alive')
      expect(listed.servers[0]?.tools?.slice().sort()).toEqual(['blank', 'die', 'echo', 'exit', 'fail', 'image', 'pid', 'struct'])
    } finally {
      await live.dispose()
    }
  })
})

describe('listMcpToolsForApp', () => {
  const names = ['blank', 'die', 'echo', 'exit', 'fail', 'image', 'pid', 'struct']

  it('returns names, descriptions, and both schemas, omitting what the server did not declare', async () => {
    const client = {
      listTools: async () => [
        { name: 'ping', description: 'says hi', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } },
        { name: 'pong', inputSchema: { type: 'object', properties: {} } },
      ],
    }
    expect(await listMcpToolsForApp(client as never, 'demo')).toEqual({
      tools: [
        { name: 'ping', description: 'says hi', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } },
        { name: 'pong', inputSchema: { type: 'object', properties: {} } },
      ],
    })
  })

  it('throws the client code for an unknown server', async () => {
    const client = {
      listTools: async () => {
        throw new McpError('mcp-not-connected', 'gone')
      },
    }
    await expect(listMcpToolsForApp(client as never, 'gone')).rejects.toMatchObject({ code: 'mcp-not-connected' })
  })

  it('reads tool detail from a live stdio server end to end', async () => {
    const live = new McpClient({
      echo: { command: 'node', args: ['packages/mcp/client/tests/fixture-server.ts'] },
    })
    try {
      const listed = await listMcpToolsForApp(live, 'echo')
      expect(listed.tools.map(tool => tool.name).sort()).toEqual(names)
      expect(listed.tools.every(tool => tool.inputSchema.type === 'object')).toBe(true)
      expect(listed.tools.every(tool => tool.description === undefined)).toBe(true)
    } finally {
      await live.dispose()
    }
  })
})
