import { CredentialError } from './codes.ts'
import { createFileCredentials } from './file.ts'
import { admitCredentialName, cannotWrite, emptyCredentials, type CredentialListing, type CredentialProvider } from './provider.ts'

/** Sources this package knows how to open. A later source adds one member. */
export const credentialSourceKinds = ['builtin-json'] as const

export type CredentialSourceKind = (typeof credentialSourceKinds)[number]

/** JSON file. The path is this kind's target, not a field of every source. */
export interface BuiltinJsonCredentialSource {
  readonly kind: 'builtin-json'
  readonly file: string
}

/** One source spec. Each kind carries its own target. */
export type CredentialSource = BuiltinJsonCredentialSource

const openers: {
  readonly [Kind in CredentialSourceKind]: (source: Extract<CredentialSource, { kind: Kind }>) => CredentialProvider
} = {
  'builtin-json': source => createFileCredentials(source.file),
}

/**
 * One read port over every source. Each kind carries its own target.
 * The same name in two sources emits `credential-duplicate`. No source wins silently.
 * An empty list is `emptyCredentials`.
 * @param sources - source specs. Opening happens here, not at the call site.
 */
export function createCredentials(sources: readonly CredentialSource[]): CredentialProvider {
  if (sources.length === 0) return emptyCredentials()
  return combineCredentials(sources.map(source => openers[source.kind](source)))
}

function combineCredentials(providers: readonly CredentialProvider[]): CredentialProvider {
  // One store owns writes: the first source that accepts them. With one source that is unambiguous,
  // and a second read-only source cannot silently take a write meant for the first.
  const writer = providers.find(provider => provider.writable)
  return {
    writable: writer !== undefined,
    async list() {
      const rows = await Promise.all(providers.map(provider => provider.list()))
      const seen = new Set<string>()
      const listings: CredentialListing[] = []
      for (const row of rows) {
        for (const item of row) {
          if (seen.has(item.name)) {
            throw new CredentialError('credential-duplicate', `credential name is in more than one source: ${item.name}`)
          }
          seen.add(item.name)
          listings.push(item)
        }
      }
      return listings.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    },
    async get(name) {
      admitCredentialName(name)
      const values = await Promise.all(providers.map(provider => provider.get(name)))
      const found = values.filter((value): value is string => value !== undefined)
      if (found.length > 1) {
        throw new CredentialError('credential-duplicate', `credential name is in more than one source: ${name}`)
      }
      return found[0]
    },
    put: (name, description, secret) => writer === undefined ? Promise.reject(cannotWrite()) : writer.put(name, description, secret),
    remove: name => writer === undefined ? Promise.reject(cannotWrite()) : writer.remove(name),
  }
}
