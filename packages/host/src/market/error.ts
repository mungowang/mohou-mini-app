/** Codes the market emits. Callers match the code. */

export const marketCodes = [
  'market-catalog',
  'market-sum',
  'market-id',
  'market-schema',
  'market-package',
  'market-confirm',
  'market-install',
] as const

export type MarketCode = (typeof marketCodes)[number]

/** A market failure. The message is for a person. */
export class MarketError extends Error {
  readonly code: MarketCode

  /**
   * @param code - one of {@link marketCodes}
   * @param message - human text
   */
  constructor(code: MarketCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MarketError'
    this.code = code
  }
}
