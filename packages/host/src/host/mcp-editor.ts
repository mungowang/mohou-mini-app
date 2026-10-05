import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { isCredential, maskCredential, McpClient, McpError, resolveMcpConfig, resolveServerMap, type McpReferenceSources, type McpServerSpec } from '@mohou/mcp-client'

import { hostMcpPath } from './layout.ts'
import { admitMcpText } from './mcp-import.ts'
import { mcpConfigEnv, mcpReferenceSources, resolveMcpServers, type ResolvedMcpServers } from './mcp.ts'

/** One server the panel may edit. The file shape stays in the MCP client. */
export interface McpEditorServer {
  readonly id: string
  readonly description?: string
  readonly enabled?: boolean
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly url?: string
  readonly transport?: 'sse' | 'streamable-http'
  readonly headers?: Readonly<Record<string, string>>
}

export interface McpCheck {
  readonly ok: boolean
  readonly tools: readonly {
    readonly name: string
    readonly description?: string
    /** The protocol requires this one. */
    readonly inputSchema?: Record<string, unknown>
    /** Only a server that declares one sends it. */
    readonly outputSchema?: Record<string, unknown>
  }[]
  readonly code?: string
  readonly message?: string
}

/**
 * Servers currently in the file. A missing default file is an empty list.
 * @param runtimeRoot - directory that holds the default file
 * @param env - process environment; only `MINI_APP_MCP_CONFIG` is read
 * @param sanitize - mask the values that {@link isCredential} recognizes: a name segment that says
 * credential, or a shape that gives it away. A caller whose output reaches a model or a log sets
 * it; the panel reads the true values because it has to edit them.
 */
export async function readMcpEditor(
  runtimeRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  sanitize = false,
): Promise<McpEditorServer[]> {
  const text = await readFile(mcpFile(runtimeRoot, env), 'utf8').catch(() => undefined)
  if (text === undefined || text.trim().length === 0) return []
  try {
    const servers = admitMcpText(text)
    return sanitize ? maskEditorServers(servers) : servers
  } catch (error) {
    if (error instanceof McpError && error.message === 'mcp import has no servers') return []
    throw error
  }
}

/**
 * Replace the file with these servers and return the servers they resolved to, so a caller that
 * holds a live client can hand it the same set it just wrote. The file keeps each reference itself.
 * A server whose reference names nothing is left out of the return and listed in `failures`, the same
 * way boot leaves it out. Invalid rows throw and the file stays. An explicit `MINI_APP_MCP_CONFIG`
 * writes that path.
 * @param sources - the lookups references resolve through
 */
export async function writeMcpEditor(
  runtimeRoot: string,
  servers: readonly McpEditorServer[],
  env: NodeJS.ProcessEnv = process.env,
  sources: McpReferenceSources = mcpReferenceSources(env),
): Promise<ResolvedMcpServers> {
  const resolved = editorToConfig(servers)
  const body: Record<string, unknown> = {}
  for (const server of servers) {
    const spec = resolved[server.id]
    if (spec === undefined) continue
    const description = server.description?.trim()
    body[server.id] = {
      ...spec,
      ...description === undefined || description.length === 0 ? {} : { description },
      ...server.enabled === false ? { disabled: true } : {},
    }
  }
  const file = mcpFile(runtimeRoot, env)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  return resolveMcpServers(resolved, sources)
}

/**
 * Open one server and list its tools. Does not write the file.
 * References resolve the same way boot resolves them, so a check that passes is a server that starts.
 * The process is closed before this returns.
 * @param server - the draft, references included
 * @param env - process environment
 * @param sources - the lookups references resolve through
 */
export async function checkMcpEditor(
  server: McpEditorServer,
  env: NodeJS.ProcessEnv = process.env,
  sources: McpReferenceSources = mcpReferenceSources(env),
): Promise<McpCheck> {
  const resolved = editorToConfig([server])
  let ready: Record<string, McpServerSpec>
  try {
    ready = await resolveServerMap(resolved, sources)
  } catch (error) {
    return {
      ok: false,
      tools: [],
      code: error instanceof McpError ? error.code : 'mcp-start-failed',
      message: error instanceof Error && error.message.length > 0 ? error.message : 'mcp server did not start',
    }
  }
  const client = new McpClient(ready, env, 0)
  try {
    const tools = await client.listTools(server.id)
    return {
      ok: true,
      tools: tools.map(tool => ({
        name: tool.name,
        ...tool.description === undefined ? {} : { description: tool.description },
        inputSchema: tool.inputSchema,
        ...tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema },
      })),
    }
  } catch (error) {
    return {
      ok: false,
      tools: [],
      code: error instanceof McpError ? error.code : 'mcp-start-failed',
      message: error instanceof Error && error.message.length > 0 ? error.message : 'mcp server did not start',
    }
  } finally {
    await client.dispose()
  }
}

export function editorServers(resolved: Record<string, McpServerSpec>): McpEditorServer[] {
  return Object.entries(resolved).map(([id, spec]) => {
    if ('command' in spec) {
      return {
        id,
        command: spec.command,
        ...spec.args === undefined ? {} : { args: spec.args },
        ...spec.env === undefined ? {} : { env: spec.env },
      }
    }
    return {
      id,
      url: spec.url,
      ...spec.transport === undefined ? {} : { transport: spec.transport },
      ...spec.headers === undefined ? {} : { headers: spec.headers },
    }
  })
}

export function editorToConfig(servers: readonly McpEditorServer[]): Record<string, McpServerSpec> {
  const raw: Record<string, unknown> = {}
  for (const server of servers) {
    if (server.id.trim().length === 0) throw new McpError('config-invalid', 'mcp server id is empty')
    raw[server.id] = {
      ...server.command === undefined ? {} : { command: server.command },
      ...server.args === undefined ? {} : { args: [...server.args] },
      ...server.env === undefined ? {} : { env: { ...server.env } },
      ...server.url === undefined ? {} : { url: server.url },
      ...server.transport === undefined ? {} : { transport: server.transport },
      ...server.headers === undefined ? {} : { headers: { ...server.headers } },
    }
  }
  return resolveMcpConfig(raw)
}

/** Mask the credential entries of a map. Keys stay, and an ordinary setting keeps its value. */
/** The rows a caller that is not the file's owner may see: credential-shaped values masked. */
export function maskEditorServers(rows: readonly McpEditorServer[]): McpEditorServer[] {
  return rows.map(maskServer)
}

function maskServer(row: McpEditorServer): McpEditorServer {
  return {
    ...row,
    ...row.env === undefined ? {} : { env: maskValues(row.env) },
    ...row.headers === undefined ? {} : { headers: maskValues(row.headers) },
  }
}

function maskValues(values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, isCredential(key, value) ? maskCredential(value) : value]))
}

/** Read one import file. Shell chooses the path. Host does not name another product's home. */
export async function readMcpImport(file: string): Promise<McpEditorServer[]> {
  const text = await readFile(file, 'utf8').catch(() => undefined)
  if (text === undefined) throw new McpError('config-invalid', `mcp import is missing: ${file}`)
  return admitMcpText(text)
}

function mcpFile(runtimeRoot: string, env: NodeJS.ProcessEnv): string {
  const override = env[mcpConfigEnv]
  return typeof override === 'string' && override.length > 0 ? override : hostMcpPath(runtimeRoot)
}
