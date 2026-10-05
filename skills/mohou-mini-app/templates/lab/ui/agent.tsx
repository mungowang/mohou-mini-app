import { useEffect, useRef, useState } from 'react'

import {
  Badge,
  Button,
  Icon,
  Input,
  Markdown,
  NativeSelect,
  NativeSelectOption,
  ScrollArea,
  Spinner,
  Textarea,
  agentEventType,
  cn,
  useApp,
  type AgentEvent,
} from '@mohou/ui'

import { EV, step, type AgentStepEvent, type RunStep, type StepPhase } from '../shared/events'
import { GLASS, WELL, clock, ms } from './glass'

type Stats = { turns: number; tools: number; chars: number; durationMs: number | null }

const EMPTY: Stats = { turns: 0, tools: 0, chars: 0, durationMs: null }

function label(step: RunStep, index: number): string {
  if (step.phase === 'turn') return step.text === 'end' ? `第 ${step.turn} 轮结束` : `第 ${step.turn} 轮`
  if (step.phase === 'tool') return step.name ?? 'tool'
  if (step.phase === 'done') return '完成'
  if (step.phase === 'error') return '出错'
  return `结果 ${index + 1}`
}

/** Step rows are a custom rail rather than `RunTimeline`: each step expands its own payload. */
function StepList({ steps, running }: { steps: RunStep[]; running: boolean }) {
  const [open, setOpen] = useState<number | null>(null)

  if (!steps.length) {
    return (
      <p className="text-muted-foreground px-1 py-6 text-center text-[11px]">还没有步骤。运行后逐轮出现在这里。</p>
    )
  }

  return (
    <div className="flex flex-col pb-1">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const expanded = open === i
        const phase: StepPhase = step.phase
        const tone =
          phase === 'error'
            ? 'bg-destructive'
            : phase === 'done'
              ? 'bg-primary'
              : phase === 'tool'
                ? 'bg-primary/70'
                : 'bg-muted-foreground/50'
        return (
          <div key={`${step.at}-${i}`} className="relative overflow-hidden pl-6">
            <span
              className={cn('absolute top-2.5 left-0 size-2 rounded-full', tone, last && running && 'animate-pulse')}
            />
            {!last ? <span className="bg-border absolute top-4 bottom-0 left-[3px] w-px" /> : null}
            <button
              type="button"
              onClick={() => { setOpen(expanded ? null : i) }}
              className={cn(
                'hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                !step.detail && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10px] tracking-wide uppercase',
                  phase === 'tool' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {phase}
              </span>
              <span className="truncate text-xs">{label(step, i)}</span>
              {step.phase === 'tool' && step.text?.startsWith('end ·') ? (
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{step.text.slice(5)}</span>
              ) : null}
              <span className="text-muted-foreground/70 ml-auto shrink-0 font-mono text-[10px]">{clock(step.at)}</span>
              {step.detail ? (
                <Icon.ChevronDown
                  className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform', expanded && 'rotate-180')}
                />
              ) : null}
            </button>
            {expanded && step.detail ? (
              <pre
                className="text-muted-foreground mt-1 mb-2 max-h-64 min-w-0 overflow-x-hidden overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
                style={WELL}
              >
                {step.detail}
              </pre>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function AgentRegion({ runtime, onRan }: { runtime: { provider: string | null; model: string | null }; onRan: () => void }) {
  const { streamCall, call, on } = useApp()
  const [goal, setGoal] = useState('')
  const [system, setSystem] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [maxIterations, setMaxIterations] = useState('12')
  const [cwdType, setCwdType] = useState('process')
  const [steps, setSteps] = useState<RunStep[]>([])
  const [live, setLive] = useState('')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  // A tool call is two events (`start`, then `end`); the end must find the row the start opened.
  const openTool = useRef(new Map<string, number>())
  // Live counters, so the push handler never reads a stale closure.
  const count = useRef({ turns: 0, tools: 0 })

  useEffect(() => {
    setProvider(prev => prev || (runtime.provider ?? ''))
    setModel(prev => prev || (runtime.model ?? ''))
  }, [runtime.provider, runtime.model])

  /**
   * ⭐ key: steps arrive on the PUSH channel, not from the method's yielded stream. The yield
   * bridge delivers text deltas but drops `turn` and `tool`, which is why a run could finish with
   * a full answer and an empty step panel. Subscribed for the whole run, so nothing is missed.
   */
  useEffect(() => {
    const off = on(EV.agentEvent, (data) => {
      const event = data as AgentStepEvent
      const now = Date.now()

      if (event.type === 'turn') {
        if (event.phase !== 'start') return
        count.current.turns = Math.max(count.current.turns, event.turn ?? 0)
        setSteps(prev => [...prev, step({ phase: 'turn', turn: event.turn, text: 'start', at: now })])
        return
      }

      if (event.type === 'tool') {
        if (event.phase === 'start') {
          const detail = event.args === undefined ? undefined : JSON.stringify(event.args, null, 2)
          count.current.tools += 1
          setSteps((prev) => {
            openTool.current.set(event.name ?? 'tool', prev.length)
            return [
              ...prev,
              step({ phase: 'tool', name: event.name, text: 'start', detail: detail ? `入参\n${detail}` : undefined, at: now }),
            ]
          })
          return
        }
        const result = event.result === undefined ? '(无返回)' : JSON.stringify(event.result, null, 2)
        setSteps((prev) => {
          const key = event.name ?? 'tool'
          const openedAt = openTool.current.get(key)
          if (openedAt === undefined) {
            return [...prev, step({ phase: 'tool', name: event.name, text: 'end', detail: `结果\n${result}`, at: now })]
          }
          const next = [...prev]
          const cur = next[openedAt]
          if (cur === undefined) return prev
          next[openedAt] = {
            ...cur,
            text: `end · ${Math.max(0, now - cur.at)}ms`,
            detail: cur.detail ? `${cur.detail}\n\n结果\n${result}` : `结果\n${result}`,
          }
          return next
        })
        openTool.current.delete(event.name ?? 'tool')
        return
      }

      if (event.type === 'error') {
        setSteps(prev => [
          ...prev,
          { phase: 'error', ...event.message === undefined ? {} : { text: event.message }, at: now },
        ])
        return
      }

      // Every other variant returned above, so this event is the final one.
      const text = (event.text ?? '').slice(0, 300)
      setSteps(prev => [...prev, step({ phase: 'done', text: text.length === 0 ? undefined : text, at: now })])
    })
    return off
  }, [on])

  async function run() {
    const body = goal.trim()
    if (!body || running) return
    setError(null)
    setSteps([])
    setLive('')
    setStats(EMPTY)
    setRunning(true)
    openTool.current = new Map()
    count.current = { turns: 0, tools: 0 }

    const args: Record<string, unknown> = { goal: body, cwdType }
    if (system.trim()) args.system = system.trim()
    if (provider.trim()) args.provider = provider.trim()
    if (model.trim()) args.model = model.trim()
    const iters = Number(maxIterations)
    if (Number.isFinite(iters) && iters > 0) args.maxIterations = Math.floor(iters)

    // This stream carries the answer text; the steps come from the push channel above.
    const pending = streamCall('runAgent', args)
    let text = ''
    try {
      // The yielded stream carries the answer only; its `turn`/`tool` events never arrive.
      for await (const raw of pending) {
        const event = raw as AgentEvent
        if (event.type !== agentEventType.textDelta) continue
        text += event.text
        setLive(text)
        setStats({
          turns: count.current.turns,
          tools: count.current.tools,
          chars: text.length,
          durationMs: null,
        })
      }
      const summary = (await pending) as { durationMs?: number } | undefined
      // The last pushed events can land with the summary; take the counters from here.
      setStats({
        turns: count.current.turns,
        tools: count.current.tools,
        chars: text.length,
        durationMs: summary?.durationMs ?? null,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
      onRan()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 p-3" style={GLASS}>
        <div className="flex items-start gap-2">
          <Icon.Target className="text-muted-foreground mt-2 size-4 shrink-0" />
          <Textarea
            value={goal}
            rows={2}
            placeholder="给 agent 一个目标，例如：读 ~/.mini-app/host.json，说出里面配了几个 app"
            onChange={(e) => { setGoal(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void run()
              }
            }}
            className="min-h-16 flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
          {running ? (
            <Button size="sm" variant="outline" onClick={() => void call('cancel', {})}>
              <Icon.Square className="size-3.5" /> 停止
            </Button>
          ) : (
            <Button size="sm" disabled={!goal.trim() || running} onClick={() => void run()}>
              <Icon.Play className="size-3.5" /> 运行
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setSystemOpen(v => !v) }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 text-[11px] transition-colors"
            style={WELL}
          >
            <Icon.ChevronRight className={cn('size-3 transition-transform', systemOpen && 'rotate-90')} />
            system prompt
            {system.trim() ? <span className="text-primary">· 已设</span> : null}
          </button>

          <div className="flex items-center gap-1.5">
            <Icon.Cpu className="text-muted-foreground size-3.5" />
            <Input
              value={provider}
              placeholder={runtime.provider ?? 'provider'}
              onChange={(e) => { setProvider(e.target.value) }}
              className="h-7 w-28 font-mono text-[11px]"
            />
            <Input
              value={model}
              placeholder={runtime.model ?? 'model'}
              onChange={(e) => { setModel(e.target.value) }}
              className="h-7 w-40 font-mono text-[11px]"
            />
            <Input
              value={maxIterations}
              inputMode="numeric"
              onChange={(e) => { setMaxIterations(e.target.value.replace(/[^\d]/g, '')) }}
              className="h-7 w-16 font-mono text-[11px]"
            />
            <NativeSelect
              value={cwdType}
              onChange={(e) => { setCwdType(e.target.value) }}
              className="h-7 w-28 font-mono text-[11px]"
            >
              <NativeSelectOption value="process">cwd: process</NativeSelectOption>
              <NativeSelectOption value="app">cwd: app</NativeSelectOption>
              <NativeSelectOption value="temp">cwd: temp</NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="text-muted-foreground/90 ml-auto flex items-center gap-3 font-mono text-[10px]">
            <span>{stats.turns} 轮</span>
            <span>{stats.tools} 工具</span>
            <span>{stats.chars} 字</span>
            <span>总 {ms(stats.durationMs)}</span>
          </div>
        </div>

        {systemOpen ? (
          <Textarea
            value={system}
            rows={3}
            placeholder="可选。会作为 system 角色发给 agent"
            onChange={(e) => { setSystem(e.target.value) }}
            className="resize-none font-mono text-[11px]"
          />
        ) : null}

        {error ? (
          <div className="text-destructive flex items-start gap-2 px-2.5 py-1.5 text-[11px]" style={WELL}>
            <Icon.AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-1">
        <div className="flex min-h-0 flex-col overflow-hidden" style={GLASS}>
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <Icon.ListTree className="text-muted-foreground size-3.5" />
            <span className="text-xs font-medium">执行步骤</span>
            {steps.length ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {steps.length}
              </Badge>
            ) : null}
            {running ? <Spinner className="ml-auto size-3.5" /> : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-3.5 pb-3">
              <StepList steps={steps} running={running} />
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden" style={GLASS}>
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <Icon.Terminal className="text-muted-foreground size-3.5" />
            <span className="text-xs font-medium">流式输出</span>
            {running ? (
              <span className="text-primary ml-auto flex items-center gap-1.5 font-mono text-[10px]">
                <span className="bg-primary size-1.5 animate-pulse rounded-full" /> streaming
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 pb-4 text-sm">
              {live ? (
                <>
                  <Markdown>{live}</Markdown>
                  {running ? <span className="bg-primary ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-baseline" /> : null}
                </>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-[11px]">
                  {running ? '等待 agent 的第一个 token…' : 'agent 的答案会实时写到这里'}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
