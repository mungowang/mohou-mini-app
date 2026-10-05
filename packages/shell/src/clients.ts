import type { HostPolicy, HostSession } from '@mohou/host'

/** Policy fields the panel form owns. `runtimeRoot` stays on the host. */
export interface OwnerPolicy {
  readonly theme: HostPolicy['theme']
  readonly palette: string
  readonly locale: string
  readonly chatLanguage: string
  readonly hostPort: number
  readonly llm: HostPolicy['llm']
  readonly runtimeProvider: { readonly id: string }
  readonly defaultWorkbenchId?: string
}

export interface OwnerPolicyWrite {
  readonly policy: OwnerPolicy
  readonly restartRequired: boolean
}

/**
 * In-process owner calls for the panel. No route string lives here.
 * The window is not opened. Shell does not import the panel package.
 * @param host - a booted host
 */
export function ownerClients(host: HostSession) {
  return {
    gallery: {
      list: () => host.owner.list(),
      open: (appId: string, title?: string) => title === undefined ? host.owner.open(appId) : host.owner.open(appId, title),
      deleteApp: (appId: string) => host.owner.deleteApp(appId),
      reload: (appId: string) => host.owner.reloadView(appId),
      listTrash: () => host.owner.listTrash(),
      undeleteApp: (appId: string) => host.owner.undeleteApp(appId),
    },
    settings: {
      readPolicy: () => Promise.resolve(panelPolicy(host.owner.readPolicy())),
      writePolicy: (next: OwnerPolicy) => writePolicy(host, next),
      probe: (id: string) => host.owner.probe(id),
    },
    history: {
      readHistory: (appId: string) => host.owner.readHistory(appId),
      readCommit: (appId: string, commitId: string) => host.owner.readCommit(appId, commitId),
    },
    storage: {
      readStorage: (appId: string) => host.owner.readStorage(appId),
      readTable: (appId: string, table: string) => host.owner.readTable(appId, table),
    },
    theme: {
      listPalettes: () => host.owner.themes.listPalettes(),
      readPin: (appId: string) => host.owner.themes.readPin(appId),
      appFile: (appId: string) => host.owner.themes.appFile(appId),
      readAppTheme: (appId: string) => host.owner.themes.readAppTheme(appId),
      setPin: (appId: string, pin: Parameters<HostSession['owner']['themes']['setPin']>[1]) => host.owner.themes.setPin(appId, pin),
    },
  }
}

function panelPolicy(policy: HostPolicy): OwnerPolicy {
  return {
    theme: policy.theme,
    palette: policy.palette,
    locale: policy.locale,
    chatLanguage: policy.chatLanguage,
    hostPort: policy.hostPort,
    llm: policy.llm,
    runtimeProvider: { id: policy.runtimeProvider.id },
    ...policy.defaultWorkbenchId === undefined ? {} : { defaultWorkbenchId: policy.defaultWorkbenchId },
    ...policy.updateRegistry === undefined ? {} : { updateRegistry: policy.updateRegistry },
  }
}

async function writePolicy(host: HostSession, next: OwnerPolicy): Promise<OwnerPolicyWrite> {
  const current = host.owner.readPolicy()
  const sameProvider = current.runtimeProvider.id === next.runtimeProvider.id
  const written = await host.owner.writePolicy({
    runtimeRoot: current.runtimeRoot,
    hostPort: next.hostPort,
    theme: next.theme,
    palette: next.palette,
    locale: next.locale,
    chatLanguage: next.chatLanguage,
    llm: next.llm,
    runtimeProvider: sameProvider ? current.runtimeProvider : { id: next.runtimeProvider.id },
    ...next.defaultWorkbenchId === undefined ? {} : { defaultWorkbenchId: next.defaultWorkbenchId },
  })
  return { policy: panelPolicy(written.policy), restartRequired: written.restartRequired }
}
