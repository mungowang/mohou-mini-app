import { appEntries } from '@mohou/contract'

/** Loopback paths. Spell them here. Call sites use these helpers. */

export const httpLayout = {
  apps: '/api/apps',
  app: '/api/app',
  events: '/api/events',
  call: '/api/call',
  hostConfig: '/api/host-config',
  palettes: '/api/palettes',
  about: '/api/about',
  updates: '/api/updates',
  updateInstall: '/api/updates/install',
  providers: '/api/runtime-providers',
  activate: '/api/runtime-providers/activate',
  probe: '/api/runtime-providers/probe',
  restart: '/api/restart',
  authorSkill: '/api/author-skill',
  authorSkillReveal: '/api/author-skill/reveal',
  authorMcp: '/api/author-mcp',
  authorMcpReveal: '/api/author-mcp/reveal',
  mcpServers: '/api/mcp-servers',
  mcpCheck: '/api/mcp-servers/check',
  mcpAdmit: '/api/mcp-servers/admit',
  mcpImport: '/api/mcp-servers/import',
  credentials: '/api/credentials',
  credentialRemove: '/api/credentials/remove',
  tools: '/api/tools',
  invoke: '/api/tools/invoke',
  mcp: '/mcp',
  runner: '/app',
  trash: '/api/trash',
  panel: '/',
  panelScript: '/panel.js',
  open: 'open',
  reload: 'reload',
  restore: 'restore',
  restoreStorage: 'restore',
  history: 'history',
  storage: 'storage',
  theme: 'theme',
  ui: 'ui',
  entry: 'entry.js',
  sheet: appEntries.stylesheet,
  assets: 'assets',
} as const

/** History list bound. Host policy, not a locked number. */
export const historyListBound = { default: 50, max: 200 } as const

export function runnerPath(appId: string): string {
  return `${httpLayout.runner}/${encodeURIComponent(appId)}`
}

export function appResource(appId: string, ...rest: string[]): string {
  return [httpLayout.app, encodeURIComponent(appId), ...rest.map(encodeURIComponent)].join('/')
}

export function appsResource(appId: string, ...rest: string[]): string {
  return [httpLayout.apps, encodeURIComponent(appId), ...rest.map(encodeURIComponent)].join('/')
}
