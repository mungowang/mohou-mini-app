import { describe, expect, it } from 'vitest'

import { McpError, resolveServerMap, resolveServerValues, type McpServerSpec } from '../src/index.ts'

const sources = {
  env: (name: string) => name === 'PERSONAL_TOKEN' ? 'ghp_from_env' : undefined,
  credential: (name: string) => Promise.resolve(name === 'github work' ? 'ghp_from_store' : undefined),
}

async function failure(spec: McpServerSpec, label?: string): Promise<McpError> {
  try {
    await resolveServerValues(spec, sources, label)
  } catch (error) {
    return error as McpError
  }
  throw new Error('resolve did not fail')
}

describe('resolveServerValues', () => {
  it('replaces both kinds in every string of a stdio spec', async () => {
    const spec: McpServerSpec = {
      command: 'npx',
      args: ['-y', 'server', '--token', '${credential:github work}'],
      env: { GITHUB_TOKEN: '${env:PERSONAL_TOKEN}', PLAIN: 'text' },
    }
    const resolved = await resolveServerValues(spec, sources)
    expect(resolved).toEqual({
      command: 'npx',
      args: ['-y', 'server', '--token', 'ghp_from_store'],
      env: { GITHUB_TOKEN: 'ghp_from_env', PLAIN: 'text' },
    })
    expect(spec.args?.[3]).toBe('${credential:github work}')
  })

  it('replaces in a url and its headers', async () => {
    const resolved = await resolveServerValues({
      url: 'https://${env:PERSONAL_TOKEN}.example/mcp',
      headers: { Authorization: 'Bearer ${env:PERSONAL_TOKEN}', 'X-Note': '${credential:github work}' },
    }, sources)
    expect(resolved).toEqual({
      url: 'https://ghp_from_env.example/mcp',
      headers: { Authorization: 'Bearer ghp_from_env', 'X-Note': 'ghp_from_store' },
    })
  })

  it('leaves a value without a reference alone', async () => {
    const spec: McpServerSpec = { command: 'npx', args: ['--x', 'a${b}c'] }
    expect(await resolveServerValues(spec, sources)).toEqual(spec)
  })

  it('fails a reference that names nothing, and says which one and where', async () => {
    const credential = await failure({ command: 'npx', env: { TOKEN: '${credential:gitlab}' } }, 'git')
    expect(credential.code).toBe('mcp-reference-unknown')
    expect(credential.message).toBe('git env.TOKEN names an unknown credential: gitlab')
  })

  it('names an unset environment variable', async () => {
    const missing = await failure({ command: 'npx', env: { TOKEN: '${env:MISSING}' } })
    expect(missing.code).toBe('mcp-reference-unknown')
    expect(missing.message).toContain('env.TOKEN names an environment variable that is not set: MISSING')
  })

  it('fails a missing name or a missing brace as invalid', async () => {
    const empty = await failure({ command: 'npx', env: { A: '${env:}' } })
    expect(empty.code).toBe('mcp-reference-invalid')
    expect(empty.message).toContain('env.A has a malformed reference')
    const brace = await failure({ command: 'npx', args: ['--token', '${credential:github'] })
    expect(brace.code).toBe('mcp-reference-invalid')
    expect(brace.message).toContain('args[1] has a malformed reference')
    const between = await failure({ command: 'npx', args: ['${env:PERSONAL_TOKEN}${env:NO'] })
    expect(between.code).toBe('mcp-reference-invalid')
  })

  it('treats an empty value as absent, because an empty token is worse than a failure', async () => {
    const empty = { env: () => '', credential: () => undefined }
    const found = await resolveServerValues({ command: 'npx', env: { A: '${env:SET_BUT_EMPTY}' } }, empty).catch((error: unknown) => error)
    expect((found as McpError).code).toBe('mcp-reference-unknown')
    expect((found as McpError).message).toContain('names an environment variable that is not set: SET_BUT_EMPTY')
  })

  it('keeps an unrelated placeholder literal', async () => {
    const spec: McpServerSpec = { command: 'npx', args: ['${workspaceFolder}/x', '${env-ish}'] }
    expect(await resolveServerValues(spec, sources)).toEqual(spec)
  })
})

describe('resolveServerMap', () => {
  it('names the server id in a failure', async () => {
    const servers: Record<string, McpServerSpec> = {
      filesystem: { command: 'npx', args: ['server'] },
      git: { command: 'npx', env: { TOKEN: '${credential:nope}' } },
    }
    const error = await resolveServerMap(servers, sources).catch((caught: unknown) => caught)
    expect((error as McpError).message).toBe('git env.TOKEN names an unknown credential: nope')
  })

  it('resolves every server', async () => {
    const servers: Record<string, McpServerSpec> = {
      a: { command: 'npx', env: { T: '${env:PERSONAL_TOKEN}' } },
      b: { url: 'https://x', headers: { Authorization: 'Bearer ${credential:github work}' } },
    }
    expect(await resolveServerMap(servers, sources)).toEqual({
      a: { command: 'npx', env: { T: 'ghp_from_env' } },
      b: { url: 'https://x', headers: { Authorization: 'Bearer ghp_from_store' } },
    })
  })
})
