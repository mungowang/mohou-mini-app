import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { appEntries, ContractError, type AppApiMethod, type AppContext, type HostNotice } from '@mohou/contract'
import * as esbuild from 'esbuild'

import { CompileError } from './codes.ts'
import { buildFailureText } from './failure.ts'
import { importDecision, sideOf } from './imports.ts'

const require = createRequire(import.meta.url)

export interface LoadedBackend {
  api: Record<string, AppApiMethod>
  onHostEvents?: (ctx: AppContext, event: HostNotice) => unknown
}

/**
 * Transpile and load `main.api.ts`. `defineApp` is the real contract export.
 * Installed libraries resolve only from this app's `node_modules`.
 * @param appDir - absolute app directory
 * @param logLevel - `silent` when the caller already expects the build to fail. Omitted, esbuild prints the failure.
 */
export async function loadBackend(appDir: string, logLevel?: 'silent'): Promise<LoadedBackend> {
  const stopped: { code: string; message: string } = { code: '', message: '' }
  let result: esbuild.BuildResult
  try {
    result = await esbuild.build({
      absWorkingDir: appDir,
      entryPoints: [path.join(appDir, appEntries.backend)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
      ...logLevel === undefined ? {} : { logLevel },
      plugins: [allowlistPlugin(appDir, stopped)],
    })
  } catch (error) {
    const code = stopped.code
    if (code === 'import-forbidden' || code === 'import-escape') {
      throw new ContractError(code, stopped.message, { cause: error })
    }
    const message = stopped.message || buildFailureText(error) || 'backend failed to load'
    throw new CompileError('backend-invalid', message, { cause: error })
  }
  const output = result.outputFiles?.[0]?.text
  if (output === undefined) throw new CompileError('backend-invalid', 'backend produced no module')
  const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
  const app = isRecord(loaded) ? loaded.default : undefined
  if (!isRecord(app) || !isRecord(app.api)) {
    throw new CompileError('backend-invalid', 'backend must default-export defineApp(...)')
  }
  const api = app.api as Record<string, AppApiMethod>
  const onHostEvents = app.onHostEvents
  if (!isHostHook(onHostEvents)) return { api }
  return { api, onHostEvents }
}

function allowlistPlugin(appDir: string, stopped: { code: string; message: string }): esbuild.Plugin {
  return {
    name: 'mini-app-allowlist',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point' || args.importer.length === 0) return undefined
        const rel = insideApp(appDir, args.importer)
        if (rel === undefined) return undefined
        const decision = importDecision(sideOf(rel), args.path, rel)
        if (decision === 'builtin') return { path: args.path, external: true }
        if (decision === 'allow') {
          if (args.path.startsWith('.')) return undefined
          return { path: require.resolve(args.path) }
        }
        if (decision === 'install') {
          const local = path.join(appDir, 'node_modules', args.path)
          if (existsSync(local)) return { path: local }
          stopped.code = 'backend-invalid'
          stopped.message = `install ${args.path} with mini_app_install`
          return { errors: [{ text: stopped.message }] }
        }
        stopped.code = decision.code
        stopped.message = decision.message
        return { errors: [{ text: decision.message }] }
      })
    },
  }
}

function insideApp(appDir: string, importer: string): string | undefined {
  const root = realpathSync(appDir)
  const file = realpathSync(path.isAbsolute(importer) ? importer : path.resolve(appDir, importer))
  const rel = path.relative(root, file)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  return rel.split(path.sep).join('/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHostHook(value: unknown): value is NonNullable<LoadedBackend['onHostEvents']> {
  return typeof value === 'function'
}
