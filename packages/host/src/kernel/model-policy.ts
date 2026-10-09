import { ProviderError } from '@mohou/runtime-provider'

import { HostError } from './codes.ts'

/** Token and retry bounds. Host policy, not a locked product value. */
export interface ModelPolicy {
  maxTokens: number
  maxTokensLimit: number
  retryTimes: number
  retryTimesLimit: number
  maxIterations: number
  maxIterationsLimit: number
  maxImages: number
  maxImageBytes: number
}

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  maxTokens: 2_048,
  maxTokensLimit: 8_192,
  retryTimes: 1,
  retryTimesLimit: 3,
  maxIterations: 100,
  maxIterationsLimit: 100,
  maxImages: 4,
  maxImageBytes: 4 * 1024 * 1024,
}

/** Strip one markdown fence when `schema` asked for JSON. The caller still parses the string. */
export function stripSchemaFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim())
  return match?.[1] ?? text
}

export function admitModelBudget(options: {
  maxTokens?: number
  retryTimes?: number
  maxIterations?: number
} | undefined, policy: ModelPolicy): {
  maxTokens: number
  retryTimes: number
  maxIterations: number
} {
  return {
    maxTokens: admitNumber(options?.maxTokens, policy.maxTokens, policy.maxTokensLimit, 'maxTokens'),
    retryTimes: admitNumber(options?.retryTimes, policy.retryTimes, policy.retryTimesLimit, 'retryTimes'),
    maxIterations: admitNumber(options?.maxIterations, policy.maxIterations, policy.maxIterationsLimit, 'maxIterations'),
  }
}

/**
 * Run a model call up to `times`, counting the first attempt.
 * Cancel is not retried. A model that cannot accept images is not retried. An empty string is a failed attempt.
 */
export async function callWithRetry(
  times: number,
  signal: AbortSignal | undefined,
  run: () => Promise<string>,
): Promise<string> {
  let last: unknown
  for (let attempt = 0; attempt < times; attempt += 1) {
    if (signal?.aborted) throw new ProviderError('cancelled', 'model call was cancelled')
    try {
      const text = await run()
      if (text.length === 0) throw new ProviderError('empty-completion', 'model call returned an empty completion')
      return text
    } catch (error) {
      if (isCancelled(error, signal)) {
        throw error instanceof ProviderError ? error : new ProviderError('cancelled', 'model call was cancelled', { cause: error })
      }
      if (isImageUnsupported(error)) throw error
      last = error
    }
  }
  throw new ProviderError('retry-exhausted', 'model call retries exhausted', { cause: last })
}

function admitNumber(value: number | undefined, fallback: number, limit: number, field: string): number {
  const chosen = value ?? fallback
  if (!Number.isInteger(chosen) || chosen < 1 || chosen > limit) {
    throw new HostError('model-policy', `${field} is outside the host policy`)
  }
  return chosen
}

function isCancelled(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true
  return codeOf(error) === 'cancelled'
}

function isImageUnsupported(error: unknown): boolean {
  return codeOf(error) === 'image-unsupported'
}

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
}
