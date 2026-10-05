import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { writeFileCredential } from '../src/credentials/file.ts'
import { createFileCredentials, mcpReferenceSources } from '../src/index.ts'
import { hostMcpPath, loadMcpServers, mcpConfigEnv } from '../src/index.ts'

describe('loadMcpServers', () => {
  it('treats a missing default file as zero servers and a bad file as boot failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-'))
    expect(await loadMcpServers(root, {})).toEqual({ servers: {}, failures: [] })
    await writeFile(hostMcpPath(root), '{')
    await expect(loadMcpServers(root, {})).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostMcpPath(root), JSON.stringify({
      settings: { nope: true },
      echo: { command: 'echo', args: ['hi'] },
    }))
    expect(await loadMcpServers(root, {})).toEqual({ servers: { echo: { command: 'echo', args: ['hi'] } }, failures: [] })
    const other = join(root, 'elsewhere.json')
    await writeFile(other, JSON.stringify({ remote: { url: 'https://example.com/mcp' } }))
    expect(await loadMcpServers(root, { [mcpConfigEnv]: other })).toEqual({
      servers: { remote: { url: 'https://example.com/mcp' } },
      failures: [],
    })
    await expect(loadMcpServers(root, { [mcpConfigEnv]: join(root, 'missing.json') })).rejects.toMatchObject({ code: 'config-invalid' })
    await writeFile(hostMcpPath(root), JSON.stringify({
      live: { command: 'echo' },
      off: { command: 'echo', disabled: true },
    }))
    expect(await loadMcpServers(root, {})).toEqual({ servers: { live: { command: 'echo' } }, failures: [] })
  })

  it('resolves a reference from the environment and from the credential store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-ref-'))
    const file = join(root, 'credentials.json')
    await writeFileCredential(file, 'github work', 'GitHub', 'ghp_from_store')
    await writeFile(hostMcpPath(root), JSON.stringify({
      git: { command: 'npx', env: { TOKEN: '${credential:github work}', NOTE: '${env:PERSONAL_TOKEN}' } },
    }))
    const sources = mcpReferenceSources({ PERSONAL_TOKEN: 'ghp_from_env' }, createFileCredentials(file))
    expect(await loadMcpServers(root, {}, sources)).toEqual({
      servers: { git: { command: 'npx', env: { TOKEN: 'ghp_from_store', NOTE: 'ghp_from_env' } } },
      failures: [],
    })
  })

  it('leaves out the server a reference cannot resolve, and says which one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mma-mcp-ref-fail-'))
    await writeFile(hostMcpPath(root), JSON.stringify({
      filesystem: { command: 'npx', args: ['server'] },
      git: { command: 'npx', env: { TOKEN: '${credential:nope}' } },
    }))
    const sources = mcpReferenceSources({}, createFileCredentials(join(root, 'credentials.json')))
    const loaded = await loadMcpServers(root, {}, sources)
    expect(Object.keys(loaded.servers)).toEqual(['filesystem'])
    expect(loaded.failures).toEqual([{
      id: 'git',
      code: 'mcp-reference-unknown',
      message: 'git env.TOKEN names an unknown credential: nope',
    }])
  })
})
