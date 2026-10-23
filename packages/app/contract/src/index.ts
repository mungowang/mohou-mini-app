/** App definition: ids, manifest, imports, `defineApp`, `ctx`. No I/O. @module @mohou/contract */

export const packageId = '@mohou/contract' as const

export { parseAppId, type AppId } from './app-id.ts'
export { appEntries, appTrees } from './entries.ts'
export { resolveManifest, type Manifest } from './manifest.ts'
export {
  builtinWorkbenchId,
  workbenchEntries,
  type AppListItem,
  type AppWorkbench,
  type WorkbenchEntry,
} from './workbench.ts'
export { assertImportAllowed, classifyImport, type ImportSide } from './imports.ts'
export { defineApp, type AppApiMethod, type AppDefinition } from './define-app.ts'
export { type AppChange, type HostNotice } from './host-notice.ts'
export { ContractError, definitionCodes, type DefinitionCode } from './codes.ts'
export {
  websiteSnapshotEvent,
  type AppSpawnHandle,
  type AppSpawnOptions,
  type MaybePromise,
  type WebsiteContentDriver,
  type WebsiteContentInfo,
  type WebsiteDriver,
  type WebsiteSessionApi,
  type WebsiteError,
  type WebsiteHandle,
  type WebsitePhase,
  type WebsiteSnapshot,
  type WebsiteUrlResult,
} from './website.ts'
export { agentEventType, eventType, llmEventType, type AgentEventType, type EventType, type LlmEventType } from './event-type.ts'
export type {
  AppAgentEvent,
  AppAgentOptions,
  AppAgentTurnEndReason,
  AppConfig,
  AppContext,
  AppCredentials,
  AppHttpRequest,
  AppHttpResponse,
  AppImageData,
  AppImageFile,
  AppImageInput,
  AppKeyValueTable,
  AppLlmEvent,
  AppLlmOptions,
  AppModelOptions,
  AppStorage,
  AppSystemMetrics,
  SqlParams,
  SqlRow,
  SqlValue,
} from './context.ts'
