import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createEchoProvider } from '@mohou/runtime-provider'
import { describe, expect, it } from 'vitest'

import { createCredentials, createHost, hostAuthoringToken, hostMcpPath } from '../src/index.ts'

import { freePort } from './free-port.ts'

/**
 * The child's tool name reports what it received, so no redaction can blur the answer: a live client
 * handed the literal placeholder names its tool `got-literal`, one handed the value names it
 * `got-real-value`. That is the difference a user sees as "it works until I restart".
 */
const childServer = `
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\\n')
process.stdin.setEncoding('utf8')
let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk
  for (let nl = buf.indexOf('\\n'); nl !== -1; nl = buf.indexOf('\\n')) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (line === '') continue
    let req
    try { req = JSON.parse(line) } catch { continue }
    if (req.id === undefined) continue
    if (req.method === 'initialize') {
      send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '0' } } })
    } else if (req.method === 'tools/list') {
      const name = process.env.PROBE === 'the-real-secret' ? 'got-real-value' : 'got-literal'
      send({ jsonrpc: '2.0', id: req.id, result: { tools: [{ name, description: 'reports what the child received', inputSchema: { type: 'object' } }] } })
    }
  }
})
`

interface Built {
  root: string
  server: string
  boot: () => ReturnType<typeof createHost>
}

async function build(seed?: Record<string, unknown>): Promise<Built> {
  const root = await mkdtemp(join(tmpdir(), 'mma-mcp-write-'))
  const server = join(root, 'child-server.mjs')
  await writeFile(server, childServer, 'utf8')
  if (seed !== undefined) await writeFile(hostMcpPath(root), JSON.stringify(seed, null, 2))
  const credentials = createCredentials([{ kind: 'builtin-json', file: join(root, 'credentials.json') }])
  await credentials.put('DEMO', 'demo', 'the-real-secret')
  return {
    root,
    server,
    boot: async () => createHost({
      runtimeRoot: root,
      // A spec beside this one may boot at the same moment, so the seed port comes from the OS.
      seed: { hostPort: await freePort(), theme: 'light', palette: 'default', locale: 'en' },
      provider: createEchoProvider(),
      credentials,
      seedStartup: false,
    }),
  }
}

const fileEnv = (root: string, id: string): Record<string, string> | undefined =>
  (JSON.parse(readFileSync(hostMcpPath(root), 'utf8')) as Record<string, { env?: Record<string, string> }>)[id]?.env

const liveTool = async (host: Awaited<ReturnType<Built['boot']>>, id: string): Promise<string> => {
  const listed = await host.author.invoke('mini_app_mcp_tools', { serverId: id }) as { tools?: Array<{ name: string }>; error?: { code: string } }
  return listed.tools?.map(tool => tool.name).join(',') ?? listed.error?.code ?? 'nothing'
}

describe('a runtime MCP write', () => {
  it('hands the live client the resolved value, and keeps the reference in the file', async () => {
    const built = await build({})
    const host = await built.boot()
    try {
      const added = await host.author.invoke('mini_app_mcp_add', {
        id: 'probe',
        command: 'node',
        args: [built.server],
        env: { PROBE: '${credential:DEMO}' },
      }) as { check?: { ok?: boolean; tools?: Array<{ name: string }> } }
      // The check resolved before this change too, so it was never the proof.
      expect(added.check?.tools?.map(tool => tool.name)).toEqual(['got-real-value'])
      expect(await liveTool(host, 'probe')).toBe('got-real-value')
      expect(fileEnv(built.root, 'probe')).toEqual({ PROBE: '${credential:DEMO}' })
    } finally {
      await host.dispose()
    }
  }, 60_000)

  it("leaves every other server's values byte for byte alone", async () => {
    const built = await build({
      keepme: { command: 'node', args: ['keepme.mjs'], env: { GITHUB_TOKEN: 'ghp_keepthissecret99', OTHER: 'keep-me' } },
      dropme: { command: 'node', args: ['dropme.mjs'], env: { API_KEY: 'sk_dropthissecret42' } },
    })
    const host = await built.boot()
    try {
      const added = await host.author.invoke('mini_app_mcp_add', {
        id: 'probe', command: 'node', args: [built.server], env: { PROBE: '${credential:DEMO}' },
      }) as { servers: Array<{ id: string; env?: Record<string, string> }> }
      expect(fileEnv(built.root, 'keepme')).toEqual({ GITHUB_TOKEN: 'ghp_keepthissecret99', OTHER: 'keep-me' })
      expect(fileEnv(built.root, 'dropme')).toEqual({ API_KEY: 'sk_dropthissecret42' })
      // The answer to the agent is still the masked view: the fix moved the mask, it did not drop it.
      expect(added.servers.find(row => row.id === 'keepme')?.env?.GITHUB_TOKEN).toBe('ghp_ke*****99')

      await host.author.invoke('mini_app_mcp_remove', { id: 'dropme' })
      expect(fileEnv(built.root, 'keepme')).toEqual({ GITHUB_TOKEN: 'ghp_keepthissecret99', OTHER: 'keep-me' })
      expect(fileEnv(built.root, 'dropme')).toBeUndefined()
    } finally {
      await host.dispose()
    }
  }, 60_000)

  it('leaves out a server whose reference names nothing, and reports it as live state', async () => {
    const built = await build({})
    const host = await built.boot()
    const started = await host.start()
    try {
      await host.author.invoke('mini_app_mcp_add', {
        id: 'probe', command: 'node', args: [built.server], env: { PROBE: '${credential:nope}' }, force: true,
      })
      // Not `mcp-not-connected`: the live state knows which reference kept it out.
      expect(await liveTool(host, 'probe')).toBe('mcp-reference-unknown')
      expect(fileEnv(built.root, 'probe')).toEqual({ PROBE: '${credential:nope}' })
      const token = readFileSync(hostAuthoringToken(built.root), 'utf8').trim()
      const read = await fetch(`http://127.0.0.1:${started.port}/api/mcp-servers`, { headers: { authorization: `Bearer ${token}` } })
      const parsed = await read.json() as { result?: { unresolved?: Array<{ id: string; code: string; message: string }> } }
      // Boot found nothing to leave out; the write is what has to report it.
      expect(parsed.result?.unresolved).toEqual([{
        id: 'probe',
        code: 'mcp-reference-unknown',
        message: 'probe env.PROBE names an unknown credential: nope',
      }])
      const listed = await host.author.invoke('mini_app_mcp_list', {}) as { servers: Array<{ id: string; error?: { code: string } }> }
      expect(listed.servers.find(server => server.id === 'probe')?.error?.code).toBe('mcp-reference-unknown')
    } finally {
      await host.dispose()
    }
  }, 60_000)

  it('resolves on the panel route too, which writes rows the panel read unmasked', async () => {
    const built = await build({})
    const host = await built.boot()
    const started = await host.start()
    try {
      const token = readFileSync(hostAuthoringToken(built.root), 'utf8').trim()
      const write = await fetch(`http://127.0.0.1:${started.port}/api/mcp-servers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ servers: [{ id: 'panel', command: 'node', args: [built.server], env: { PROBE: '${credential:DEMO}' } }] }),
      })
      expect(write.status).toBe(200)
      expect(await liveTool(host, 'panel')).toBe('got-real-value')
    } finally {
      await host.dispose()
    }
  }, 60_000)
})
