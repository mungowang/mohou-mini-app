/**
 * shared/ — pure. Both sides import this file, and only this file, for the names they agree on.
 * No ctx, no React, no DOM, no Node here.
 */

/** One persisted run. The table mirrors this shape; `steps`/`meta` are JSON text on the wire. */
export type RunRecord = {
  id: number
  kind: RunKind
  title: string
  /** server id for `mcp`, provider for `llm`/`agent` — one nullable column, three readings. */
  source: string | null
  provider: string | null
  model: string | null
  status: RunStatus
  /** the run's text: prompt, goal, or tool args. */
  input: string
  /** streamed output, or an MCP result pretty-printed. */
  output: string
  error: string | null
  steps: RunStep[]
  meta: Record<string, unknown>
  startedAt: number
  endedAt: number | null
  durationMs: number | null
}

export type RunKind = 'llm' | 'agent' | 'mcp'
export type RunStatus = 'running' | 'done' | 'error' | 'cancelled'
export type StepPhase = 'turn' | 'tool' | 'done' | 'error' | 'result'

/**
 * One tracked step of an agent run. `detail` keeps the step's own payload verbatim (tool
 * arguments, the step's result) so the timeline can expand without a second round trip.
 */
export type RunStep = {
  phase: StepPhase
  name?: string
  turn?: number
  text?: string
  detail?: string
  at: number
}

/**
 * A step with only the fields it has. `exactOptionalPropertyTypes` refuses an optional field set
 * to `undefined`, and an event's fields are not always there, so the omission happens here once.
 */
export function step(fields: {
  phase: StepPhase
  name?: string | undefined
  turn?: number | undefined
  text?: string | undefined
  detail?: string | undefined
  at: number
}): RunStep {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as unknown as RunStep
}

/** Declared once: `ctx.push(EV.records, …)` on the backend, `on(EV.records, …)` in the view. */
export const EV = {
  records: 'records',
  agentEvent: 'agent-event',
} as const

/**
 * What the view needs off an agent event to draw a step. `ctx.agent` owns the real union; this is
 * the subset that crosses the push channel, kept open so a provider adding a field cannot break it.
 */
export type AgentStepEvent = {
  type: 'turn' | 'tool' | 'error' | 'done'
  phase?: string
  name?: string
  turn?: number
  text?: string
  message?: string
  args?: unknown
  result?: unknown
}

export type Events = {
  records: { reason: 'insert' | 'update' }
  agentEvent: AgentStepEvent
}

export type EventName = keyof Events

/** Snapshot the view paints first, then keeps current from `EV.records` pings. */
export type LabSnapshot = {
  runs: RunRecord[]
  counts: Record<RunKind, number>
  runtime: { provider: string | null; model: string | null }
  activeRunId: number | null
}

export const EMPTY_COUNTS: Record<RunKind, number> = { llm: 0, agent: 0, mcp: 0 }

export const KIND_LABEL: Record<RunKind, string> = {
  llm: 'LLM 补全',
  agent: 'Agent 执行',
  mcp: 'MCP 调用',
}
