import type { McpServerDraft, PanelSettingsClient } from './client.ts'

const credentialReference = /\$\{credential:([^}]*)\}/g

/** Credential names one value references. An empty name is not a reference. */
export function credentialNamesIn(text: string): readonly string[] {
  const names: string[] = []
  for (const match of text.matchAll(credentialReference)) {
    const name = match[1]?.trim() ?? ''
    if (name.length === 0 || names.includes(name)) continue
    names.push(name)
  }
  return names
}

/** Credential names one saved server references, in first-seen order. */
export function credentialNamesOfServer(server: McpServerDraft): readonly string[] {
  const texts = [
    server.command ?? '',
    ...(server.args ?? []),
    server.url ?? '',
    ...Object.values(server.env ?? {}),
    ...Object.values(server.headers ?? {}),
  ]
  const names: string[] = []
  for (const text of texts) {
    for (const name of credentialNamesIn(text)) {
      if (!names.includes(name)) names.push(name)
    }
  }
  return names
}

/**
 * Create an empty credential for each name that is not already stored.
 * An existing name is left as stored, secret included.
 * @returns the names this call created
 */
export async function ensureCredentialPlaceholders(
  client: PanelSettingsClient,
  wanted: readonly { readonly name: string; readonly description: string }[],
): Promise<readonly string[]> {
  const put = client.putCredential
  if (put === undefined || wanted.length === 0) return []
  const listed = await client.readCredentials?.().catch(() => undefined)
  const have = new Set((listed?.credentials ?? []).map(item => item.name))
  const created: string[] = []
  for (const item of wanted) {
    if (have.has(item.name)) continue
    try {
      await put(item.name, item.description, undefined, true)
      created.push(item.name)
      have.add(item.name)
    } catch {
      // A name that cannot be written stays missing. The server write still stands.
    }
  }
  return created
}
