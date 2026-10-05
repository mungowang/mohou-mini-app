import { readFile } from 'node:fs/promises'

import { McpError, resolveMcpConfig, resolveServerValues, type McpReferenceSources, type McpServerSpec } from '@mohou/mcp-client'

import type { CredentialProvider } from '../credentials/provider.ts'
import { hostMcpPath } from './layout.ts'

/** Explicit config path. Set means that file, not a search of another home. */
export const mcpConfigEnv = 'MINI_APP_MCP_CONFIG'

/**
 * The lookups a `${env:NAME}` or `${credential:NAME}` reference resolves through.
 * Host binds them here and nowhere else: the environment, and the credential interface Shell
 * injects. Another credential implementation — a system keychain, say — changes the binding
 * Shell passes and not the resolver, nor any caller of it.
 * @param env - process environment
 * @param credentials - the read port, when Shell injected one
 */
export function mcpReferenceSources(env: NodeJS.ProcessEnv, credentials?: CredentialProvider): McpReferenceSources {
  return {
    env: name => env[name],
    credential: credentials === undefined ? () => undefined : name => credentials.get(name),
  }
}

/** A server that is not started, and why. `code` is the MCP client's own code. */
export interface McpLoadFailure {
  readonly id: string
  readonly code: string
  readonly message: string
}

export interface ResolvedMcpServers {
  readonly servers: Record<string, McpServerSpec>
  /** One entry per server a reference left unresolvable. Those servers do not start. */
  readonly failures: readonly McpLoadFailure[]
}

/**
 * Resolve one admitted map, one server at a time. A reference that names nothing leaves that server
 * out and reports it; the value never becomes an empty string. Boot and a write share this rule, so a
 * file written at runtime reads back the way the next boot would read it.
 * @param admitted - servers a config read accepted
 * @param sources - the lookups references resolve through
 */
export async function resolveMcpServers(
  admitted: Record<string, McpServerSpec>,
  sources: McpReferenceSources,
): Promise<ResolvedMcpServers> {
  const servers: Record<string, McpServerSpec> = {}
  const failures: McpLoadFailure[] = []
  for (const [id, spec] of Object.entries(admitted)) {
    try {
      servers[id] = await resolveServerValues(spec, sources, id)
    } catch (error) {
      failures.push({
        id,
        code: error instanceof McpError ? error.code : 'config-invalid',
        message: error instanceof Error && error.message.length > 0 ? error.message : 'server value did not resolve',
      })
    }
  }
  return { servers, failures }
}

/**
 * Read MCP servers for Host boot, and resolve the references in them.
 * A missing default file is zero servers. A present bad file, or a missing explicit path, fails boot:
 * the file itself is unusable. A reference that names nothing is not the same class — that one server
 * is left out and reported in `failures`, so the host still serves the panel that can fix it. The
 * value never falls back to an empty string either way.
 * @param runtimeRoot - directory that contains the default file
 * @param env - process environment; only {@link mcpConfigEnv} is read
 * @param sources - the lookups references resolve through
 */
export async function loadMcpServers(
  runtimeRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  sources: McpReferenceSources = mcpReferenceSources(env),
): Promise<ResolvedMcpServers> {
  const override = env[mcpConfigEnv]
  const explicit = typeof override === 'string' && override.length > 0
  const file = explicit ? override : hostMcpPath(runtimeRoot)
  const text = await readFile(file, 'utf8').catch(() => undefined)
  if (text === undefined) {
    if (explicit) throw new McpError('config-invalid', `mcp config is missing: ${file}`)
    return { servers: {}, failures: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new McpError('config-invalid', 'mcp config is not JSON', { cause: error })
  }
  return resolveMcpServers(resolveMcpConfig(omitDisabled(parsed)), sources)
}

function omitDisabled(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const wrapped = typeof record.mcpServers === 'object' && record.mcpServers !== null && !Array.isArray(record.mcpServers)
  const source = wrapped ? record.mcpServers as Record<string, unknown> : record
  const next: Record<string, unknown> = {}
  for (const [id, entry] of Object.entries(source)) {
    if (typeof entry === 'object' && entry !== null && 'disabled' in entry && entry.disabled === true) continue
    next[id] = entry
  }
  return wrapped ? { ...record, mcpServers: next } : next
}
