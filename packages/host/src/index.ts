/** Host package. Kernel is the call loop. @module @mohou/host */

export const packageId = '@mohou/host' as const

export {
  HostError,
  bindBrain,
  hostCodes,
  resolveWorkingDirectory,
  runCall,
  type BoundBrain,
  type BrainBinding,
  type CallCapabilities,
  type HostCode,
  type ModelPolicy,
  type WorkingDirectoryInput,
} from './kernel/index.ts'
export { StorageError, storageCodes, type StorageCode } from './storage/codes.ts'
export { DEFAULT_STORAGE_NOTICE_BYTES, openStorage, type StorageConnect, type StorageFile, type StorageOpenOptions } from './storage/open.ts'
export {
  storageBackup,
  storageBackupMeta,
  storageBlocked,
  storageDatabase,
  storageDir,
  storageLayout,
  storageQuarantine,
} from './storage/layout.ts'
export { restoreStorageBackup } from './storage/schema.ts'
export { HttpError, httpCodes, type HttpCode } from './http/codes.ts'
export { createHttp, type HttpPolicy } from './http/client.ts'
export { appResource, appsResource, historyListBound, httpLayout, runnerPath } from './http/layout.ts'
export { BashError, bashCodes, type BashCode } from './bash/codes.ts'
export { createBash, scrubBashEnv, type BashHandle, type BashPolicy, type BashResult } from './bash/client.ts'
export { PwshError, pwshCodes, type PwshCode } from './pwsh/codes.ts'
export { createPwsh, pwshCandidates } from './pwsh/client.ts'
export { scrubShellEnv, stopChild, type CommandPolicy, type CommandResult } from './shell/command.ts'
export { MetricsError, metricsCodes, type MetricsCode } from './metrics/codes.ts'
export { readMetrics } from './metrics/read.ts'
export {
  bindAppHooks,
  createAppEvents,
  forwardFrames,
  DEFAULT_APP_EVENT_PING_MS,
  DEFAULT_APP_EVENT_RETRY_MS,
  type AppEvents,
  type AppGap,
  type AppHooks,
  type AppPing,
  type AppRetry,
  type AppStreamItem,
  type AuthorEvent,
} from './events/app-events.ts'
export { admitErrorReport, createErrorRing, errorKinds, type AppErrorRecord, type ErrorKind } from './events/error-ring.ts'
export { createHostEvents, type HostEvent } from './events/host-events.ts'
export {
  DEFAULT_VIEW_CODE,
  DEFAULT_VIEW_MAX_BYTES,
  DEFAULT_VIEW_TIMEOUT_MS,
  createViewQueries,
  viewStates,
  type ViewEnvelope,
  type ViewState,
  type ViewStop,
} from './events/view-eval.ts'
export { FileToolError, fileToolCodes, type FileToolCode } from './files/codes.ts'
export { createFileTools, resolveAppPath, type FileCommit, type FileRead } from './files/tools.ts'
export {
  listMcpForAuthor,
  toolsMcpForAuthor,
  type AuthorMcpServerNames,
  type AuthorMcpServerTools,
  type AuthorMcpTool,
} from './tools/mcp-list.ts'
export { AuthorError, authorCodes, type AuthorCode } from './tools/codes.ts'
export { HistoryError, historyCodes, type HistoryCode } from './history/codes.ts'
export { InstallError, installCodes, type InstallCode } from './install/codes.ts'
export {
  DEFAULT_INSTALL_TIMEOUT_MS,
  installApp,
  runNpm,
  type InstallRequest,
  type InstallResult,
  type NpmRun,
} from './install/install.ts'
export { installLayout, packageLock, packageManifest } from './install/layout.ts'
export {
  commitApp,
  historyBounds,
  listHistory,
  readAppCommit,
  resetApp,
  type HistoryNode,
  type HistoryTip,
} from './history/store.ts'
export {
  authorByteToolNames,
  authorMcpToolNames,
  authorToolNames,
  createAuthorTools,
  isAuthorMcpTool,
  ensureAuthoringToken,
  readAuthoringToken,
  type AuthorCallPorts,
  type AuthorToolName,
} from './tools/author.ts'
export { authoringTokenMatches, isLoopbackAddress, startAuthorHttp } from './tools/http.ts'
export { createLoopbackApp } from './http/app.ts'
export { routeCodes, RouteError, type RouteCode } from './http/route-codes.ts'
export { diagnosticLayout, diagnosticUrl } from './tools/diagnostics.ts'
export { RegistryError, createAppRegistry, listedApp, type AppSummary, type ListedApp } from './apps/registry.ts'
export { heat, type HeatSample, type HeatSnapshot, type HeatValue } from './host/heat.ts'
export { ActivityError, readActivity, recordOpen, type Activity, type ActivityApp } from './host/activity.ts'
export { monogram } from './apps/monogram.ts'
export { createOwnerReads, DEFAULT_OWNER_ROW_CAP, reloadView } from './owner/read.ts'
export { ThemeError, themeCodes, type ThemeCode } from './theme/codes.ts'
export {
  appThemeCss,
  appThemePin,
  customThemeId,
  customThemePath,
  themeLayout,
} from './theme/layout.ts'
export { parseThemeCss } from './theme/parse.ts'
export { requiredThemeTokens, themeTokens, type ThemeToken } from './theme/tokens.ts'
export { resolveFirstPaint, firstPaintStyle, type FirstPaint } from './theme/paint.ts'
export { createThemePins, type AppPin, type PaletteList } from './theme/pin.ts'
export { CredentialError, credentialCodes, type CredentialCode } from './credentials/codes.ts'
export { createFileCredentials } from './credentials/file.ts'
export {
  createCredentials,
  credentialSourceKinds,
  type BuiltinJsonCredentialSource,
  type CredentialSource,
  type CredentialSourceKind,
} from './credentials/create.ts'
export {
  admitCredentialName,
  emptyCredentials,
  type CredentialListing,
  type CredentialProvider,
} from './credentials/provider.ts'
export { ConfigError, configCodes, type ConfigCode } from './host/codes.ts'
export {
  DEFAULT_PORT_BOUND,
  hostThemes,
  probeBrain,
  resolveHostConfig,
  writeHostPolicy,
  type HostPolicy,
  type HostSeed,
  type HostTheme,
  type PortBound,
} from './host/config.ts'
export {
  allocateHostPort,
  HOST_PORT_PROBE_SPAN,
  isHostPortFree,
  isPortInUseError,
  PortInUseError,
} from './host/port.ts'
export {
  defaultRuntimeRoot,
  homeCredentialsPath,
  homeDir,
  homeLayout,
  homeThemesDir,
  hostAppsDir,
  hostTrashDir,
  hostAuthoringToken,
  hostAppLogPath,
  hostConfigPath,
  hostLayout,
  hostMcpPath,
} from './host/layout.ts'
export { createHostLog, DEFAULT_HOST_LOG_BYTES, type HostLog } from './host/log.ts'
export { loadMcpServers, mcpConfigEnv, mcpReferenceSources } from './host/mcp.ts'
export { createHost, type HostSession } from './host/session.ts'
export {
  ensureRuntimeAppsLayout,
  startupSamples,
  startupSeedMarker,
  type StartupSeedResult,
} from './apps/startup-seed.ts'
export {
  platformBundled,
  platformImportMap,
  platformLayout,
  platformModuleAllowed,
  platformModules,
  platformRuntimePath,
  platformSdkPath,
  platformVendorPath,
  type PlatformModule,
  type PlatformSide,
} from './compile/allowlist.ts'
export { CompileError, compileCodes, type CompileCode } from './compile/codes.ts'
export { loadBackend, type LoadedBackend } from './compile/load-backend.ts'
export { reviewApp, reviewNoticeCodes, type AppReview, type ReviewNotice, type ReviewNoticeCode } from './compile/review.ts'
export { renderRunnerDocument } from './compile/runner.ts'
export { compilePanelStylesheet } from './compile/sheet.ts'
