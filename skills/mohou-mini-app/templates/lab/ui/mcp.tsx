import { useEffect, useMemo, useState } from 'react'

import {
  Alert,
  Badge,
  Button,
  Icon,
  JsonViewer,
  ScrollArea,
  Spinner,
  StatusBadge,
  cn,
  useApp,
} from '@mohou/ui'

import { MCP_PRESETS, MCP_SERVERS, findServer } from '../shared/mcp'
import type { RunRecall } from '../shared/events'
import { GLASS, WELL, asJson, ms } from './glass'

type Outcome = { ok: boolean; text: string; durationMs: number; at: number }

const pretty = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function McpRegion({ onRan, recall }: { onRan: () => void; recall?: RunRecall }) {
  const { call } = useApp()
  const first = MCP_SERVERS[0]
  const [serverId, setServerId] = useState(first?.id ?? '')
  const server = findServer(serverId) ?? first
  const [toolName, setToolName] = useState(first?.tools[0]?.name ?? '')
  const tool = server?.tools.find(t => t.name === toolName) ?? server?.tools[0]
  const [argsText, setArgsText] = useState(pretty(first?.tools[0]?.example ?? {}))
  const [touched, setTouched] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The rail's button brings back the server, the tool, and the exact arguments that ran.
  useEffect(() => {
    if (recall === undefined) return
    const record = recall.record
    if (record.source !== null && findServer(record.source) !== undefined) setServerId(record.source)
    const tool = record.meta.tool
    if (typeof tool === 'string') setToolName(tool)
    setArgsText(record.input)
    setTouched(true)
    setOutcome(null)
    setError(null)
  }, [recall])

  // Switching tool re-seeds the args box from that tool's own example, unless the user is editing.
  useEffect(() => {
    if (touched || !tool) return
    setArgsText(pretty(tool.example))
  }, [tool, touched])

  function pickServer(id: string) {
    const next = findServer(id)
    setServerId(id)
    setTouched(false)
    setToolName(next?.tools[0]?.name ?? '')
    setOutcome(null)
    setError(null)
  }

  function pickTool(name: string) {
    setToolName(name)
    setTouched(false)
    setOutcome(null)
    setError(null)
  }

  const parsedArgs = useMemo(() => asJson(argsText), [argsText])
  const argsValid = argsText.trim() === '' || parsedArgs !== null

  async function invoke() {
    if (!server || !tool || busy) return
    setBusy(true)
    setError(null)
    try {
      // MCP is one request/response, not a stream: args are the tool's own object, so the
      // backend parses the editor text and passes it straight through.
      const result = (await call('callTool', {
        server: server.id,
        tool: tool.name,
        args: argsText.trim() || '{}',
      })) as { output?: string; durationMs?: number }
      setOutcome({
        ok: true,
        text: result.output ?? '',
        durationMs: result.durationMs ?? 0,
        at: Date.now(),
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      setOutcome({ ok: false, text: message, durationMs: 0, at: Date.now() })
    } finally {
      setBusy(false)
      onRan()
    }
  }

  const resultJson = outcome ? asJson(outcome.text) : null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5">
      <div className="flex flex-col gap-2.5 p-3" style={GLASS}>
        <div className="flex flex-wrap items-center gap-2">
          <Icon.Plug className="text-muted-foreground size-3.5" />
          <span className="text-xs font-medium">server</span>
          <div className="flex flex-wrap gap-1">
            {MCP_SERVERS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { pickServer(s.id) }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors',
                  s.id === serverId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                style={s.id === serverId ? undefined : WELL}
              >
                <span className={cn('size-1.5 rounded-full', s.id === serverId ? 'bg-primary-foreground' : 'bg-primary')} />
                {s.id}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {server?.tools.length ?? 0} tools
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1">
          {server?.tools.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => { pickTool(t.name) }}
              className={cn(
                'rounded-lg px-2 py-1 font-mono text-[11px] transition-colors',
                t.name === toolName
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>

        {server?.note ? (
          <p className="text-muted-foreground/70 truncate font-mono text-[10px]">{server.note}</p>
        ) : null}

        {tool ? (
          <p className="text-muted-foreground text-[11px]">
            {tool.description}
            {tool.required.length ? (
              <span className="ml-1.5 font-mono opacity-80">必填: {tool.required.join(', ')}</span>
            ) : (
              <span className="ml-1.5 font-mono opacity-80">无必填参数</span>
            )}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {MCP_PRESETS.filter(preset => server?.tools.some(t => t.name === preset.tool)).map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const target = server?.tools.find(t => t.name === preset.tool)
                if (target) setToolName(target.name)
                setArgsText(pretty(preset.args))
                setTouched(true)
              }}
              className="text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1 text-[11px] transition-colors"
              style={WELL}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5 lg:grid-cols-2 lg:grid-rows-1">
        <div className="flex min-h-0 flex-col overflow-hidden" style={GLASS}>
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <Icon.Braces className="text-muted-foreground size-3.5" />
            <span className="text-xs font-medium">参数 · JSON</span>
            {!argsValid ? (
              <span className="text-destructive font-mono text-[10px]">语法错误</span>
            ) : (
              <span className="text-muted-foreground font-mono text-[10px]">合法</span>
            )}
            <Button
              size="sm"
              className="ml-auto"
              disabled={busy || !tool || !argsValid}
              onClick={() => void invoke()}
            >
              {busy ? <Spinner className="size-3.5" /> : <Icon.Zap className="size-3.5" />} 调用
            </Button>
          </div>
          <textarea
            value={argsText}
            spellCheck={false}
            onChange={(e) => {
              setArgsText(e.target.value)
              setTouched(true)
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void invoke()
            }}
            className={cn(
              'text-foreground/90 min-h-0 flex-1 resize-none bg-transparent px-3.5 pb-3 font-mono text-[11px] leading-relaxed outline-none',
              !argsValid && 'text-destructive',
            )}
          />
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden" style={GLASS}>
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <Icon.Boxes className="text-muted-foreground size-3.5" />
            <span className="text-xs font-medium">返回</span>
            {outcome ? (
              <>
                <StatusBadge status={outcome.ok ? 'pass' : 'fail'} />
                <span className="text-muted-foreground font-mono text-[10px]">{ms(outcome.durationMs)}</span>
              </>
            ) : null}
            {resultJson ? <span className="text-muted-foreground font-mono text-[10px]">JSON</span> : null}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-3.5 pb-3.5">
              {error ? (
                <Alert variant="destructive" className="mb-2">
                  <Icon.AlertTriangle className="size-3.5" />
                  <span className="font-mono text-[11px]">{error}</span>
                </Alert>
              ) : null}
              {outcome ? (
                resultJson ? (
                  <div className="min-w-0 break-all"><JsonViewer value={resultJson} /></div>
                ) : (
                  <pre
                    className="text-foreground/90 max-h-full overflow-x-hidden overflow-y-auto p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
                    style={WELL}
                  >
                    {outcome.text || '(空返回)'}
                  </pre>
                )
              ) : (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <Icon.Boxes className="size-6 opacity-50" />
                  <p className="max-w-xs text-[11px] leading-relaxed">
                    选一个 tool，参数就是它自己的 args 对象。⌘/Ctrl+Enter 调用。
                    <br />
                    结果会原样留下，并记进运行记录。
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
