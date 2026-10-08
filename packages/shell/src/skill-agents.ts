import { homedir } from 'node:os'
import path from 'node:path'

/** Built-in assistants the writing skill can install into. */
export const skillAgentIds = ['claude', 'pi', 'opencode', 'kiro', 'workbuddy', 'dsh', 'grok'] as const

export type SkillAgentId = (typeof skillAgentIds)[number]

export interface SkillAgentTarget {
  readonly id: SkillAgentId
  readonly label: string
  readonly skillsDir: string
  readonly detectDir: string
}

/**
 * Paths Shell injects. Host copies into `skillsDir/<skill-id>`.
 * WorkBuddy is not in the skills CLI table; CodeBuddy's global dir is used.
 * DSH reads every directory under its own `skills/`, so installing there needs no CLI.
 * Grok reads `$GROK_HOME/skills`, the same directory the MCP row uses for `config.toml`.
 */
export function builtinSkillAgents(home = homedir(), env: NodeJS.ProcessEnv = process.env): readonly SkillAgentTarget[] {
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config')
  const claudeHome = env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude')
  return [
    { id: 'claude', label: 'Claude', skillsDir: path.join(claudeHome, 'skills'), detectDir: claudeHome },
    { id: 'pi', label: 'Pi', skillsDir: path.join(home, '.pi', 'agent', 'skills'), detectDir: path.join(home, '.pi', 'agent') },
    { id: 'opencode', label: 'OpenCode', skillsDir: path.join(configHome, 'opencode', 'skills'), detectDir: path.join(configHome, 'opencode') },
    { id: 'kiro', label: 'Kiro', skillsDir: path.join(home, '.kiro', 'skills'), detectDir: path.join(home, '.kiro') },
    { id: 'workbuddy', label: 'WorkBuddy', skillsDir: path.join(home, '.codebuddy', 'skills'), detectDir: path.join(home, '.codebuddy') },
    { id: 'dsh', label: 'DSH', skillsDir: path.join(home, '.dsh', 'skills'), detectDir: path.join(home, '.dsh') },
    { id: 'grok', label: 'Grok', skillsDir: path.join(grokHome(home, env), 'skills'), detectDir: grokHome(home, env) },
  ]
}

/** `GROK_HOME` when Grok's directory is not `~/.grok`. The MCP row uses the same directory. */
function grokHome(home: string, env: NodeJS.ProcessEnv): string {
  const configured = env.GROK_HOME?.trim()
  return configured !== undefined && configured.length > 0 ? configured : path.join(home, '.grok')
}
