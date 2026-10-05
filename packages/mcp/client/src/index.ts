/** External MCP client. Not a model provider. @module @mohou/mcp-client */

export const packageId = '@mohou/mcp-client' as const

export { McpError, mcpCodes, type McpCode } from './codes.ts'
export { resolveMcpConfig, type McpServerSpec } from './config.ts'
export {
  mcpReferenceKinds,
  resolveServerMap,
  resolveServerValues,
  type McpReferenceKind,
  type McpReferenceSources,
} from './references.ts'
export { McpClient } from './client.ts'
export { isCredential, looksLikeCredential, maskCredential, mayHoldCredential, namesCredential } from './secrets.ts'
