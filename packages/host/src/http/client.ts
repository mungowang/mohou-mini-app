import type { AppHttpRequest, AppHttpResponse } from '@mohou/contract'

import { present } from '../kernel/present.ts'
import { HttpError } from './codes.ts'

/** Injected bounds. The numbers are host policy and are not locked here. */
export interface HttpPolicy {
  readonly timeoutMs: {
    readonly min: number
    readonly max: number
    readonly default: number
  }
  readonly maxBodyBytes: number
}

type HttpFn = (url: string | AppHttpRequest, opts?: Omit<AppHttpRequest, 'url'>) => Promise<AppHttpResponse>

/** Identifies our timer so a caller abort is not reported as a timeout. */
class TimeoutReason extends Error {
  readonly code = 'http-timeout'

  /**
   * @param timeoutMs - the deadline that fired
   */
  constructor(timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutReason'
  }
}

/**
 * Build `ctx.http` for one call. 4xx and 5xx stay in the result.
 * Policy failures throw before the socket opens.
 * @param policy - resolved host bounds
 * @param callSignal - this call's signal, aborted with any request signal
 */
export function createHttp(policy: HttpPolicy, callSignal?: AbortSignal): HttpFn {
  return (url, opts) => request(policy, callSignal, url, opts)
}

async function request(
  policy: HttpPolicy,
  callSignal: AbortSignal | undefined,
  url: string | AppHttpRequest,
  opts?: Omit<AppHttpRequest, 'url'>,
): Promise<AppHttpResponse> {
  const input = typeof url === 'string' ? { url, ...opts } : url
  const target = parseUrl(input)
  const timeoutMs = resolveTimeout(policy, input.timeout)
  const body = encodeBody(input.body, input.headers, policy.maxBodyBytes)
  const timer = new AbortController()
  const timerId = setTimeout(() => {
    timer.abort(new TimeoutReason(timeoutMs))
  }, timeoutMs)
  const upstream = [callSignal, input.signal].filter((item): item is AbortSignal => item !== undefined)
  const signal = AbortSignal.any([timer.signal, ...upstream])
  try {
    const response = await fetch(target, {
      signal,
      ...present('method', input.method),
      ...present('headers', body.headers),
      ...present('body', body.payload),
    })
    return await readResponse(response, policy.maxBodyBytes, signal)
  } catch (error) {
    throw classify(error, signal)
  } finally {
    clearTimeout(timerId)
  }
}

function parseUrl(input: AppHttpRequest): URL {
  let target: URL
  try {
    target = new URL(input.url)
  } catch (error) {
    throw new HttpError('http-scheme', 'URL is not http or https', { cause: error })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpError('http-scheme', 'URL is not http or https')
  }
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue
    target.searchParams.append(key, String(value))
  }
  return target
}

function resolveTimeout(policy: HttpPolicy, timeout: number | undefined): number {
  const resolved = timeout ?? policy.timeoutMs.default
  if (resolved < policy.timeoutMs.min || resolved > policy.timeoutMs.max) {
    throw new HttpError('http-policy', 'timeout is outside the host policy')
  }
  return resolved
}

function encodeBody(
  body: unknown,
  headers: Record<string, string> | undefined,
  maxBodyBytes: number,
): { payload?: string; headers?: Record<string, string> } {
  if (body === undefined) return headers === undefined ? {} : { headers }
  if (typeof body === 'function' || typeof body === 'symbol') {
    throw new HttpError('http-policy', 'request body is not admissible')
  }
  let payload: string
  try {
    payload = typeof body === 'string' ? body : JSON.stringify(body)
  } catch (error) {
    throw new HttpError('http-policy', 'request body is not admissible', { cause: error })
  }
  if (Buffer.byteLength(payload) > maxBodyBytes) {
    throw new HttpError('http-too-large', 'request body exceeds the host cap')
  }
  if (typeof body === 'string') return headers === undefined ? { payload } : { payload, headers }
  if (headers !== undefined && hasContentType(headers)) return { payload, headers }
  return { payload, headers: { ...headers, 'content-type': 'application/json' } }
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(key => key.toLowerCase() === 'content-type')
}

async function readResponse(response: Response, maxBodyBytes: number, signal: AbortSignal): Promise<AppHttpResponse> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    await response.body?.cancel()
    throw new HttpError('http-too-large', 'response body exceeds the host cap')
  }
  const text = await readText(response, maxBodyBytes, signal)
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  const type = response.headers.get('content-type') ?? ''
  let json: unknown = null
  if (type.includes('json')) {
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = null
    }
  }
  return { ok: response.ok, status: response.status, headers, text, json }
}

async function readText(response: Response, maxBodyBytes: number, signal: AbortSignal): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBodyBytes) {
        throw new HttpError('http-too-large', 'response body exceeds the host cap')
      }
      chunks.push(value)
    }
  } catch (error) {
    throw classify(error, signal)
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function classify(error: unknown, signal: AbortSignal): HttpError {
  if (error instanceof HttpError) return error
  if (signal.reason instanceof TimeoutReason) {
    return new HttpError('http-timeout', 'request timed out', { cause: error })
  }
  if (signal.aborted) return new HttpError('cancelled', 'request was cancelled', { cause: error })
  return new HttpError('http-network', 'request failed', { cause: error })
}
