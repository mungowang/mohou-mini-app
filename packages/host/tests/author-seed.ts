import { appEntries } from '@mohou/contract'

/** Register with manifest fields, then write remaining files through the HTTP file tools. */
export async function registerWithFiles(
  author: { invoke(name: string, args: unknown): Promise<unknown> },
  appId: string,
  files: Record<string, string>,
): Promise<unknown> {
  const manifest = files[appEntries.manifest]
  const parsed = manifest === undefined ? {} : JSON.parse(manifest) as Record<string, unknown>
  const result = await author.invoke('mini_app_register', {
    appId,
    name: typeof parsed.name === 'string' ? parsed.name : 'Example',
    description: typeof parsed.description === 'string' ? parsed.description : 'One line',
    version: typeof parsed.version === 'string' ? parsed.version : '1',
    ...typeof parsed.acronym === 'string' ? { acronym: parsed.acronym } : {},
    ...Array.isArray(parsed.tags) ? { tags: parsed.tags } : {},
    ...parsed.kind === 'workbench' || parsed.kind === 'website' ? { kind: parsed.kind } : {},
    ...typeof parsed.url === 'string' ? { url: parsed.url } : {},
  })
  for (const [relative, content] of Object.entries(files)) {
    if (relative === appEntries.manifest) continue
    await author.invoke('mini_app_write', { appId, path: relative, content, commit: false })
  }
  return result
}
