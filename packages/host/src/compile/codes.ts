/** Codes the backend loader emits. Import checks still use the definition codes. */

export const compileCodes = ['backend-invalid', 'ui-invalid', 'shared-invalid', 'event-undeclared', 'ui-placement'] as const

/** A backend load failure. Callers match `code`. */
export type CompileCode = (typeof compileCodes)[number]

/** Failure while loading `main.api.ts`. The message is for a person. */
export class CompileError extends Error {
  readonly code: CompileCode

  /**
   * @param code - one of {@link compileCodes}
   * @param message - human text; not the match key
   * @param options - optional `cause`
   */
  constructor(code: CompileCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CompileError'
    this.code = code
  }
}
