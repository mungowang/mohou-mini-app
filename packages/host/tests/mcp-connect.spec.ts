import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { McpClient } from '@mohou/mcp-client'
import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import {
  emptyCredentials, createAppRegistry, createAuthorTools, startAuthorHttp, type AuthorCallPorts } from '../src/index.ts'

describe('official MCP client', () => {
  it('connects, lists tools, and calls one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-connect-'))
    const author = createAuthorTools({
      registry: createAppRegistry(root),
      mcp: new McpClient({}),
      ports: ports(),
    })
    const http = await startAuthorHttp({ author, token: 'secret' })
    const client = new Client({ name: 'probe', version: '0' })
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.port}/mcp`), {
      requestInit: { headers: { authorization: 'Bearer secret' } },
    })
    try {
      await client.connect(transport as Transport)
      const listed = await client.listTools()
      expect(listed.tools.map(tool => tool.name)).toContain('mini_app_list')
      const result = await client.callTool({ name: 'mini_app_list', arguments: {} })
      expect(JSON.stringify(result)).toContain('apps')
    } finally {
      await client.close().catch(() => undefined)
      await http.close()
      await author.dispose()
    }
  })
})

function ports(): AuthorCallPorts {
  return {
    credentials: emptyCredentials(),
    config: {
      theme: 'light',
      palette: 'default',
      locale: 'zh-CN',
      chatLanguage: 'zh-CN',
      hostPort: 0,
      llm: null,
    },
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
