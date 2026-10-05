/** Codes the credential provider emits. Callers match `code`. */

export const credentialCodes = [
  'credential-invalid',
  'credential-unreadable',
  'credential-duplicate',
  'credential-write-unavailable',
] as const

export type CredentialCode = (typeof credentialCodes)[number]

/** A credential read failed. The file is unchanged. */
export class CredentialError extends Error {
  readonly code: CredentialCode

  /**
   * @param code - one of {@link credentialCodes}
   * @param message - human text; not the match key. Never includes a secret.
   * @param options - optional `cause`
   */
  constructor(code: CredentialCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CredentialError'
    this.code = code
  }
}
