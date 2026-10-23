import { McpClient, McpError, type McpCode } from '@mohou/mcp-client'

import type { AppMcpServer } from '@mohou/contract'

import type { McpLoadFailure } from '../host/mcp.ts'
import { AuthorError } from './codes.ts'

export interface AuthorMcpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface AuthorMcpServerNames {
  id: string
  tools?: readonly string[]
  error?: { code: McpCode; message?: string }
}

export interface AuthorMcpServerTools {
  id: string
  tools?: AuthorMcpTool[]
  error?: { code: McpCode; message?: string }
}

/**
 * Authoring index of external MCP servers. Names only. No descriptions, no schemas, no env.
 * One server failure does not drop the others, and a server boot left out is listed with the
 * reference that kept it out, so the author learns why it is missing.
 * @param client - host-held MCP client
 * @param failures - servers boot left out
 */
export async function listMcpForAuthor(
  client: McpClient,
  failures: readonly McpLoadFailure[] = [],
): Promise<{ servers: AuthorMcpServerNames[] }> {
  const servers: AuthorMcpServerNames[] = failures.map(failure => ({
    id: failure.id,
    error: { code: failure.code as McpCode, message: failure.message },
  }))
  for (const id of client.serverIds()) {
    try {
      const tools = await client.listTools(id)
      servers.push({ id, tools: tools.map(tool => tool.name) })
    } catch (error) {
      servers.push({ id, error: { code: listFailure(error) } })
    }
  }
  return { servers }
}

/**
 * Tool detail for one connected MCP server. Optional `toolName` returns that one tool only.
 * @param client - host-held MCP client
 * @param serverId - key in the resolved config
 * @param toolName - when set, only that tool; unknown name is `tool-args`
 * @param failures - servers boot left out; asking about one answers with its reference failure
 */
export async function toolsMcpForAuthor(
  client: McpClient,
  serverId: string,
  toolName?: string,
  failures: readonly McpLoadFailure[] = [],
): Promise<AuthorMcpServerTools> {
  const leftOut = failures.find(failure => failure.id === serverId)
  if (leftOut !== undefined) {
    return { id: serverId, error: { code: leftOut.code as McpCode, message: leftOut.message } }
  }
  try {
    const listed = await client.listTools(serverId)
    const tools = listed.map(tool => ({
      name: tool.name,
      ...tool.description === undefined ? {} : { description: tool.description },
      inputSchema: tool.inputSchema,
    }))
    if (toolName === undefined) return { id: serverId, tools }
    const match = tools.find(tool => tool.name === toolName)
    if (match === undefined) {
      throw new AuthorError('tool-args', `unknown tool: ${toolName} on ${serverId}`)
    }
    return { id: serverId, tools: [match] }
  } catch (error) {
    if (error instanceof AuthorError) throw error
    return { id: serverId, error: { code: listFailure(error) } }
  }
}

/**
 * Runtime list for `ctx.mcpServers`. Alive only by default; `includeAll` also returns the failed
 * with their status, so an app can explain why a server is missing. Listing opens each session,
 * the same first call `ctx.mcp` makes. Names only: no descriptions, no schemas, no env.
 * @param client - host-held MCP client
 * @param failures - servers boot left out
 * @param includeAll - also return the failed
 */
export async function listMcpServersForApp(
  client: McpClient,
  failures: readonly McpLoadFailure[] = [],
  includeAll = false,
): Promise<{ servers: AppMcpServer[] }> {
  const servers: AppMcpServer[] = []
  if (includeAll) {
    for (const failure of failures) {
      servers.push({ id: failure.id, status: 'failed', error: { code: failure.code, message: failure.message } })
    }
  }
  for (const id of client.serverIds()) {
    try {
      const tools = await client.listTools(id)
      servers.push({ id, status: 'alive', tools: tools.map(tool => tool.name) })
    } catch (error) {
      if (includeAll) {
        const known = error instanceof McpError
        servers.push({
          id,
          status: 'failed',
          error: {
            code: known ? error.code : 'mcp-start-failed',
            ...known && error.message.length > 0 ? { message: error.message } : {},
          },
        })
      }
    }
  }
  return { servers }
}

function listFailure(error: unknown): 'mcp-not-connected' | 'mcp-start-failed' {
  return error instanceof McpError && (error.code === 'mcp-not-connected' || error.code === 'mcp-start-failed')
    ? error.code
    : 'mcp-start-failed'
}
