import { isDeepStrictEqual } from 'node:util'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { McpError } from './codes.ts'
import type { McpServerSpec } from './config.ts'
import { mayHoldCredential } from './secrets.ts'

/** Reconnects after a live session drops. Not a locked number. */
const DEFAULT_RECONNECT_BUDGET = 2

interface ToolResult {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}

interface Session {
  client: Client
  generation: number
}

/**
 * External MCP sessions. The first call opens a server. One session per id.
 * A dropped live session reconnects until the budget is spent, then that call fails.
 * The next call may open the server again.
 * The set can be replaced while running: {@link setServers} closes the sessions it retires.
 * This client does not register tools on a model. It does not unwrap `{ input: string }`.
 */
export class McpClient {
  private readonly servers = new Map<string, McpServerSpec>()
  private readonly sessions = new Map<string, Session>()
  private readonly opening = new Map<string, Promise<Session>>()
  private readonly generation = new Map<string, number>()
  private readonly reconnects = new Map<string, number>()
  private readonly dropped = new Set<string>()
  private readonly recovering = new Set<string>()
  private readonly parentEnv: NodeJS.ProcessEnv
  private readonly reconnectBudget: number

  /**
   * @param servers - resolved specs. This client copies the map so exhaustion can drop one id.
   * @param parentEnv - ambient environment; credential-shaped names are not forwarded
   * @param reconnectBudget - how many times a live session may be replaced. Not locked.
   */
  constructor(
    servers: Record<string, McpServerSpec>,
    parentEnv: NodeJS.ProcessEnv = process.env,
    reconnectBudget = DEFAULT_RECONNECT_BUDGET,
  ) {
    this.parentEnv = parentEnv
    this.reconnectBudget = reconnectBudget
    for (const [id, spec] of Object.entries(servers)) this.servers.set(id, spec)
  }

  /**
   * Call one tool. Args are the tool's own object.
   * @param serverId - key in the resolved config
   * @param toolName - the server's tool name
   * @param args - tool arguments; omitted means an empty object
   */
  async call(serverId: string, toolName: string, args?: Record<string, unknown>): Promise<unknown> {
    this.beginAttempt(serverId)
    const result = await this.withSession(serverId, client => (
      client.callTool({ name: toolName, arguments: args ?? {} }) as Promise<ToolResult>
    ))
    if (result.isError === true) {
      const spec = this.servers.get(serverId)
      const text = textOf(result)
      throw new McpError('mcp-tool-failed', this.redact(text || 'mcp tool failed', spec), { cause: result })
    }
    if (result.structuredContent !== undefined) return result.structuredContent
    if (result.content !== undefined && result.content.every(block => block.type === 'text')) return textOf(result)
    return result.content ?? null
  }

  /** Server ids still registered. Does not open a connection. */
  serverIds(): string[] {
    return [...this.servers.keys()]
  }

  /**
   * Replace the whole set. An id whose spec is deep-equal keeps its session and its budget.
   * A removed id, or one whose spec changed, closes its session: the next call opens the new spec.
   * The set is switched before any session closes, so a call that starts during this sees the new set.
   * @param servers - resolved specs; the client copies the map
   */
  async setServers(servers: Record<string, McpServerSpec>): Promise<void> {
    const retired = [...this.servers].filter(([id, spec]) => {
      const next = servers[id]
      return next === undefined || !isDeepStrictEqual(spec, next)
    })
    this.servers.clear()
    for (const [id, spec] of Object.entries(servers)) this.servers.set(id, spec)
    for (const [id] of retired) await this.closeServer(id)
  }

  /**
   * List tools on one server. Opens the session if needed.
   * @param serverId - key in the resolved config
   */
  async listTools(serverId: string): Promise<Array<{
    name: string
    description?: string
    inputSchema: Record<string, unknown>
    outputSchema?: Record<string, unknown>
  }>> {
    this.beginAttempt(serverId)
    return this.withSession(serverId, async (client) => {
      const tools: Array<{
        name: string
        description?: string
        inputSchema: Record<string, unknown>
        outputSchema?: Record<string, unknown>
      }> = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor === undefined ? undefined : { cursor }) as {
          tools: Array<{
            name: string
            description?: string
            inputSchema: Record<string, unknown>
            outputSchema?: Record<string, unknown>
          }>
          nextCursor?: string
        }
        tools.push(...page.tools)
        cursor = page.nextCursor
      } while (cursor !== undefined)
      return tools
    })
  }

  /** Close every session and wait for stdio children to exit. */
  async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.generation.clear()
    await Promise.all(sessions.map(session => session.client.close().catch(() => undefined)))
  }

  private async withSession<T>(serverId: string, work: (client: Client) => Promise<T>): Promise<T> {
    for (;;) {
      const spec = this.servers.get(serverId)
      if (spec === undefined) throw new McpError('mcp-not-connected', `mcp server is not connected: ${serverId}`)
      if (this.dropped.has(serverId) && !this.allowReconnect(serverId)) {
        throw new McpError('mcp-start-failed', `mcp server stopped: ${serverId}`)
      }
      const session = await this.session(serverId, spec)
      try {
        const value = await work(session.client)
        this.reconnects.delete(serverId)
        return value
      } catch (error) {
        this.recovering.add(serverId)
        await this.closeGeneration(session)
        this.recovering.delete(serverId)
        this.dropped.delete(serverId)
        if (isClosed(error) && this.spendReconnect(serverId)) continue
        throw new McpError(
          isClosed(error) ? 'mcp-start-failed' : 'mcp-tool-failed',
          this.redact(error instanceof Error ? error.message : 'mcp tool failed', spec),
          { cause: error },
        )
      }
    }
  }

  private beginAttempt(serverId: string): void {
    this.reconnects.delete(serverId)
    this.dropped.delete(serverId)
  }

  private allowReconnect(serverId: string): boolean {
    this.dropped.delete(serverId)
    return this.spendReconnect(serverId)
  }

  private spendReconnect(serverId: string): boolean {
    const used = (this.reconnects.get(serverId) ?? 0) + 1
    this.reconnects.set(serverId, used)
    return used <= this.reconnectBudget
  }

  private session(serverId: string, spec: McpServerSpec): Promise<Session> {
    const live = this.sessions.get(serverId)
    if (live !== undefined) return Promise.resolve(live)
    const pending = this.opening.get(serverId)
    if (pending !== undefined) return pending
    const opening = this.open(serverId, spec).then((session) => {
      this.opening.delete(serverId)
      // The set may have been replaced or disposed while this was opening. Do not adopt it.
      if (this.generation.get(serverId) !== session.generation) {
        void session.client.close().catch(() => undefined)
        throw new McpError('mcp-not-connected', `mcp server was replaced while opening: ${serverId}`)
      }
      this.sessions.set(serverId, session)
      return session
    }, (error: unknown) => {
      this.opening.delete(serverId)
      throw error
    })
    this.opening.set(serverId, opening)
    return opening
  }

  private async open(serverId: string, spec: McpServerSpec): Promise<Session> {
    const generation = (this.generation.get(serverId) ?? 0) + 1
    this.generation.set(serverId, generation)
    const client = new Client({ name: 'mini-app', version: '0.0.0' })
    client.onclose = () => {
      if (this.generation.get(serverId) !== generation) return
      const current = this.sessions.get(serverId)
      if (current?.generation === generation) this.sessions.delete(serverId)
      if (!this.recovering.has(serverId)) this.dropped.add(serverId)
    }
    try {
      await client.connect(transportFor(spec, scrubEnv(this.parentEnv)) as Transport)
      return { client, generation }
    } catch (error) {
      await client.close().catch(() => undefined)
      throw new McpError('mcp-start-failed', this.redact(error instanceof Error ? error.message : 'mcp server did not start', spec), { cause: error })
    }
  }

  private async closeGeneration(session: Session): Promise<void> {
    const current = [...this.sessions.entries()].find(([, live]) => live === session)
    if (current !== undefined) this.sessions.delete(current[0])
    await session.client.close().catch(() => undefined)
  }

  /**
   * Retire one id: invalidate its generation, wait for an open in flight, close the live session,
   * and forget its reconnect budget. The next call opens the spec this client holds now.
   */
  private async closeServer(serverId: string): Promise<void> {
    this.generation.set(serverId, (this.generation.get(serverId) ?? 0) + 1)
    const pending = this.opening.get(serverId)
    if (pending !== undefined) await pending.catch(() => undefined)
    const live = this.sessions.get(serverId)
    if (live !== undefined) {
      this.sessions.delete(serverId)
      await live.client.close().catch(() => undefined)
    }
    this.reconnects.delete(serverId)
    this.dropped.delete(serverId)
    this.recovering.delete(serverId)
  }

  private redact(message: string, spec: McpServerSpec | undefined): string {
    if (spec === undefined) return message
    const secrets = specHasEnv(spec) ? Object.values(spec.env) : []
    let text = message
    for (const secret of secrets) {
      if (secret.length < 4) continue
      text = text.split(secret).join('[redacted]')
    }
    return text
  }
}

function isClosed(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === 'Connection closed'
    || error.message === 'Not connected'
    || error.message.endsWith(': Connection closed')
}

function transportFor(spec: McpServerSpec, parent: Record<string, string>) {
  if ('url' in spec) {
    const url = new URL(spec.url)
    if (spec.transport === 'sse') {
      // Some servers still speak SSE. The contract keeps that transport.
      // oxlint-disable-next-line typescript/no-deprecated
      return new SSEClientTransport(url)
    }
    return new StreamableHTTPClientTransport(url, spec.headers === undefined ? undefined : { requestInit: { headers: spec.headers } })
  }
  return new StdioClientTransport({
    command: spec.command,
    args: spec.args ?? [],
    env: { ...parent, ...spec.env },
    stderr: 'pipe',
  })
}

function scrubEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !mayHoldCredential(key)) next[key] = value
  }
  return next
}

function specHasEnv(spec: McpServerSpec): spec is McpServerSpec & { env: Record<string, string> } {
  return 'command' in spec && spec.env !== undefined
}

function textOf(result: ToolResult): string {
  return (result.content ?? []).flatMap(block => block.text === undefined ? [] : [block.text]).join('\n')
}
