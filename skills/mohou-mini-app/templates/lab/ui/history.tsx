import { useMemo, useState } from 'react'

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Icon,
  Input,
  JsonViewer,
  Reveal,
  ScrollArea,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
  cn,
} from '@mohou/ui'

import { KIND_LABEL, type RunKind, type RunRecord, type RunStep } from '../shared/events'
import { KIND_ORDER, MCP_SERVERS } from '../shared/mcp'
import { CHIP, WELL, asJson, clip, clock, ms, stamp } from './glass'

/** Grouped into one filter row: "all" plus the three kinds, with live counts. */
type Filter = 'all' | RunKind

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  ...KIND_ORDER.map(kind => ({ key: kind as Filter, label: KIND_LABEL[kind].replace('补全', '').replace('执行', '').replace('调用', '') })),
]

const TONE: Record<string, string> = {
  llm: 'text-primary',
  agent: 'text-foreground',
  mcp: 'bg-transparent text-muted-foreground',
}

function statusFor(status: RunRecord['status']): string {
  if (status === 'done') return 'pass'
  if (status === 'running') return 'running'
  if (status === 'error') return 'fail'
  return 'pending'
}

function StepRow({ step, index }: { step: RunStep; index: number }) {
  const [open, setOpen] = useState(false)
  const label =
    step.phase === 'turn'
      ? `第 ${step.turn ?? index + 1} 轮`
      : step.phase === 'tool'
        ? `工具 · ${step.name ?? ''}`
        : step.phase === 'done'
          ? '完成'
          : step.phase === 'error'
            ? '出错'
            : '结果'

  const sub = step.text?.startsWith('end ·') ? step.text : step.text ? `· ${step.text}` : ''

  return (
    <div className="relative overflow-hidden pl-5">
      <span
        className={cn(
          'absolute top-2 left-0 size-2 rounded-full',
          step.phase === 'error' ? 'bg-destructive' : step.phase === 'done' ? 'bg-primary' : 'bg-muted-foreground/60',
        )}
      />
      <span className="bg-border absolute top-5 bottom-0 left-[3px] w-px" />
      <button
        type="button"
        onClick={() => {
          if (step.detail) setOpen(v => !v)
        }}
        className={cn(
          CHIP,
          'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
          step.detail ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default',
        )}
      >
        <span className="flex items-center gap-2 text-xs">
          <span className="font-medium">{label}</span>
          {sub ? <span className="text-muted-foreground font-mono">{sub}</span> : null}
          <span className="text-muted-foreground/70 ml-auto font-mono">{clock(step.at)}</span>
          {step.detail ? (
            <Icon.ChevronDown className={cn('text-muted-foreground size-3.5 transition-transform', open && 'rotate-180')} />
          ) : null}
        </span>
      </button>
      {open && step.detail ? (
        <pre
          className="text-muted-foreground mt-1 mb-2 max-h-56 min-w-0 overflow-x-hidden overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
          style={WELL}
        >
          {step.detail}
        </pre>
      ) : null}
    </div>
  )
}

function DetailBody({ run }: { run: RunRecord }) {
  const parsed = useMemo(() => asJson(run.output), [run.output])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 pb-5">
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          ['类型', KIND_LABEL[run.kind]],
          ['状态', run.status],
          ['耗时', ms(run.durationMs)],
          ['开始', stamp(run.startedAt)],
          ['provider', run.provider ?? '—'],
          ['model', run.model ?? '—'],
          ...(run.kind === 'mcp' ? [['server', run.source ?? '—']] : []),
        ].map(([k, v]) => (
          <div key={k} className="p-2.5" style={WELL}>
            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{k}</div>
            <div className="mt-0.5 truncate font-mono">{v}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">输入</div>
        <pre className="max-h-40 overflow-x-hidden overflow-y-auto p-3 font-mono text-[11px] break-all whitespace-pre-wrap" style={WELL}>
          {run.input || '—'}
        </pre>
      </div>

      {run.steps.length ? (
        <div>
          <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">
            执行步骤 · {run.steps.length}
          </div>
          <div className="flex flex-col gap-0.5">
            {run.steps.map((step, i) => (
              <StepRow key={`${step.at}-${i}`} step={step} index={i} />
            ))}
          </div>
        </div>
      ) : null}

      {run.error ? (
        <div>
          <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">错误</div>
          <pre className="text-destructive overflow-x-hidden overflow-y-auto p-3 font-mono text-[11px] break-all whitespace-pre-wrap" style={WELL}>
            {run.error}
          </pre>
        </div>
      ) : null}

      {run.output ? (
        // No `min-h-0` here: on a plain block it floors the height at 0, so the tall <pre>
        // below overflows the wrapper and paints over the next section.
        <div>
          <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">输出</div>
          {parsed ? (
            <div className="max-h-96 overflow-x-hidden overflow-y-auto p-3 break-all" style={WELL}>
              <JsonViewer value={parsed} />
            </div>
          ) : (
            <pre
              className="max-h-96 overflow-x-hidden overflow-y-auto p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
              style={WELL}
            >
              {run.output}
            </pre>
          )}
        </div>
      ) : null}

      {Object.keys(run.meta).length ? (
        <>
          <Separator />
          <div>
            <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">运行参数</div>
            <div className="overflow-x-hidden overflow-y-auto p-3 break-all" style={WELL}>
              <JsonViewer value={run.meta} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function HistoryRail({
  runs,
  counts,
  loading,
  onRefresh,
  onClear,
  onRecall,
}: {
  runs: RunRecord[]
  counts: Record<RunKind, number>
  loading: boolean
  onRefresh: (kind: Filter, search: string) => void
  onClear: () => void
  /** Hand a record to its station so the form fills with what ran last time. */
  onRecall: (record: RunRecord) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<RunRecord | null>(null)

  function apply(next: Filter, nextSearch: string) {
    setFilter(next)
    setSearch(nextSearch)
    onRefresh(next, nextSearch)
  }

  return (
    <aside className="flex min-h-0 w-full flex-col gap-2.5 lg:w-[20rem] lg:shrink-0">
      <div className="flex flex-col gap-2.5 p-3" style={WELL}>
        <div className="flex items-center gap-2">
          <Icon.History className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">运行记录</span>
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {runs.length}
          </Badge>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="刷新记录"
            onClick={() => { apply(filter, search) }}
          >
            <Icon.RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => { apply(f.key, search) }}
              className={cn(
                CHIP,
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {f.label}
              <span className="ml-1 font-mono opacity-60">
                {f.key === 'all'
                  ? KIND_ORDER.reduce((sum, kind) => sum + counts[kind], 0)
                  : counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <Input
          value={search}
          placeholder="搜标题 / 输入 / 输出"
          onChange={(e) => { setSearch(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply(filter, search)
          }}
          className="h-7 text-xs"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" style={WELL}>
        {runs.length ? (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-1 p-1.5">
              {runs.map((run, i) => (
                <Reveal key={run.id} delay={Math.min(i, 12) * 30} distance={6}>
                  <div className="hover:bg-muted/60 flex items-center gap-1 rounded-lg pr-1.5 transition-colors">
                    <button
                      type="button"
                      onClick={() => { setSelected(run) }}
                      className={cn(CHIP, 'bg-transparent flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors')}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={cn('font-mono text-[10px] tracking-wide uppercase', TONE[run.kind])}>
                          {run.kind}
                        </span>
                        {run.kind === 'mcp' ? (
                          <span className="text-muted-foreground truncate font-mono text-[10px]">{run.source}</span>
                        ) : (
                          <span className="text-muted-foreground truncate font-mono text-[10px]">{run.model ?? '—'}</span>
                        )}
                        <span className="ml-auto shrink-0">
                          <StatusBadge status={statusFor(run.status)} />
                        </span>
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug">{clip(run.title, 90) || '（无标题）'}</span>
                      <span className="text-muted-foreground/80 flex items-center gap-2 font-mono text-[10px]">
                        <span>{stamp(run.startedAt)}</span>
                        <span className="ml-auto">{ms(run.durationMs)}</span>
                        {run.steps.length ? <span>{run.steps.length} 步</span> : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="带入这次输入"
                      title="带入这次输入，改完再触发"
                      onClick={() => { onRecall(run) }}
                      className={cn(CHIP, 'bg-transparent text-muted-foreground hover:text-foreground shrink-0 rounded-lg p-1.5 transition-colors')}
                    >
                      <Icon.Play className="size-3.5" />
                    </button>
                  </div>
                </Reveal>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon.History className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有记录</EmptyTitle>
              <EmptyDescription>跑一次 LLM、Agent 或 MCP，这里就会留下痕迹</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="flex items-center gap-2 px-1">
        <p className="text-muted-foreground/80 text-[10px]">
          {MCP_SERVERS.length} 个 MCP server · 记录留在本应用 SQLite
        </p>
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground ml-auto"
          onClick={() => {
            setSelected(null)
            onClear()
          }}
        >
          <Icon.Trash2 className="size-3" /> 清空
        </Button>
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        {/* `SheetContent` itself has no padding (the kit pads only `SheetHeader`), so the body
            carries its own gutters — without them every card runs to the panel edge. */}
        <SheetContent side="right" width={520} className="flex flex-col gap-0">
          <SheetHeader className="px-5 pt-5 pb-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              {selected ? KIND_LABEL[selected.kind] : ''}
              {selected ? <StatusBadge status={statusFor(selected.status)} /> : null}
            </SheetTitle>
            <SheetDescription className="font-mono text-[11px]">
              #{selected?.id} · {stamp(selected?.startedAt ?? null)} · {ms(selected?.durationMs)}
            </SheetDescription>
          </SheetHeader>
          {selected ? <DetailBody run={selected} /> : null}
        </SheetContent>
      </Sheet>
    </aside>
  )
}
