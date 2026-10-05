import type { AppAgentEvent, AppAgentOptions, AppLlmEvent, AppLlmOptions } from '@mohou/contract'

/** Provider-only listener. Authors read a stream. They do not pass this. */
export type RuntimeLlmOptions = AppLlmOptions & {
  onEvent?: (event: AppLlmEvent) => void
}

/** Provider-only listener. Authors read a stream. They do not pass this. */
export type RuntimeAgentOptions = AppAgentOptions & {
  onEvent?: (event: AppAgentEvent) => void
}

/** One settings field a panel can render. */
export interface SettingsField {
  readonly name: string
  readonly kind: 'string' | 'secret' | 'select'
  readonly options?: readonly string[]
}

/** Models one vendor inside a brain exposes. The brain id is not this field. */
export interface ModelListing {
  readonly provider: string
  readonly models: readonly string[]
}

/** Config Shell injects. Numeric limits are not this package's policy. */
export interface RuntimeProviderConfig {
  readonly provider?: string
  readonly model?: string
  readonly options?: Record<string, string>
}

/**
 * One brain. Host calls `configure`, then `start`, then `llm` and `agent`.
 * Switching model does not change the tools that provider already runs. That set is not a method on this interface.
 */
export interface RuntimeProvider {
  readonly id: string
  readonly label?: string
  configure?(config: RuntimeProviderConfig): void
  start(): Promise<void>
  stop(): Promise<void>
  healthy(): boolean
  /**
   * Why `healthy()` is false, for a settings probe. Absent means the host says only that the
   * provider is unhealthy; a provider that knows the reason should not make the user guess.
   */
  reason?(): string | undefined
  /** Vendor groups. Absent means this brain does not reject a model name. Each call may fetch. */
  models?(): Promise<readonly ModelListing[]>
  llm(prompt: string, options?: RuntimeLlmOptions): Promise<string>
  agent(goal: string, options?: RuntimeAgentOptions): Promise<string>
  describe?(): readonly SettingsField[]
}
