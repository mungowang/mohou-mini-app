import { CredentialError } from './codes.ts'

/** One account an author can recognize. No secret. */
export interface CredentialListing {
  readonly name: string
  readonly description: string
}

/**
 * One credential store. Read and write are one abstraction, so Shell swaps the implementation in
 * one place: the built-in JSON file today, a system keychain later.
 *
 * App code does not see this interface. `ctx.credentials` projects `get` alone.
 */
export interface CredentialProvider {
  /** Whether {@link put} and {@link remove} do anything. A read-only source is false. */
  readonly writable: boolean
  list(): Promise<readonly CredentialListing[]>
  get(name: string): Promise<string | undefined>
  /**
   * Write one account. An existing name keeps its place and takes the new description and secret.
   * @param name - owner-chosen account name
   * @param description - text the owner recognizes
   * @param secret - the one value
   */
  put(name: string, description: string, secret: string): Promise<void>
  /**
   * Remove one account. A missing name changes nothing.
   * @param name - owner-chosen account name
   */
  remove(name: string): Promise<void>
}

/**
 * No source. `list` is empty, `get` is `undefined`, and the write side says why it cannot write.
 * An empty name is still `credential-invalid`.
 */
export function emptyCredentials(): CredentialProvider {
  return {
    writable: false,
    list: () => Promise.resolve([]),
    get: name => Promise.resolve().then(() => {
      admitCredentialName(name)
      return undefined
    }),
    put: (name) => {
      admitCredentialName(name)
      return Promise.reject(cannotWrite())
    },
    remove: (name) => {
      admitCredentialName(name)
      return Promise.reject(cannotWrite())
    },
  }
}

/** Reject an empty name before the source is read. */
export function admitCredentialName(name: string): string {
  if (name === '') throw new CredentialError('credential-invalid', 'credential name is empty')
  return name
}

/** The failure of a write against a store that has no writable source. */
export function cannotWrite(): CredentialError {
  return new CredentialError('credential-write-unavailable', 'no credential source can be written')
}
