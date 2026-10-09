import { ProviderError } from './codes.ts'
import type { RuntimeAgentOptions, RuntimeLlmOptions, RuntimeProvider } from './provider.ts'

/**
 * The always-registered brain. `llm` returns the prompt. `agent` returns the goal.
 * The tool set stays empty. A model name does not change it.
 */
export function createEchoProvider(): RuntimeProvider {
  let running = false
  return {
    id: 'echo',
    label: 'Echo',
    configure() {},
    start() {
      running = true
      return Promise.resolve()
    },
    stop() {
      running = false
      return Promise.resolve()
    },
    healthy() {
      return running
    },
    describe() {
      return [{ name: 'model', kind: 'string' }]
    },
    llm(prompt, options) {
      const failed = rejection(running, options?.signal)
      if (failed) return failed
      if (prompt.length === 0) {
        return Promise.reject(new ProviderError('empty-completion', 'llm returned an empty completion'))
      }
      if (hasImages(options?.images)) {
        return Promise.reject(new ProviderError('image-unsupported', 'echo cannot accept images'))
      }
      if (options?.stream === true) {
        observeLlm(options, { type: 'status', status: 'running' })
        observeLlm(options, { type: 'text-delta', text: prompt })
        observeLlm(options, { type: 'done', text: prompt })
      }
      return Promise.resolve(prompt)
    },
    agent(goal, options) {
      const failed = rejection(running, options?.signal)
      if (failed) return failed
      if (goal.length === 0) {
        return Promise.reject(new ProviderError('empty-completion', 'agent returned an empty completion'))
      }
      if (hasImages(options?.images)) {
        return Promise.reject(new ProviderError('image-unsupported', 'echo cannot accept images'))
      }
      observe(options, { type: 'status', status: 'running' })
      observe(options, { type: 'done', text: goal })
      return Promise.resolve(goal)
    },
  }
}

function hasImages(images: readonly unknown[] | undefined): boolean {
  return images !== undefined && images.length > 0
}

function rejection(running: boolean, signal: AbortSignal | undefined): Promise<never> | undefined {
  if (signal?.aborted) return Promise.reject(new ProviderError('cancelled', 'cancelled'))
  if (!running) return Promise.reject(new ProviderError('provider-unhealthy', 'runtime provider is not started'))
  return undefined
}

function observeLlm(options: RuntimeLlmOptions, event: Parameters<NonNullable<RuntimeLlmOptions['onEvent']>>[0]): void {
  try {
    options.onEvent?.(event)
  } catch {
    // A throwing observer does not abort the completion.
  }
}

function observe(options: RuntimeAgentOptions | undefined, event: Parameters<NonNullable<RuntimeAgentOptions['onEvent']>>[0]): void {
  try {
    options?.onEvent?.(event)
  } catch {
    // A throwing observer does not abort the run.
  }
}
