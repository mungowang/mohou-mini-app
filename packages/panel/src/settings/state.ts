import { admitPanelPort, admitUpdateRegistry, panelLanguageFields } from './form.ts'
import type { PanelPolicy, PanelPolicyWrite, PanelSettingsClient } from './client.ts'

export interface SettingsState {
  readonly saved?: PanelPolicy
  readonly theme: PanelPolicy['theme']
  readonly palette: string
  readonly locale: string
  readonly port: string
  readonly registry: string
  readonly providerId: string
  readonly modelProvider: string
  readonly model: string
  readonly workbenchId: string
  readonly dirty: boolean
  readonly portError: boolean
  readonly registryError: boolean
  readonly saveError: boolean
  readonly saveMessage?: string
  readonly pending?: 'close' | 'restore'
  readonly closed: boolean
  readonly restartRequired: boolean
  /** True when restart is required because hostPort changed (MCP URL must be refreshed). */
  readonly restartPort: boolean
  /** True when restart is required because runtimeProvider.id changed. */
  readonly restartRuntime: boolean
  readonly probe?: string
}

export type SettingsAction =
  | { readonly type: 'loaded'; readonly policy: PanelPolicy }
  | { readonly type: 'edit-theme'; readonly theme: PanelPolicy['theme'] }
  | { readonly type: 'edit-palette'; readonly palette: string }
  | { readonly type: 'edit-locale'; readonly locale: string }
  | { readonly type: 'edit-port'; readonly port: string }
  | { readonly type: 'edit-registry'; readonly registry: string }
  | { readonly type: 'edit-provider'; readonly providerId: string }
  | { readonly type: 'edit-model'; readonly provider: string; readonly model: string }
  | { readonly type: 'edit-workbench'; readonly workbenchId: string }
  | { readonly type: 'saved'; readonly result: PanelPolicyWrite }
  /** Host policy written elsewhere (theme menu). Keeps appearance fields in sync. */
  | { readonly type: 'host-policy'; readonly policy: PanelPolicy }
  | { readonly type: 'port-invalid' }
  | { readonly type: 'registry-invalid' }
  /** The form could not be built at all (an unsupported locale). */
  | { readonly type: 'save-blocked' }
  | { readonly type: 'save-failed'; readonly message?: string }
  | { readonly type: 'escape' }
  | { readonly type: 'restore' }
  | { readonly type: 'confirm' }
  | { readonly type: 'probed'; readonly message: string }
  | { readonly type: 'update-failed' }

/** Empty form before the policy load. */
export function settingsState(): SettingsState {
  return {
    theme: 'system',
    palette: '',
    locale: 'en',
    port: '',
    registry: '',
    providerId: '',
    modelProvider: '',
    model: '',
    workbenchId: 'default',
    dirty: false,
    portError: false,
    registryError: false,
    saveError: false,
    closed: false,
    restartRequired: false,
    restartPort: false,
    restartRuntime: false,
  }
}

/**
 * Settings form transition. Port and language checks happen before a write.
 * Escape cancels a confirm first, then closes a clean form.
 * A dirty form asks before close and before restore.
 * @param state - current form
 * @param action - one edit or client result
 */
export function reduceSettings(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'loaded':
      return fromPolicy(action.policy)
    case 'edit-theme':
      return { ...state, theme: action.theme, dirty: true, saveError: false }
    case 'edit-palette':
      return { ...state, palette: action.palette, dirty: true, saveError: false }
    case 'edit-locale':
      return { ...state, locale: action.locale, dirty: true, saveError: false }
    case 'edit-port':
      return { ...state, port: action.port, dirty: true, portError: false, saveError: false }
    case 'edit-registry':
      return { ...state, registry: action.registry, dirty: true, registryError: false, saveError: false }
    case 'edit-provider':
      return { ...state, providerId: action.providerId, dirty: true, saveError: false }
    case 'edit-model':
      return { ...state, modelProvider: action.provider, model: action.model, dirty: true, saveError: false }
    case 'edit-workbench':
      return { ...state, workbenchId: action.workbenchId, dirty: true, saveError: false }
    case 'saved': {
      const portChanged = state.saved !== undefined && state.saved.hostPort !== action.result.policy.hostPort
      const runtimeChanged = state.saved !== undefined
        && state.saved.runtimeProvider.id !== action.result.policy.runtimeProvider.id
      return {
        ...fromPolicy(action.result.policy),
        restartRequired: action.result.restartRequired,
        restartPort: action.result.restartRequired && portChanged,
        restartRuntime: action.result.restartRequired && runtimeChanged,
      }
    }
    case 'host-policy': {
      const policy = action.policy
      if (!state.dirty) {
        const next = fromPolicy(policy)
        // Save updates parent hostPolicy immediately; do not drop the restart banner.
        if (!state.restartRequired) return next
        return {
          ...next,
          restartRequired: state.restartRequired,
          restartPort: state.restartPort,
          restartRuntime: state.restartRuntime,
        }
      }
      return {
        ...state,
        theme: policy.theme,
        palette: policy.palette,
        saved: state.saved === undefined
          ? policy
          : { ...state.saved, theme: policy.theme, palette: policy.palette },
      }
    }
    case 'port-invalid':
      return { ...state, portError: true, dirty: true }
    case 'registry-invalid':
      return { ...state, registryError: true, dirty: true }
    case 'save-blocked':
      return { ...omitSaveMessage(state), saveError: true, dirty: true }
    case 'save-failed':
      return {
        ...omitSaveMessage(state),
        saveError: true,
        dirty: true,
        ...action.message ? { saveMessage: action.message } : {},
      }
    case 'escape':
      if (state.pending !== undefined) return omitPending(state)
      if (!state.dirty) return { ...state, closed: true }
      return { ...state, pending: 'close' }
    case 'restore':
      if (!state.dirty) return state.saved === undefined ? state : fromPolicy(state.saved)
      if (state.pending === 'restore') return state.saved === undefined ? omitPending(state) : fromPolicy(state.saved)
      return { ...state, pending: 'restore' }
    case 'confirm':
      if (state.pending === 'restore') return state.saved === undefined ? omitPending(state) : fromPolicy(state.saved)
      // Abandon close: restore the snapshot so previews can be discarded.
      if (state.pending === 'close') {
        if (state.saved === undefined) return { ...omitPending(state), closed: true }
        return { ...fromPolicy(state.saved), closed: true }
      }
      return state
    case 'probed':
      return { ...state, probe: action.message }
    case 'update-failed':
      return { ...state, probe: 'update-failed' }
    default:
      return action satisfies never
  }
}

/** Policy to write, or a port error that must not be sent. */
export function settingsDraft(state: SettingsState): {
  ok: true
  policy: PanelPolicy
} | { ok: false; key: 'port-invalid' | 'registry-invalid' | 'save-blocked' } {
  const port = admitPanelPort(Number(state.port))
  if (!port.ok) return { ok: false, key: 'port-invalid' }
  const registry = admitUpdateRegistry(state.registry)
  if (!registry.ok) return { ok: false, key: 'registry-invalid' }
  let language: ReturnType<typeof panelLanguageFields>
  try {
    language = panelLanguageFields(state.locale)
  } catch {
    return { ok: false, key: 'save-blocked' }
  }
  return {
    ok: true,
    policy: {
      theme: state.theme,
      palette: state.palette,
      locale: language.locale,
      chatLanguage: language.chatLanguage,
      hostPort: port.port,
      llm: state.modelProvider === '' && state.model === '' ? null : { provider: state.modelProvider, model: state.model },
      runtimeProvider: { id: state.providerId },
      updateRegistry: registry.registry,
      ...state.workbenchId === 'default' ? {} : { defaultWorkbenchId: state.workbenchId },
    },
  }
}

/** Load policy into the form. */
export async function loadSettings(
  client: PanelSettingsClient,
  dispatch: (action: SettingsAction) => void,
): Promise<void> {
  dispatch({ type: 'loaded', policy: await client.readPolicy() })
}

function fromPolicy(policy: PanelPolicy): SettingsState {
  return {
    saved: policy,
    theme: policy.theme,
    palette: policy.palette,
    locale: policy.locale,
    port: String(policy.hostPort),
    registry: policy.updateRegistry ?? '',
    providerId: policy.runtimeProvider.id,
    modelProvider: policy.llm?.provider ?? '',
    model: policy.llm?.model ?? '',
    workbenchId: policy.defaultWorkbenchId ?? 'default',
    dirty: false,
    portError: false,
    registryError: false,
    saveError: false,
    closed: false,
    restartRequired: false,
    restartPort: false,
    restartRuntime: false,
  }
}

function omitPending(state: SettingsState): Omit<SettingsState, 'pending'> {
  const { pending: gone, ...rest } = state
  void gone
  return rest
}

function omitSaveMessage(state: SettingsState): Omit<SettingsState, 'saveMessage'> {
  const { saveMessage: gone, ...rest } = state
  void gone
  return rest
}
