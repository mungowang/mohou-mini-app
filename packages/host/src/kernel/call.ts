import type {
  AppAgentEvent,
  AppApiMethod,
  AppConfig,
  AppContext,
  AppCredentials,
  AppHttpRequest,
  AppHttpResponse,
  AppId,
  AppLlmEvent,
  AppStorage,
  AppSystemMetrics,
  AppWorkbench,
  HostNotice,
} from '@mohou/contract'

import type { CredentialProvider } from '../credentials/provider.ts'
import type { BoundBrain } from './bind-brain.ts'
import { HostError } from './codes.ts'
import { modelStream } from './model-stream.ts'
import { present } from './present.ts'

/** Ports already constructed outside the kernel. The call loop only binds them. */
export interface CallCapabilities<State extends object = Record<string, never>> {
  readonly appId: AppId
  readonly appDir: string
  readonly state: State
  readonly storage: AppStorage
  readonly credentials: CredentialProvider
  readonly config: AppConfig
  readonly log: (...args: unknown[]) => void
  readonly push: (name: string, params?: unknown) => void
  readonly http: (url: string | AppHttpRequest, opts?: Omit<AppHttpRequest, 'url'>) => Promise<AppHttpResponse>
  readonly bash: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  readonly pwsh: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  readonly metrics: () => Promise<AppSystemMetrics>
  readonly mcp: (serverId: string, toolName: string, args?: Record<string, unknown>) => Promise<unknown>
  readonly brain: BoundBrain
  readonly workbench?: AppWorkbench
}

/**
 * Run one app method inside a context built from injected ports.
 * A method that yields, or that returns a model stream, is read here.
 * `publish` receives each yielded value. A plain `call` omits it.
 * The signal aborts when the call settles. An unknown name emits `unknown-method`.
 */
export async function runCall<State extends object>(
  capabilities: CallCapabilities<State>,
  api: Record<string, AppApiMethod<State>>,
  name: string,
  args: unknown,
  publish?: (value: unknown) => Promise<void> | void,
): Promise<unknown> {
  const method = api[name]
  if (method === undefined) {
    throw new HostError('unknown-method', `unknown api method: ${name}`)
  }
  const controller = new AbortController()
  const ctx: AppContext<State> = contextFor(capabilities, controller.signal)
  try {
    return await readMethod(method(ctx, args), publish)
  } finally {
    controller.abort()
  }
}

/** Run `defineApp.onHostEvents` inside a context built from the same ports as a call. */
export async function runNotice<State extends object>(
  capabilities: CallCapabilities<State>,
  hook: (ctx: AppContext<State>, event: HostNotice) => unknown,
  event: HostNotice,
): Promise<void> {
  const controller = new AbortController()
  const ctx = contextFor(capabilities, controller.signal)
  try {
    await hook(ctx, event)
  } finally {
    controller.abort()
  }
}

function credentialsFor(provider: CredentialProvider): AppCredentials {
  return {
    get: name => provider.get(name),
  }
}

function contextFor<State extends object>(capabilities: CallCapabilities<State>, signal: AbortSignal): AppContext<State> {
  return {
    appId: capabilities.appId,
    appDir: capabilities.appDir,
    storage: capabilities.storage,
    state: capabilities.state,
    credentials: credentialsFor(capabilities.credentials),
    config: capabilities.config,
    log: capabilities.log,
    signal,
    push: capabilities.push,
    http: capabilities.http,
    bash: capabilities.bash,
    pwsh: capabilities.pwsh,
    system: { metrics: capabilities.metrics },
    llm: ((prompt, options) => {
      if (options?.stream !== true) {
        return capabilities.brain.llm(prompt, { ...options, signal: options?.signal ?? signal })
      }
      return modelStream((emit: (event: AppLlmEvent) => void) => capabilities.brain.llm(prompt, {
        ...options,
        signal: options.signal ?? signal,
        onEvent: emit,
      }))
    }) as AppContext<State>['llm'],
    agent: ((goal, options) => {
      const forwarded = {
        ...options,
        ...present('signal', options?.signal ?? signal),
      }
      if (options?.stream !== true) return capabilities.brain.agent(goal, forwarded)
      return modelStream((emit: (event: AppAgentEvent) => void) => capabilities.brain.agent(goal, {
        ...forwarded,
        onEvent: emit,
      }))
    }) as AppContext<State>['agent'],
    mcp: capabilities.mcp,
    ...capabilities.workbench === undefined ? {} : { workbench: capabilities.workbench },
  }
}

async function readMethod(output: unknown, publish?: (value: unknown) => Promise<void> | void): Promise<unknown> {
  const value = isThenable(output) && !isAsyncIterable(output) ? await output : output
  if (!isAsyncIterable(value)) return value
  const iterator = value[Symbol.asyncIterator]()
  let step = await iterator.next()
  while (!step.done) {
    await publish?.(step.value)
    step = await iterator.next()
  }
  if (step.value !== undefined) return step.value
  if (isThenable(value)) return value
  return undefined
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}
