/** Codes this provider package emits. Callers match `code`. */

export const providerCodes = [
  'provider-missing',
  'provider-duplicate',
  'provider-unhealthy',
  'empty-completion',
  'cancelled',
  'unknown-model-provider',
  'unknown-model',
  'image-unsupported',
  'retry-exhausted',
] as const

/** A failure emitted by a runtime provider or its registry. */
export type ProviderCode = (typeof providerCodes)[number]

/** Failure a caller branches on. The message is for a person. */
export class ProviderError extends Error {
  readonly code: ProviderCode

  /**
   * @param code - one of {@link providerCodes}
   * @param message - human text; not the match key
   * @param options - optional `cause`
   */
  constructor(code: ProviderCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProviderError'
    this.code = code
  }
}
