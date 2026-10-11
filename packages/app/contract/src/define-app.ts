import type { AppContext } from './context.ts'
import { ContractError } from './codes.ts'
import type { HostNotice } from './host-notice.ts'

/** One backend method as the host calls it. `args` is the unchecked JSON. */
export type AppApiMethod<State extends object = Record<string, never>> = (
  ctx: AppContext<State>,
  args: unknown,
) => unknown

/**
 * Bound for a method `defineApp` accepts.
 * A named `args` object is inferred from the method the author wrote.
 * An unnamed parameter stays `any`: the host may pass any object.
 * `defineApp` returns the inferred method, not this bound.
 */
type DeclaredMethod<State extends object> = (
  ctx: AppContext<State>,
  // oxlint-disable-next-line typescript/no-explicit-any -- unnamed args accept the unchecked object; a named object is inferred
  args?: any,
) => unknown

/** What `defineApp` accepts. `api` keeps the methods the author wrote. */
export interface AppDefinition<State extends object = Record<string, never>> {
  name: string
  description: string
  api: Record<string, DeclaredMethod<State>>
  state?: State
  /**
   * Called on this loaded instance when a host notice is published.
   * Not an `api` method. The view does not receive the notice on `useApp().on`.
   */
  onHostEvents?: (ctx: AppContext<State>, event: HostNotice) => unknown
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate and return the same definition object.
 * `State` is inferred from `state`. An omitted `state` has no keys.
 * @param def - author declaration
 */
export function defineApp<State extends object, Definition extends AppDefinition<State>>(
  def: Definition & AppDefinition<State>,
): Definition {
  if (!def.name || !def.description) {
    throw new ContractError('define-app-invalid', 'defineApp requires name and description')
  }
  if (!isObject(def.api)) {
    throw new ContractError('define-app-invalid', 'defineApp.api must be an object')
  }
  if (def.state !== undefined && !isObject(def.state)) {
    throw new ContractError('define-app-invalid', 'defineApp.state must be an object')
  }
  if (def.onHostEvents !== undefined && typeof def.onHostEvents !== 'function') {
    throw new ContractError('define-app-invalid', 'defineApp.onHostEvents must be a function')
  }
  return def
}
