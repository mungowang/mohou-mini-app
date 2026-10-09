import type { AppAgentEvent, AppLlmEvent } from '@mohou/contract'
import { ProviderError, assertKnownModel, type RuntimeAgentOptions, type RuntimeLlmOptions, type RuntimeProvider, type RuntimeProviderConfig } from '@mohou/runtime-provider'

import { HostError } from './codes.ts'
import { admitImages } from './images.ts'
import { admitModelBudget, callWithRetry, stripSchemaFence, type ModelPolicy, DEFAULT_MODEL_POLICY } from './model-policy.ts'
import { present } from './present.ts'
import { resolveWorkingDirectory } from './working-directory.ts'

function choice(options: { provider?: string; model?: string } | undefined): { provider?: string; model?: string } {
  return {
    ...present('provider', options?.provider),
    ...present('model', options?.model),
  }
}

/** What Host needs to route model calls. Push is the app's `ctx.push`. */
export interface BrainBinding {
  readonly provider: RuntimeProvider
  readonly config?: RuntimeProviderConfig
  readonly appDir: string
  readonly processDirectory: string
  readonly createTemp: () => string
  readonly push: (name: string, params: unknown) => void
}

/** App-facing model calls after the brain has started. */
export interface BoundBrain {
  llm(prompt: string, options?: RuntimeLlmOptions): Promise<string>
  agent(goal: string, options?: RuntimeAgentOptions): Promise<string>
  stop(): Promise<void>
}

/**
 * Configure and start one injected brain, then route `llm` and `agent`.
 * Host does not choose the vendor. `start` throwing fails the caller.
 * @param binding - the provider Shell selected, plus directories and push
 */
export async function bindBrain(binding: BrainBinding, policy: ModelPolicy = DEFAULT_MODEL_POLICY): Promise<BoundBrain> {
  binding.provider.configure?.(binding.config ?? {})
  await binding.provider.start()
  return {
    async llm(prompt, options) {
      const budget = admitModelBudget(options, policy)
      const images = await admitImages(options?.images, policy)
      await assertKnownModel(binding.provider, choice(options))
      const forwarded = images === undefined ? options : { ...options, images }
      return callWithRetry(budget.retryTimes, options?.signal, async () => {
        const text = await binding.provider.llm(prompt, llmCall(forwarded, budget.maxTokens))
        return options?.schema === undefined ? text : stripSchemaFence(text)
      })
    },
    async agent(goal, options) {
      try {
        const budget = admitModelBudget(options, policy)
        const images = await admitImages(options?.images, policy)
        await assertKnownModel(binding.provider, choice(options))
        const cwd = resolveWorkingDirectory({
          ...present('cwdType', options?.cwdType),
          ...present('cwd', options?.cwd),
          appDir: binding.appDir,
          processDirectory: binding.processDirectory,
          createTemp: binding.createTemp,
        })
        const controller = new AbortController()
        if (options?.signal?.aborted) controller.abort()
        else options?.signal?.addEventListener('abort', () => {
          controller.abort()
        }, { once: true })
        let completedTurns = 0
        const onEvent = (event: AppAgentEvent): void => {
          try {
            options?.onEvent?.(event)
          } catch {
            // A throwing observer does not abort the run.
          }
          if (event.type === 'turn' && event.phase === 'end') {
            completedTurns += 1
            if (completedTurns >= budget.maxIterations) controller.abort()
          }
        }
        return await callWithRetry(budget.retryTimes, options?.signal, () => binding.provider.agent(goal, {
          ...options,
          ...images === undefined ? {} : { images },
          cwd,
          cwdType: 'custom',
          signal: controller.signal,
          onEvent,
        }))
      } catch (error) {
        throw namedAgent(error)
      }
    },
    // The host owns the shared provider. A finished app call must not clear it.
    stop: () => Promise.resolve(),
  }
}

function llmCall(options: RuntimeLlmOptions | undefined, maxTokens: number): RuntimeLlmOptions {
  const budgeted = { ...options, maxTokens: options?.maxTokens ?? maxTokens }
  if (options?.stream !== true) {
    const { onEvent: _ignored, ...quiet } = budgeted
    return quiet
  }
  const onEvent = (event: AppLlmEvent): void => {
    try {
      options.onEvent?.(event)
    } catch {
      // A throwing observer does not abort the completion.
    }
  }
  return { ...budgeted, onEvent }
}

function namedAgent(error: unknown): Error {
  if (error instanceof ProviderError) {
    return new ProviderError(error.code, `agent: ${error.message}`, { cause: error })
  }
  if (error instanceof HostError) return new HostError(error.code, `agent: ${error.message}`)
  const message = error instanceof Error ? error.message : 'agent failed'
  return new ProviderError('provider-unhealthy', `agent: ${message}`, { cause: error })
}
