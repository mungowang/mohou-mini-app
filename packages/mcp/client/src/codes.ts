/** Codes the MCP client emits. */

export const mcpCodes = [
  'mcp-not-connected',
  'mcp-start-failed',
  'mcp-tool-failed',
  'config-invalid',
  'mcp-reference-unknown',
  'mcp-reference-invalid',
] as const

/** An MCP client failure. Callers match `code`. */
export type McpCode = (typeof mcpCodes)[number]

/** Failure from `ctx.mcp`. The message is for a person. Secrets are not included. */
export class McpError extends Error {
  readonly code: McpCode

  /**
   * @param code - one of {@link mcpCodes}
   * @param message - human text; not the match key
   * @param options - optional `cause`
   */
  constructor(code: McpCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'McpError'
    this.code = code
  }
}
