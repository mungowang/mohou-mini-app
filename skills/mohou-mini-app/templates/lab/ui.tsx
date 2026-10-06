import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toaster,
  cn,
  toast,
  useApp,
} from '@mohou/ui'

import { EMPTY_COUNTS, EV, type LabSnapshot, type RunKind, type RunRecall, type RunRecord } from './shared/events'
import { AgentRegion } from './ui/agent'
import { GLASS, LiquidFilter, Sky, WELL, clock, ms } from './ui/glass'
import { HistoryRail } from './ui/history'
import { KIND_ORDER } from './shared/mcp'
import { LlmRegion } from './ui/llm'
import { McpRegion } from './ui/mcp'
import { ShellRegion } from './ui/shell'

const EMPTY_SNAPSHOT: LabSnapshot = {
  runs: [],
  counts: { ...EMPTY_COUNTS },
  runtime: { provider: null, model: null },
  activeRunId: null,
}

/** The host may drop events on a long disconnect; it says so with a gap flag instead of guessing. */
function hasGap(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'gap' in value && (value as { gap?: unknown }).gap === true
}

type Station = {
  value: RunKind
  label: string
  hint: string
}

const STATIONS: Station[] = [
  { value: 'llm', label: 'LLM 补全', hint: '一次一个 prompt，逐字流式' },
  { value: 'agent', label: 'Agent 执行', hint: '多步自主执行 + 步骤跟踪' },
  { value: 'mcp', label: 'MCP 调用', hint: '挑 server 和 tool，发一次真调用' },
  { value: 'shell', label: 'Shell 执行', hint: 'ctx.bash / ctx.pwsh，按平台选 shell' },
]

export default function Ui() {
  const { call, on, onAny } = useApp()
  const [snapshot, setSnapshot] = useState<LabSnapshot>(EMPTY_SNAPSHOT)
  const [station, setStation] = useState<RunKind>('llm')
  const [loading, setLoading] = useState(true)
  const [railLoading, setRailLoading] = useState(false)
  // The rail's button hands a record back; the station it belongs to fills its own form from it.
  const [recall, setRecall] = useState<RunRecall | null>(null)
  const filter = useRef<{ kind: string; search: string }>({ kind: 'all', search: '' })

  const loadSnapshot = useCallback(async () => {
    try {
      const next = (await call('snapshot', {})) as LabSnapshot
      setSnapshot(next)
    } catch (cause) {
      toast.add({
        title: '读不到运行快照',
        description: cause instanceof Error ? cause.message : String(cause),
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [call])

  const reloadRail = useCallback(
    async (kind: string, search: string) => {
      filter.current = { kind, search }
      setRailLoading(true)
      try {
        const runs = (await call('listRuns', { kind, search, limit: 40 })) as RunRecord[]
        setSnapshot(prev => ({ ...prev, runs }))
      } catch {
        /* the rail keeps its previous rows; the toast already covers a dead snapshot */
      } finally {
        setRailLoading(false)
      }
    },
    [call],
  )

  // ⭐ key: one snapshot on mount, then events keep it current. No interval polling.
  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    const off = on(EV.records, () => {
      void loadSnapshot()
      void reloadRail(filter.current.kind, filter.current.search)
    })
    const offAny = onAny((event) => {
      if (event.name === '*' && hasGap(event.data)) {
        void loadSnapshot()
        void reloadRail(filter.current.kind, filter.current.search)
      }
    })
    return () => {
      off()
      offAny()
    }
  }, [on, onAny, loadSnapshot, reloadRail])

  const onRan = useCallback(() => {
    void loadSnapshot()
    void reloadRail(filter.current.kind, filter.current.search)
  }, [loadSnapshot, reloadRail])

  const total = useMemo(
    () => KIND_ORDER.reduce((sum, kind) => sum + snapshot.counts[kind], 0),
    [snapshot.counts],
  )

  async function clearHistory() {
    try {
      await call('clearHistory', {})
      toast.add({ title: '运行记录已清空', type: 'success', timeout: 3000 })
      onRan()
    } catch (cause) {
      toast.add({
        title: '清空失败',
        description: cause instanceof Error ? cause.message : String(cause),
        type: 'error',
      })
    }
  }

  return (
    // ⭐ Look: glass-island. Islands are liquid; the working sets inside them are soft cards.
    <div className="bg-background text-foreground relative flex h-full min-h-0 flex-col overflow-hidden">
      <LiquidFilter />
      <Sky />

      <div className="relative flex h-full min-h-0 flex-col gap-3 p-4 lg:p-5">
        <header className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5" style={GLASS}>
          <span
            className="flex size-8 items-center justify-center rounded-full"
            style={{ ...WELL, borderRadius: '999px' }}
          >
            <Icon.FlaskConical className="text-primary size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[13px] leading-tight font-semibold tracking-tight">模型实验台</h1>
            <p className="text-muted-foreground truncate font-mono text-[10px]">
              {snapshot.runtime.provider ?? 'runtime'} · {snapshot.runtime.model ?? '未配置模型'}
            </p>
          </div>

          <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-2 font-mono text-[10px]">
            <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={WELL}>
              <Icon.Cpu className="size-3" />
              {snapshot.runtime.model ?? '—'}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={WELL}>
              <Icon.Plug className="size-3" />1 mcp
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={WELL}>
              <Icon.History className="size-3" />
              {total} runs
            </span>
            <Button size="icon-sm" variant="ghost" aria-label="刷新快照" onClick={() => void loadSnapshot()}>
              <Icon.RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <Tabs
              value={station}
              onValueChange={(value) => { setStation(value as RunKind) }}
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <TabsList className="h-auto w-fit gap-1 p-1.5" variant="default" style={GLASS}>
                {STATIONS.map(s => (
                  <TabsTrigger key={s.value} value={s.value} className="gap-1.5 rounded-full px-3 py-1.5 text-xs">
                    <span className="flex flex-col items-start gap-0.5">
                      <span className="font-medium whitespace-nowrap">{s.label}</span>
                      <span className="text-muted-foreground hidden text-[10px] whitespace-nowrap sm:inline">
                        {s.hint}
                      </span>
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">{snapshot.counts[s.value]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="llm" className="flex min-h-0 flex-1 flex-col">
                <LlmRegion runtime={snapshot.runtime} onRan={onRan} {...recall?.record.kind === 'llm' ? { recall } : {}} />
              </TabsContent>
              <TabsContent value="agent" className="flex min-h-0 flex-1 flex-col">
                <AgentRegion runtime={snapshot.runtime} onRan={onRan} {...recall?.record.kind === 'agent' ? { recall } : {}} />
              </TabsContent>
              <TabsContent value="mcp" className="flex min-h-0 flex-1 flex-col">
                <McpRegion onRan={onRan} {...recall?.record.kind === 'mcp' ? { recall } : {}} />
              </TabsContent>
              <TabsContent value="shell" className="flex min-h-0 flex-1 flex-col">
                <ShellRegion onRan={onRan} {...recall?.record.kind === 'shell' ? { recall } : {}} />
              </TabsContent>
            </Tabs>

            <footer className="text-muted-foreground/80 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 font-mono text-[10px]">
              <span>快照 {clock(Date.now())}</span>
              <span>LLM {snapshot.counts.llm}</span>
              <span>Agent {snapshot.counts.agent}</span>
              <span>MCP {snapshot.counts.mcp}</span>
              <span>Shell {snapshot.counts.shell}</span>
              {snapshot.runs[0] ? (
                <span className="ml-auto">最近一次 {ms(snapshot.runs[0].durationMs)}</span>
              ) : null}
            </footer>
          </main>

          <HistoryRail
            runs={snapshot.runs}
            counts={snapshot.counts}
            loading={railLoading}
            onRefresh={(kind, search) => void reloadRail(kind, search)}
            onClear={() => void clearHistory()}
            onRecall={(record) => {
              setRecall({ record, at: Date.now() })
              setStation(record.kind)
            }}
          />
        </div>
      </div>

      <Toaster position="bottom-right" timeout={4000} limit={3} />
    </div>
  )
}
