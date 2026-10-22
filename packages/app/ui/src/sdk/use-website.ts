import {
  websiteSnapshotEvent,
  type WebsiteHandle,
  type WebsitePhase,
  type WebsiteSnapshot,
} from '@mohou/contract'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { AppIdContext } from './app-id.ts'
import { useApp } from './use-app.ts'

const initialSnapshot: WebsiteSnapshot = {
  phase: 'ensuring',
  generation: 0,
}

/**
 * Website session projection. Only valid for `kind: website` apps.
 * Host owns ensure/dispose; this hook reads the snapshot and asks for refresh/retry.
 */
export function useWebsite(): WebsiteHandle {
  const appId = useContext(AppIdContext)
  const app = useApp()
  const [snapshot, setSnapshot] = useState<WebsiteSnapshot>(initialSnapshot)

  useEffect(() => {
    let cancelled = false
    let tries = 0
    const pull = () => {
      void fetch(`/api/app/${encodeURIComponent(appId)}/website`)
        .then(async (response) => {
          // Host `ok()` answers `{ ok, result }` (not `value`).
          const body = await response.json() as { ok?: boolean; result?: unknown; value?: unknown }
          if (cancelled || body.ok !== true) return
          const next = asSnapshot(body.result ?? body.value)
          if (next !== undefined) {
            setSnapshot(next)
            return
          }
          // Open can still be ensuring; retry a few times so we do not stick on the initial phase.
          if (tries < 20) {
            tries += 1
            window.setTimeout(pull, 150)
          }
        })
        .catch(() => undefined)
    }
    pull()
    const stop = app.on(websiteSnapshotEvent, (data) => {
      const next = asSnapshot(data)
      if (next !== undefined) setSnapshot(next)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [app, appId])

  const refresh = useCallback(async () => {
    await postWebsite(appId, 'refresh')
  }, [appId])

  const retry = useCallback(async () => {
    await postWebsite(appId, 'retry')
  }, [appId])

  const reportContent = useCallback(async (
    event: 'load' | 'load-failed' | 'document-idle',
    info?: { readonly reason?: string },
  ) => {
    await fetch(`/api/app/${encodeURIComponent(appId)}/website/content`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event,
        ...info?.reason === undefined ? {} : { reason: info.reason },
      }),
    }).then(async (response) => {
      const body = await response.json() as { ok?: boolean; error?: string }
      if (body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : 'website content failed')
    })
  }, [appId])

  return useMemo(() => ({
    ...snapshot,
    refresh,
    retry,
    reportContent,
  }), [snapshot, refresh, retry, reportContent])
}

async function postWebsite(appId: string, action: 'refresh' | 'retry'): Promise<void> {
  const response = await fetch(`/api/app/${encodeURIComponent(appId)}/website/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const body = await response.json() as { ok?: boolean; error?: string }
  if (body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : `website ${action} failed`)
}

function asSnapshot(value: unknown): WebsiteSnapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isPhase(record.phase) || typeof record.generation !== 'number') return undefined
  return {
    phase: record.phase,
    generation: record.generation,
    ...typeof record.url === 'string' ? { url: record.url } : {},
    ...isError(record.error)
      ? {
          error: {
            code: record.error.code,
            message: record.error.message,
            ...record.error.detail === undefined || record.error.detail.length === 0
              ? {}
              : { detail: record.error.detail },
          },
        }
      : {},
  }
}

function isPhase(value: unknown): value is WebsitePhase {
  return value === 'ensuring'
    || value === 'ready'
    || value === 'refreshing'
    || value === 'failing'
    || value === 'disposing'
}

function isError(value: unknown): value is { code: string; message: string; detail?: string } {
  if (typeof value !== 'object' || value === null) return false
  const row = value as { code?: unknown; message?: unknown; detail?: unknown }
  if (typeof row.code !== 'string' || typeof row.message !== 'string') return false
  if (row.detail !== undefined && typeof row.detail !== 'string') return false
  return true
}
