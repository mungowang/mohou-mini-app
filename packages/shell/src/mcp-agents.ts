import { homedir } from 'node:os'
import path from 'node:path'

/** Built-in assistants that can receive the authoring MCP connection. */
export const mcpAgentIds = ['claude', 'pi', 'pi-adapter', 'cursor', 'opencode', 'kiro', 'workbuddy', 'dsh'] as const

export type McpAgentId = (typeof mcpAgentIds)[number]

export type McpAgentFormat = 'mcpServers' | 'claude' | 'opencode' | 'dsh'

export interface McpAgentTarget {
  readonly id: McpAgentId
  readonly label: string
  readonly file: string
  readonly detectDir: string
  readonly format: McpAgentFormat
  /** Pi extension that owns this file. Other assistants omit it. */
  readonly adapter?: string
  /**
   * Which entry keys this client accepts. `url` writes only what the client documents; the
   * default adds the adapter's `transport`, `description`, and marker, which a strict reader of a
   * native config may reject.
   */
  readonly entry?: 'url' | 'extended'
}

/**
 * Paths Shell injects. Host merges a `mini-app` server into each file.
 * WorkBuddy uses CodeBuddy's home. Cursor is here because it speaks MCP; it is not a skill dest.
 * DSH is the exception: its servers are YAML plugin entries in the active profile's patch layer,
 * which is reapplied after every profile rebuild.
 */
export function builtinMcpAgents(home = homedir(), env: NodeJS.ProcessEnv = process.env): readonly McpAgentTarget[] {
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config')
  const claudeConfigDir = env.CLAUDE_CONFIG_DIR?.trim()
  const claudeHome = claudeConfigDir || path.join(home, '.claude')
  const claudeFile = claudeConfigDir === undefined ? path.join(home, '.claude.json') : path.join(claudeConfigDir, '.claude.json')
  const dshProfile = dshProfileDir(home, env)
  return [
    { id: 'claude', label: 'Claude', file: claudeFile, detectDir: claudeHome, format: 'claude' },
    // Pi 1.0 reads `mcp.json` in its agent directory, with the `mcpServers` shape other clients use.
    { id: 'pi', label: 'Pi', file: path.join(home, '.pi', 'agent', 'mcp.json'), detectDir: path.join(home, '.pi'), format: 'mcpServers', entry: 'url' },
    { id: 'pi-adapter', label: 'Pi · mcp-adapter', file: path.join(home, '.pi', 'agent', 'mcp-adapter.json'), detectDir: path.join(home, '.pi', 'agent'), format: 'mcpServers', adapter: 'pi-mcp-adapter' },
    { id: 'cursor', label: 'Cursor', file: path.join(home, '.cursor', 'mcp.json'), detectDir: path.join(home, '.cursor'), format: 'mcpServers' },
    { id: 'opencode', label: 'OpenCode', file: path.join(configHome, 'opencode', 'opencode.jsonc'), detectDir: path.join(configHome, 'opencode'), format: 'opencode' },
    { id: 'kiro', label: 'Kiro', file: path.join(home, '.kiro', 'settings', 'mcp.json'), detectDir: path.join(home, '.kiro'), format: 'mcpServers' },
    { id: 'workbuddy', label: 'WorkBuddy', file: path.join(home, '.codebuddy', 'mcp.json'), detectDir: path.join(home, '.codebuddy'), format: 'mcpServers' },
    { id: 'dsh', label: 'DSH', file: path.join(dshProfile, 'cordis.patch.yml'), detectDir: dshProfile, format: 'dsh' },
  ]
}

/** `DSH_PROFILE_DIR` when this product itself runs under DSH; otherwise the profile name's default. */
function dshProfileDir(home: string, env: NodeJS.ProcessEnv): string {
  const dir = env.DSH_PROFILE_DIR?.trim()
  if (dir !== undefined && dir.length > 0) return dir
  const named = env.DSH_PROFILE?.trim()
  return path.join(home, '.dsh', 'profiles', named !== undefined && named.length > 0 ? named : 'web')
}
