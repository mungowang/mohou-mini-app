import { homedir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { builtinMcpAgents } from '../src/mcp-agents.ts'
import { builtinSkillAgents } from '../src/skill-agents.ts'

describe('assistant dest tables', () => {
  it('points Claude MCP at ~/.claude.json unless CLAUDE_CONFIG_DIR is set', () => {
    const home = homedir()
    const agents = builtinMcpAgents(home, {})
    expect(agents.find(agent => agent.id === 'claude')?.file).toBe(path.join(home, '.claude.json'))
    const moved = builtinMcpAgents(home, { CLAUDE_CONFIG_DIR: '/tmp/claude-home' })
    expect(moved.find(agent => agent.id === 'claude')).toMatchObject({
      file: '/tmp/claude-home/.claude.json',
      detectDir: '/tmp/claude-home',
      format: 'claude',
    })
    expect(builtinSkillAgents(home, { CLAUDE_CONFIG_DIR: '/tmp/claude-home' }).find(agent => agent.id === 'claude')?.skillsDir).toBe('/tmp/claude-home/skills')
  })

  it('sends the skill to DSH under its own skills directory', () => {
    const home = homedir()
    expect(builtinSkillAgents(home, {}).find(agent => agent.id === 'dsh')).toEqual({
      id: 'dsh',
      label: 'DSH',
      skillsDir: path.join(home, '.dsh', 'skills'),
      detectDir: path.join(home, '.dsh'),
    })
  })

  it('offers Pi 1.0 its own mcp.json beside the adapter file', () => {
    const home = homedir()
    const agents = builtinMcpAgents(home, {})
    // Pi 1.0 reads `mcp.json` in the agent directory and validates it, so it gets documented keys only.
    const pi = agents.find(agent => agent.id === 'pi')
    expect(pi).toMatchObject({
      label: 'Pi',
      file: path.join(home, '.pi', 'agent', 'mcp.json'),
      detectDir: path.join(home, '.pi'),
      format: 'mcpServers',
      entry: 'url',
    })
    expect(pi?.adapter).toBeUndefined()
    // A Pi that still runs the adapter keeps its own file.
    expect(agents.find(agent => agent.id === 'pi-adapter')).toMatchObject({
      label: 'Pi · mcp-adapter',
      file: path.join(home, '.pi', 'agent', 'mcp-adapter.json'),
      detectDir: path.join(home, '.pi', 'agent'),
      format: 'mcpServers',
      adapter: 'pi-mcp-adapter',
    })
  })

  it('writes the DSH MCP entry into the active profile patch layer', () => {
    const home = homedir()
    expect(builtinMcpAgents(home, {}).find(agent => agent.id === 'dsh')).toMatchObject({
      label: 'DSH',
      file: path.join(home, '.dsh', 'profiles', 'web', 'cordis.patch.yml'),
      detectDir: path.join(home, '.dsh', 'profiles', 'web'),
      format: 'dsh',
    })
    expect(builtinMcpAgents(home, { DSH_PROFILE_DIR: '/tmp/dsh-profile', DSH_PROFILE: 'work' }).find(agent => agent.id === 'dsh')).toMatchObject({
      file: '/tmp/dsh-profile/cordis.patch.yml',
      detectDir: '/tmp/dsh-profile',
    })
    expect(builtinMcpAgents(home, { DSH_PROFILE: 'work' }).find(agent => agent.id === 'dsh')).toMatchObject({
      file: path.join(home, '.dsh', 'profiles', 'work', 'cordis.patch.yml'),
    })
  })
})
