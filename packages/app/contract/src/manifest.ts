import { ContractError } from './codes.ts'
import { parseAppId, type AppId } from './app-id.ts'
import { appEntries } from './entries.ts'

/** Manifest fields the loader accepts. Acronym derivation is not done here. */
export interface Manifest {
  readonly id: AppId
  readonly name: string
  readonly description: string
  readonly version: string
  readonly entry: typeof appEntries.ui
  readonly acronym?: string
  readonly tags?: readonly string[]
  /** Omitted or absent means an ordinary app. `workbench` and `website` are exclusive. */
  readonly kind?: 'workbench' | 'website'
  /** Default content url when `kind` is `website`. Required for that kind. */
  readonly url?: string
}

const acronymToken = /^[\p{L}\p{N}]{2}$/u
const tagToken = /^[a-z][a-z0-9-]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContractError('manifest-invalid', `manifest ${key} is required`)
  }
  return value
}

/**
 * Admit manifest JSON. `directoryName` is the app directory name, not a path.
 * @param raw - parsed JSON, still untrusted
 * @param directoryName - directory that contains the file
 */
export function resolveManifest(raw: unknown, directoryName: string): Manifest {
  if (!isRecord(raw)) {
    throw new ContractError('manifest-invalid', 'manifest must be an object')
  }
  const name = requiredString(raw, 'name')
  const description = requiredString(raw, 'description')
  const version = requiredString(raw, 'version')
  const entry = requiredString(raw, 'entry')
  if (entry !== appEntries.ui) {
    throw new ContractError('manifest-invalid', `manifest entry must be ${appEntries.ui}`)
  }
  const idText = requiredString(raw, 'id')
  let id: AppId
  try {
    id = parseAppId(idText)
  } catch (error) {
    throw new ContractError('app-id-invalid', `app id is not reverse-DNS: ${idText}`, { cause: error })
  }
  if (id !== directoryName) {
    throw new ContractError('app-id-invalid', `app id ${idText} does not match directory ${directoryName}`)
  }
  const acronym = resolveAcronym(raw.acronym)
  const tags = resolveTags(raw.tags)
  const kind = resolveKind(raw.kind)
  const url = resolveUrl(raw.url, kind)
  const admitted = { id, name, description, version, entry: appEntries.ui }
  return {
    ...admitted,
    ...acronym === undefined ? {} : { acronym },
    ...tags === undefined ? {} : { tags },
    ...kind === undefined ? {} : { kind },
    ...url === undefined ? {} : { url },
  }
}

function resolveAcronym(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !acronymToken.test(value)) {
    throw new ContractError('manifest-invalid', 'manifest acronym must be two letters or digits')
  }
  return value
}

function resolveKind(value: unknown): 'workbench' | 'website' | undefined {
  if (value === undefined || value === 'app') return undefined
  if (value === 'workbench') return 'workbench'
  if (value === 'website') return 'website'
  throw new ContractError('manifest-invalid', 'manifest kind must be app, workbench, or website')
}

function resolveUrl(value: unknown, kind: 'workbench' | 'website' | undefined): string | undefined {
  if (kind !== 'website') {
    if (value === undefined) return undefined
    throw new ContractError('manifest-invalid', 'manifest url is only valid for kind website')
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContractError('manifest-invalid', 'manifest url is required for kind website')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new ContractError('manifest-invalid', 'manifest url must be an absolute http(s) URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ContractError('manifest-invalid', 'manifest url must be http or https')
  }
  return value
}

function resolveTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new ContractError('manifest-invalid', 'manifest tags must be a non-empty list')
  }
  const tags: string[] = []
  for (const tag of value) {
    if (typeof tag !== 'string' || !tagToken.test(tag)) {
      throw new ContractError('manifest-invalid', 'manifest tag must be a lowercase token')
    }
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}
