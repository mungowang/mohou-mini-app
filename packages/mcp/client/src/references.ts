import { McpError } from './codes.ts'
import type { McpServerSpec } from './config.ts'

/**
 * One named value a reference can name, or `undefined` when nothing holds that name.
 * A credential provider is read per call, so a lookup may be async.
 */
export type McpReferenceLookup = (name: string) => string | undefined | Promise<string | undefined>

/**
 * Where a reference gets its value. Two lookups, bound by the caller: the ambient environment and
 * whatever holds the credentials. This module knows no file, no keychain, and no provider package,
 * so another credential implementation replaces the binding and not the resolver.
 */
export interface McpReferenceSources {
  env: McpReferenceLookup
  credential: McpReferenceLookup
}

/** Kinds a value may reference. A reference that is neither is literal text. */
export const mcpReferenceKinds = ['env', 'credential'] as const

export type McpReferenceKind = (typeof mcpReferenceKinds)[number]

/**
 * Replace every `${env:NAME}` and `${credential:NAME}` in one server spec.
 * A spec without a reference comes back equal to its input; the input is never changed.
 * The config file keeps the references. Only the copy handed to the client carries values.
 * @param spec - one admitted server spec
 * @param sources - the lookups the caller binds
 * @param label - server id, used in a failure message only
 */
export async function resolveServerValues(
  spec: McpServerSpec,
  sources: McpReferenceSources,
  label?: string,
): Promise<McpServerSpec> {
  if ('command' in spec) {
    const args = spec.args === undefined
      ? {}
      : { args: await Promise.all(spec.args.map((item, index) => replace(item, `args[${index}]`, sources, label))) }
    return {
      ...spec,
      command: await replace(spec.command, 'command', sources, label),
      ...args,
      ...spec.env === undefined ? {} : { env: await replaceRecord(spec.env, 'env', sources, label) },
    }
  }
  return {
    ...spec,
    url: await replace(spec.url, 'url', sources, label),
    ...spec.headers === undefined ? {} : { headers: await replaceRecord(spec.headers, 'headers', sources, label) },
  }
}

/**
 * Resolve every server in one map. The label of a failure is that server's id.
 * @param servers - admitted specs, keyed by server id
 * @param sources - the lookups the caller binds
 */
export async function resolveServerMap(
  servers: Record<string, McpServerSpec>,
  sources: McpReferenceSources,
): Promise<Record<string, McpServerSpec>> {
  const entries = await Promise.all(Object.entries(servers)
    .map(async ([id, spec]) => [id, await resolveServerValues(spec, sources, id)] as const))
  return Object.fromEntries(entries)
}

async function replaceRecord(
  record: Record<string, string>,
  field: string,
  sources: McpReferenceSources,
  label: string | undefined,
): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(record).map(async ([key, value]) => {
    return [key, await replace(value, `${field}.${key}`, sources, label)] as const
  }))
  return Object.fromEntries(entries)
}

async function replace(text: string, where: string, sources: McpReferenceSources, label: string | undefined): Promise<string> {
  if (!text.includes('${')) return text
  const whole = /\$\{(env|credential):([^}]*)\}/g
  const opening = /\$\{(env|credential):/
  let out = ''
  let index = 0
  let match: RegExpExecArray | null
  while ((match = whole.exec(text)) !== null) {
    if (opening.test(text.slice(index, match.index))) throw invalid(label, where)
    out += text.slice(index, match.index)
    out += await value(match[1] as McpReferenceKind, match[2]?.trim() ?? '', where, sources, label)
    index = match.index + match[0].length
  }
  if (opening.test(text.slice(index))) throw invalid(label, where)
  return out + text.slice(index)
}

/** A value that is absent, or empty, fails the load. An empty token is worse than a boot error. */
async function value(
  kind: McpReferenceKind,
  name: string,
  where: string,
  sources: McpReferenceSources,
  label: string | undefined,
): Promise<string> {
  if (name.length === 0) throw invalid(label, where)
  const found = await (kind === 'env' ? sources.env(name) : sources.credential(name))
  if (found !== undefined && found.length > 0) return found
  throw new McpError('mcp-reference-unknown', kind === 'env'
    ? `${at(label, where)} names an environment variable that is not set: ${name}`
    : `${at(label, where)} names an unknown credential: ${name}`)
}

function invalid(label: string | undefined, where: string): McpError {
  return new McpError('mcp-reference-invalid', `${at(label, where)} has a malformed reference`)
}

function at(label: string | undefined, where: string): string {
  return label === undefined ? where : `${label} ${where}`
}
