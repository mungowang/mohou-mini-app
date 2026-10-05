import path from 'node:path'

/** Names under the runtime root. Spell them here, not at each call site. */
export const hostLayout = {
  config: 'host.json',
  apps: 'apps',
  trash: 'trash',
  trashSep: '_',
  authoringToken: 'authoring.token',
  mcp: 'mcp.json',
  logs: 'logs',
  appLog: 'app.log',
  activity: 'activity.json',
  /** The launcher records the outcome of an install here. The panel shows it once. */
  updateResult: 'update-result.json',
} as const

export function hostConfigPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.config)
}

export function hostAppsDir(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.apps)
}

export function hostTrashDir(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.trash)
}

export function hostAuthoringToken(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.authoringToken)
}

export function hostMcpPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.mcp)
}

/** Usage on this machine. Not source history. */
export function hostActivityPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.activity)
}

/** The launcher's record of the last install. Absent until an install has run. */
export function hostUpdateResultPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, hostLayout.updateResult)
}

/** Active app log. It sits at `apps/<appId>/logs/app.log`. */
export function hostAppLogPath(runtimeRoot: string, appId: string): string {
  return path.join(runtimeRoot, hostLayout.apps, appId, hostLayout.logs, hostLayout.appLog)
}

/** Product home. Themes sit beside the runtime root, not inside it. */
export const homeLayout = {
  dir: '.mini-app',
  runtime: 'runtime',
  themes: 'themes',
  packages: 'packages',
  credentials: 'credentials.json',
} as const

export function homeDir(home: string): string {
  return path.join(home, homeLayout.dir)
}

export function defaultRuntimeRoot(home: string): string {
  return path.join(homeDir(home), homeLayout.runtime)
}

export function homeThemesDir(home: string): string {
  return path.join(homeDir(home), homeLayout.themes)
}

/** Drop folder for local tarball updates. Not user data. */
export function homePackagesDir(home: string): string {
  return path.join(homeDir(home), homeLayout.packages)
}

export function homeCredentialsPath(home: string): string {
  return path.join(homeDir(home), homeLayout.credentials)
}
