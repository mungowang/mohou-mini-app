import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { ProviderError, type RuntimeAgentOptions, type RuntimeProviderConfig } from '@mohou/runtime-provider'

import { openPiServices } from './services.ts'

/**
 * One Pi coding-agent run. The session is in memory. The conversation is not written.
 * The services load Pi's agent directory and the user's extensions, so a model an extension
 * registered is one this run can select. No tool allowlist is passed.
 * @param config - configured provider and model. Both absent leaves Pi's own default.
 * @param goal - the user turn
 * @param call - cwd, system text, model override, abort, and the observer
 * @returns the last assistant text
 * @throws ProviderError `unknown-model` when the provider/model pair is missing or unknown.
 * `empty-completion` when the run ends with no text. `cancelled` when the signal aborts.
 * `provider-unhealthy` when the session fails.
 */
export async function runPiAgent(
  config: RuntimeProviderConfig,
  goal: string,
  call: RuntimeAgentOptions | undefined,
): Promise<string> {
  const { createAgentSessionFromServices, SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = call?.cwd ?? process.cwd()
  observe(call, { type: 'status', status: 'running' })
  const services = await openPiServices(
    cwd,
    call?.system === undefined ? undefined : { appendSystemPrompt: [call.system] },
  ).catch(unhealthy)
  const model = selectedModel(services.modelRuntime, config, call) ?? piDefaultModel(services.modelRuntime, services.settingsManager)
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager: SessionManager.inMemory(cwd),
    ...model === undefined ? {} : { model },
  }).catch(unhealthy)
  let turn = 0
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'turn_start') {
      turn += 1
      observe(call, { type: 'turn', phase: 'start', turn })
      return
    }
    if (event.type === 'turn_end') {
      observe(call, {
        type: 'turn',
        phase: 'end',
        turn,
        reason: { kind: call?.signal?.aborted ? 'aborted' : 'completed' },
      })
      return
    }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      observe(call, { type: 'text-delta', text: event.assistantMessageEvent.delta })
      return
    }
    if (event.type === 'tool_execution_start') {
      observe(call, { type: 'tool', phase: 'start', name: event.toolName, args: event.args })
      return
    }
    if (event.type === 'tool_execution_end') {
      observe(call, { type: 'tool', phase: 'end', name: event.toolName, result: event.result })
    }
  })
  const abort = (): void => {
    void session.abort().catch(() => {
      // Abort is reported through the signal, not this rejection.
    })
  }
  call?.signal?.addEventListener('abort', abort, { once: true })
  try {
    await session.prompt(goal)
    if (call?.signal?.aborted) throw new ProviderError('cancelled', 'cancelled')
    const text = assistantText(session.messages)
    if (text.length === 0) throw new ProviderError('empty-completion', 'agent returned an empty completion')
    observe(call, { type: 'done', text })
    return text
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (call?.signal?.aborted) throw new ProviderError('cancelled', 'cancelled', { cause: error })
    throw new ProviderError('provider-unhealthy', 'pi agent failed', { cause: error })
  } finally {
    call?.signal?.removeEventListener('abort', abort)
    unsubscribe()
    session.dispose()
  }
}

function unhealthy(error: unknown): never {
  throw new ProviderError('provider-unhealthy', 'pi agent failed', { cause: error })
}

export function selectedModel(
  runtime: Pick<ModelRuntime, 'getModel'>,
  config: RuntimeProviderConfig,
  call: { readonly provider?: string; readonly model?: string } | undefined,
): ReturnType<ModelRuntime['getModel']> {
  const provider = call?.provider ?? config.provider
  const model = call?.model ?? config.model
  if (provider === undefined && model === undefined) return undefined
  if (provider === undefined || model === undefined) {
    throw new ProviderError('unknown-model', 'pi model selection is incomplete')
  }
  const found = runtime.getModel(provider, model)
  if (found === undefined) throw new ProviderError('unknown-model', `unknown model: ${provider}/${model}`)
  return found
}

export function piDefaultModel(
  runtime: Pick<ModelRuntime, 'getModel'>,
  settings: { getDefaultProvider(): string | undefined; getDefaultModel(): string | undefined },
): ReturnType<ModelRuntime['getModel']> {
  const provider = settings.getDefaultProvider()
  const model = settings.getDefaultModel()
  if (provider === undefined || model === undefined) return undefined
  const found = runtime.getModel(provider, model)
  if (found === undefined) throw new ProviderError('unknown-model', `unknown model: ${provider}/${model}`)
  return found
}

function assistantText(messages: readonly { readonly role: string; readonly content?: unknown }[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'assistant' || !Array.isArray(message.content)) continue
    const text = message.content.flatMap((part) => {
      if (typeof part !== 'object' || part === null) return []
      const record = part as { type?: unknown; text?: unknown }
      return record.type === 'text' && typeof record.text === 'string' ? [record.text] : []
    }).join('').trim()
    if (text.length > 0) return text
  }
  return ''
}

function observe(options: RuntimeAgentOptions | undefined, event: Parameters<NonNullable<RuntimeAgentOptions['onEvent']>>[0]): void {
  try {
    options?.onEvent?.(event)
  } catch {
    // A throwing observer does not abort the run.
  }
}
