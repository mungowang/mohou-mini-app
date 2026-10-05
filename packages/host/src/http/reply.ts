import type { Context } from 'hono'

import type { AppPin } from '../theme/pin.ts'

export async function ok(c: Context, work: () => Promise<unknown>): Promise<Response> {
  try {
    return c.json({ ok: true, result: await work() })
  } catch (error) {
    return c.json({ ok: false, error: errorBody(error) }, 400)
  }
}

/** The one refusal for a route that requires the authoring token. */
export function authoringDenied(c: Context): Response {
  return c.json({ ok: false, error: { code: 'authoring-token', message: 'authoring token is missing or wrong' } }, 401)
}

export function errorBody(error: unknown): { code: string; message: string } {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'failed'
  const message = error instanceof Error ? error.message : 'request failed'
  return { code, message }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergePolicy(current: unknown, body: Record<string, unknown>): Record<string, unknown> {
  const base = isRecord(current) ? current : {}
  const runtimeRoot = typeof base.runtimeRoot === 'string' ? base.runtimeRoot : undefined
  const { updateRegistry: rawRegistry, ...rest } = body
  const updateRegistry = typeof rawRegistry === 'string' ? rawRegistry.trim() : undefined
  const provider = isRecord(body.runtimeProvider) ? body.runtimeProvider : undefined
  const previous = isRecord(base.runtimeProvider) ? base.runtimeProvider : undefined
  return {
    ...base,
    ...rest,
    // An empty string means "the packaged default". A non-string never clobbers the stored value.
    ...updateRegistry === undefined ? {} : { updateRegistry },
    ...runtimeRoot === undefined ? {} : { runtimeRoot },
    ...provider === undefined || previous === undefined ? {} : {
      runtimeProvider: {
        ...previous,
        ...provider,
        ...provider.config === undefined && previous.config !== undefined ? { config: previous.config } : {},
      },
    },
  }
}

export function isPin(value: unknown): value is AppPin {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'default' || value.kind === 'follow-host' || value.kind === 'app-file') return true
  return value.kind === 'palette' && typeof value.id === 'string' && value.id.length > 0
}
