import {
  defineApp,
  eventType,
  type AppAgentEvent as AgentEvent,
  type AppAgentOptions,
  type AppLlmOptions,
  type SqlValue,
} from '@mohou/contract'

import {
  EMPTY_COUNTS,
  EV,
  step,
  type LabSnapshot,
  type RunKind,
  type RunRecord,
  type RunStep,
} from './shared/events'

// ⭐ key: module scope survives between calls (the app module loads once), so this var is how a
//         Cancel button reaches the stream that is currently running. One lab, one live run.
let active: { ac: AbortController; id: number | null; kind: RunKind } | null = null

const DEFAULT_LIMIT = 40
const SNIPPET = 4000

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Read one field off a model event without redeclaring its union (`@mohou/contract` owns it). */
function field(event: unknown, key: string): unknown {
  return isRec(event) ? event[key] : undefined
}

/**
 * ⭐ key: `AppAgentEvent` is a discriminated union, so narrow with a cast rather than reading
 * fields off a bag — `tool` carries `args` on `start` and `result` on `end`, `turn` carries the
 * number on `start` only. That shape IS the execution-step tracking this app exists to show.
 */
function modelEvent(event: unknown): AgentEvent {
  return event as AgentEvent
}

/** ⭐ key: model events are not JSON. Keep the step's own payload verbatim for the detail panel. */
function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '[unserializable]'
  }
}

function fail(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  return raw.replace(/^Error:\s*/, '')
}

/** `code` survives where the message is for a person. `empty-completion` is the empty one. */
function codeOf(cause: unknown): string {
  if (isRec(cause) && typeof cause.code === 'string') return cause.code
  return fail(cause)
}

// ---------------------------------------------------------------- storage

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toRecord(row: Rec): RunRecord {
  const endedAt = row.ended_at == null ? null : num(row.ended_at)
  return {
    id: num(row.id),
    kind: str(row.kind) as RunKind,
    title: str(row.title),
    source: row.source == null ? null : str(row.source),
    provider: row.provider == null ? null : str(row.provider),
    model: row.model == null ? null : str(row.model),
    status: str(row.status) as RunRecord['status'],
    input: str(row.input),
    output: str(row.output),
    error: row.error == null ? null : str(row.error),
    steps: parseJson<RunStep[]>(row.steps, []),
    meta: parseJson<Rec>(row.meta, {}),
    startedAt: num(row.started_at),
    endedAt,
    durationMs: row.duration_ms == null ? null : num(row.duration_ms),
  }
}

const SELECT = `SELECT id, kind, title, source, provider, model, status, input, output, error,
  steps, meta, started_at, ended_at, duration_ms FROM runs`

async function insert(
  ctx,
  seed: {
    kind: RunKind
    title: string
    input: string
    source?: string | null
    provider?: string | null
    model?: string | null
    meta?: Rec
  },
): Promise<number> {
  const res = await ctx.storage.run(
    `INSERT INTO runs (kind, title, input, source, provider, model, status, started_at, meta)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
    [
      seed.kind,
      seed.title,
      seed.input,
      seed.source ?? null,
      seed.provider ?? null,
      seed.model ?? null,
      Date.now(),
      JSON.stringify(seed.meta ?? {}),
    ],
  )
  const id = Number(res.lastInsertRowid)
  ctx.push(EV.records, { reason: 'insert' })
  return id
}

type Finish = {
  status: RunRecord['status']
  output?: string
  error?: string | null
  steps?: RunStep[]
  meta?: Rec
}

/** Close a run. `started_at` is read back so a cancel or an error keeps the real duration. */
async function finish(ctx, id: number, done: Finish): Promise<void> {
  const rows = (await ctx.storage.query('SELECT started_at FROM runs WHERE id = ?', [id])) as Rec[]
  const first = rows[0]
  const startedAt = first === undefined ? Date.now() : num(first.started_at)
  const endedAt = Date.now()
  await ctx.storage.run(
    `UPDATE runs SET status = ?, output = ?, error = ?, steps = ?, meta = ?, ended_at = ?, duration_ms = ?
     WHERE id = ?`,
    [
      done.status,
      (done.output ?? '').slice(-SNIPPET * 4),
      done.error ?? null,
      JSON.stringify(done.steps ?? []),
      JSON.stringify(done.meta ?? {}),
      endedAt,
      endedAt - startedAt,
      id,
    ],
  )
  // No await needed downstream: the view refetches the snapshot on this ping.
  ctx.push(EV.records, { reason: 'update' })
}

async function counts(ctx): Promise<Record<RunKind, number>> {
  const rows = (await ctx.storage.query(
    'SELECT kind, COUNT(*) AS n FROM runs WHERE status != \'running\' GROUP BY kind',
  )) as Rec[]
  const out: Record<RunKind, number> = { ...EMPTY_COUNTS }
  for (const row of rows) {
    const kind = str(row.kind) as RunKind
    if (kind in out) out[kind] = num(row.n)
  }
  return out
}

function runtimeOf(ctx): { provider: string | null; model: string | null } {
  const llm = isRec(ctx.config) && isRec(ctx.config.llm) ? ctx.config.llm : null
  return {
    provider: llm && typeof llm.provider === 'string' ? llm.provider : null,
    model: llm && typeof llm.model === 'string' ? llm.model : null,
  }
}

/** Tie a run's own controller to the host's: the panel's Stop reaches the same abort. */
function link(ctx, ac: AbortController): void {
  const host = ctx.signal
  if (!host) return
  const relay = (): void =>{  ac.abort() }
  if (host.aborted) {
    ac.abort()
    return
  }
  if (typeof host.addEventListener === 'function') host.addEventListener('abort', relay, { once: true })
}

function begin(kind: RunKind, ac: AbortController, id: number | null): void {
  active?.ac.abort()
  active = { ac, id, kind }
}

function endRun(id: number): void {
  if (active?.id === id) active = null
}

// ---------------------------------------------------------------- api

export default defineApp({
  name: '模型实验台',
  description: 'LLM / Agent / MCP 三台实验，流式输出、执行步骤跟踪、运行记录',
  api: {
    /** First paint. The view calls this once, then applies `EV.records` events — it does not poll. */
    async snapshot(ctx): Promise<LabSnapshot> {
      const rows = (await ctx.storage.query(
        `${SELECT} ORDER BY started_at DESC, id DESC LIMIT ${DEFAULT_LIMIT}`,
      )) as Rec[]
      return {
        runs: rows.map(toRecord),
        counts: await counts(ctx),
        runtime: runtimeOf(ctx),
        activeRunId: active?.id ?? null,
      }
    },

    /** The history rail's filter. Rows you filter are rows, so they are queried, not held in kv. */
    async listRuns(ctx, args?: { kind?: string; search?: string; limit?: number }): Promise<RunRecord[]> {
      const limit = Math.min(Math.max(num(args?.limit) || DEFAULT_LIMIT, 1), 200)
      const where: string[] = []
      const params: SqlValue[] = []
      if (args?.kind && args.kind !== 'all') {
        where.push('kind = ?')
        params.push(args.kind)
      }
      const search = (args?.search ?? '').trim()
      if (search) {
        where.push('(title LIKE ? OR input LIKE ? OR output LIKE ? OR COALESCE(error, \'\') LIKE ?)')
        const like = `%${search}%`
        params.push(like, like, like, like)
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const rows = (await ctx.storage.query(
        `${SELECT}${clause} ORDER BY started_at DESC, id DESC LIMIT ?`,
        [...params, limit],
      )) as Rec[]
      return rows.map(toRecord)
    },

    async getRun(ctx, args: { id: number }): Promise<RunRecord | null> {
      const rows = (await ctx.storage.query(`${SELECT} WHERE id = ?`, [args.id])) as Rec[]
      const first = rows[0]
      return first === undefined ? null : toRecord(first)
    },

    async clearHistory(ctx): Promise<{ ok: true; removed: number }> {
      const res = await ctx.storage.run('DELETE FROM runs WHERE status != \'running\'', [])
      ctx.push(EV.records, { reason: 'update' })
      return { ok: true, removed: res.changes }
    },

    /**
     * ⭐ key: streaming LLM. `yield` is what the view's streamCall receives — text as it arrives.
     * `return` is the value `await streamCall(...)` resolves to. The stream never reaches the UI
     * on its own, so persistence happens here, around the loop, not in the view.
     */
    async *chat(
      ctx,
      args?: {
        prompt?: string
        system?: string
        provider?: string
        model?: string
        maxTokens?: number
        retryTimes?: number
      },
    ) {
      const prompt = (args?.prompt ?? '').trim()
      if (!prompt) throw new Error('请输入 prompt')
      const ac = new AbortController()
      link(ctx, ac)
      const startedAt = Date.now()
      const runtime = runtimeOf(ctx)
      const provider = args?.provider?.trim() || runtime.provider || undefined
      const model = args?.model?.trim() || runtime.model || undefined
      const system = (args?.system ?? '').trim()

      // The lab is a single-prompt probe by design: one textarea, one turn, live tokens.
      const wire = system ? `[system]\n${system}\n\n[user]\n${prompt}` : prompt

      const id = await insert(ctx, {
        kind: 'llm',
        title: prompt.slice(0, 80),
        input: prompt,
        source: provider ?? null,
        provider: provider ?? null,
        model: model ?? null,
        meta: { system, maxTokens: args?.maxTokens ?? null, retryTimes: args?.retryTimes ?? null },
      })
      begin('llm', ac, id)

      const opts: Omit<AppLlmOptions, 'stream'> = { signal: ac.signal }
      if (provider) opts.provider = provider
      if (model) opts.model = model
      if (system) opts.system = system
      if (args?.maxTokens) opts.maxTokens = args.maxTokens
      if (args?.retryTimes != null && args.retryTimes >= 0) opts.retryTimes = args.retryTimes

      let body = ''
      let chunks = 0
      let firstTokenMs: number | null = null
      try {
        for await (const event of ctx.llm(wire, { ...opts, stream: true })) {
          if (str(field(event, 'type')) !== eventType.textDelta) continue
          const text = str(field(event, 'text'))
          if (!text) continue
          if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt
          chunks += 1
          body += text
          yield text
        }
      } catch (cause) {
        const message = fail(cause)
        const status = codeOf(cause) === 'cancelled' ? 'cancelled' : 'error'
        await finish(ctx, id, { status, output: body, error: status === 'error' ? message : null })
        endRun(id)
        throw cause
      }
      const endedAt = Date.now()
      await finish(ctx, id, {
        status: 'done',
        output: body,
        meta: {
          system,
          chunks,
          chars: body.length,
          firstTokenMs,
          maxTokens: args?.maxTokens ?? null,
          retryTimes: args?.retryTimes ?? null,
        },
      })
      endRun(id)
      return {
        id,
        provider: provider ?? null,
        model: model ?? null,
        chars: body.length,
        chunks,
        firstTokenMs,
        durationMs: endedAt - startedAt,
      }
    },

    /**
     * ⭐ key: the agent is isolated — do not rebuild it from a loop of ctx.llm. It emits `turn` and
     * `tool` events; those ARE the execution steps. Step detail is captured as they arrive and
     * persisted at the end, so a finished run is fully inspectable.
     */
    async *runAgent(
      ctx,
      args?: {
        goal?: string
        system?: string
        provider?: string
        model?: string
        maxIterations?: number
        cwdType?: string
      },
    ) {
      const goal = (args?.goal ?? '').trim()
      if (!goal) throw new Error('请输入目标')
      const ac = new AbortController()
      link(ctx, ac)
      const startedAt = Date.now()
      const runtime = runtimeOf(ctx)
      const provider = args?.provider?.trim() || runtime.provider || undefined
      const model = args?.model?.trim() || runtime.model || undefined
      const system = (args?.system ?? '').trim()
      const maxIterations = Math.min(Math.max(num(args?.maxIterations) || 12, 1), 40)
      const asked = str(args?.cwdType)
      const cwdType: NonNullable<AppAgentOptions['cwdType']> =
        asked === 'app' || asked === 'temp' || asked === 'custom' ? asked : 'process'

      const id = await insert(ctx, {
        kind: 'agent',
        title: goal.slice(0, 80),
        input: goal,
        source: provider ?? null,
        provider: provider ?? null,
        model: model ?? null,
        meta: { system, maxIterations, cwdType },
      })
      begin('agent', ac, id)

      const opts: Omit<AppAgentOptions, 'stream'> = {
        signal: ac.signal,
        maxIterations,
        cwdType,
      }
      if (provider) opts.provider = provider
      if (model) opts.model = model
      if (system) opts.system = system

      const steps: RunStep[] = []
      // Name → index of the step still waiting for its `end` event.
      const openTool = new Map<string, number>()
      let body = ''
      let tools = 0
      let turns = 0

      try {
        for await (const event of ctx.agent(goal, { ...opts, stream: true })) {
          const type = str(field(event, 'type'))
          const at = Date.now()

          // ⭐ key: TWO channels, on purpose. The yielded stream reaches the view, but only its
          //    text deltas survive the trip — `turn` and `tool` are dropped on the way, which
          //    silently empties the step panel. So step facts go over `ctx.push` (proven to
          //    deliver every type) and only the answer text goes through `yield`. Each channel
          //    carries one thing, so nothing is rendered twice.
          if (isRec(event) && type !== eventType.textDelta) ctx.push(EV.agentEvent, event)

          if (type === eventType.textDelta) {
            const text = str(field(event, 'text'))
            if (text) {
              body += text
              yield event
            }
            continue
          }

          if (type === eventType.tool) {
            // ⭐ key: `args` arrives on `start`, `result` on `end`. Pair them by name so a step
            // shows both its input and its output — that is the detail panel's whole payload.
            const tool = modelEvent(event) as Extract<AgentEvent, { type: 'tool' }>
            const name = tool.name || 'tool'
            const pendingAt = openTool.get(name)

            if (tool.phase === 'start') {
              const detail = stringify(tool.args)
              openTool.set(name, steps.length)
              tools += 1
              steps.push({
                phase: 'tool',
                name,
                text: 'start',
                ...(detail !== undefined ? { detail: `入参\n${detail}` } : {}),
                at,
              })
              continue
            }

            const result = stringify(tool.result)
            if (pendingAt !== undefined) {
              const cur = steps[pendingAt]
              if (cur === undefined) return
              const merged = cur.detail
                ? `${cur.detail}\n\n结果\n${result ?? '(无返回)'}`
                : `结果\n${result ?? '(无返回)'}`
              steps[pendingAt] = step({ ...cur, text: `end · ${Math.max(0, at - cur.at)}ms`, detail: merged })
              openTool.delete(name)
            } else {
              tools += 1
              steps.push({
                phase: 'tool',
                name,
                text: 'end',
                ...(result !== undefined ? { detail: `结果\n${result}` } : {}),
                at,
              })
            }
            continue
          }

          if (type === eventType.turn) {
            const turn = modelEvent(event) as Extract<AgentEvent, { type: 'turn' }>
            if (turn.phase === 'start') {
              turns = Math.max(turns, turn.turn)
              steps.push(step({ phase: 'turn', turn: turn.turn, text: 'start', at }))
            } else {
              const reason = turn.reason ? stringify(turn.reason) : undefined
              steps.push({
                phase: 'turn',
                turn: turn.turn,
                text: 'end',
                ...(reason !== undefined && reason !== '{}' ? { detail: `结束原因\n${reason}` } : {}),
                at,
              })
            }
            continue
          }

          if (type === eventType.error) {
            const bad = modelEvent(event) as Extract<AgentEvent, { type: 'error' }>
            steps.push(step({ phase: 'error', text: bad.message, at }))
            continue
          }

          if (type === eventType.done) {
            const final = modelEvent(event) as Extract<AgentEvent, { type: 'done' }>
            steps.push(step({ phase: 'done', text: final.text.slice(0, 300) || undefined, at }))
            continue
          }

          // `status` and anything else passes straight through to the view already yielded above.
          yield event
        }
      } catch (cause) {
        const message = fail(cause)
        const cancelled = codeOf(cause) === 'cancelled'
        await finish(ctx, id, {
          status: cancelled ? 'cancelled' : 'error',
          output: body,
          error: cancelled ? null : message,
          steps,
          meta: { system, maxIterations, cwdType, tools, turns },
        })
        endRun(id)
        throw cause
      }

      const endedAt = Date.now()
      await finish(ctx, id, {
        status: 'done',
        output: body,
        steps,
        meta: { system, maxIterations, cwdType, tools, turns },
      })
      endRun(id)
      return {
        id,
        provider: provider ?? null,
        model: model ?? null,
        chars: body.length,
        turns,
        tools,
        durationMs: endedAt - startedAt,
      }
    },

    /**
     * MCP is one tool call, not a stream: await, then keep the raw result. It still becomes a run
     * record, because "what did that server actually return" is the thing worth comparing.
     */
    async callTool(ctx, args?: { server?: string; tool?: string; args?: unknown }) {
      const server = (args?.server ?? '').trim()
      const tool = (args?.tool ?? '').trim()
      if (!server || !tool) throw new Error('请选择 server 和 tool')

      // The UI edits args as text. Parse here so a syntax error is a clear failure, not a mystery.
      let toolArgs: unknown = args?.args
      if (typeof toolArgs === 'string') {
        const raw = toolArgs.trim()
        if (!raw) toolArgs = {}
        else {
          try {
            toolArgs = JSON.parse(raw)
          } catch (cause) {
            throw new Error(`参数不是合法 JSON：${fail(cause)}`)
          }
        }
      }
      if (!isRec(toolArgs)) toolArgs = {}

      const startedAt = Date.now()
      const id = await insert(ctx, {
        kind: 'mcp',
        title: `${server} · ${tool}`,
        input: stringify(toolArgs) ?? '{}',
        source: server,
        meta: { tool, args: toolArgs },
      })
      begin('mcp', new AbortController(), id)

      try {
        const mcpArgs = isRec(toolArgs) ? toolArgs : {}
        const value = await ctx.mcp(server, tool, mcpArgs)
        const output = typeof value === 'string'
          ? value
          : isRec(value) ? stringify(value) ?? '' : str(value)
        await finish(ctx, id, {
          status: 'done',
          output,
          meta: { tool, args: toolArgs },
        })
        endRun(id)
        return { id, output, durationMs: Date.now() - startedAt, server, tool }
      } catch (cause) {
        const message = fail(cause)
        await finish(ctx, id, { status: 'error', error: message, meta: { tool, args: toolArgs } })
        endRun(id)
        throw cause
      }
    },

    /**
     * Run one command through `ctx.bash` or `ctx.pwsh`, and keep the record. `auto` reads the
     * platform: a Windows machine has pwsh, and most of them do not have bash.
     * The exit code is a field, not a status — a non-zero exit is still a finished run.
     */
    async shell(ctx, args?: { command?: string; shell?: string }) {
      const command = str(args?.command).trim()
      if (command.length === 0) throw new Error('命令为空')
      const asked = str(args?.shell)
      const { platform } = await ctx.system.metrics()
      const auto = platform === 'win32' ? 'pwsh' : 'bash'
      const chosen = asked === 'bash' || asked === 'pwsh' ? asked : auto
      const startedAt = Date.now()
      const id = await insert(ctx, {
        kind: 'shell',
        title: `${chosen} · ${command.slice(0, 60)}`,
        input: command,
        source: chosen,
        meta: { shell: chosen, platform },
      })
      // A shell command takes no abort signal, so Cancel marks the run and leaves the child to
      // finish under the host's own timeout. Say so rather than implying a kill.
      begin('shell', new AbortController(), id)
      try {
        const result = chosen === 'pwsh' ? await ctx.pwsh(command) : await ctx.bash(command)
        await finish(ctx, id, {
          status: 'done',
          output: result.stdout,
          meta: { shell: chosen, platform, exitCode: result.exitCode, stderr: result.stderr },
        })
        endRun(id)
        return {
          id,
          shell: chosen,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - startedAt,
        }
      } catch (cause) {
        const message = fail(cause)
        await finish(ctx, id, { status: 'error', error: message, meta: { shell: chosen, platform } })
        endRun(id)
        throw cause
      }
    },

    /** Stop reaches whichever stream is live: llm, agent, or a pending tool call. */
    async cancel(ctx) {
      const running = active
      active = null
      running?.ac.abort()
      if (running?.id != null) {
        await finish(ctx, running.id, { status: 'cancelled', output: '' })
      }
      return { ok: true, stopped: running?.kind ?? null }
    },
  },
})
