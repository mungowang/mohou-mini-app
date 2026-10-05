import { useEffect, useState } from 'react'

import {
  Bubble,
  BubbleContent,
  Button,
  Icon,
  Input,
  Markdown,
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  Spinner,
  Textarea,
  cn,
  useApp,
} from '@mohou/ui'

import { GLASS, WELL, ms } from './glass'

type Turn = { role: 'user' | 'assistant'; text: string; error?: string; at: number }
type Stats = { chars: number; chunks: number; firstTokenMs: number | null; durationMs: number | null }

const EMPTY: Stats = { chars: 0, chunks: 0, firstTokenMs: null, durationMs: null }

export function LlmRegion({
  runtime,
  onRan,
}: {
  runtime: { provider: string | null; model: string | null }
  onRan: () => void
}) {
  const { streamCall, call } = useApp()
  const [prompt, setPrompt] = useState('')
  const [system, setSystem] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [live, setLive] = useState('')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  // The runtime's live provider/model are the app defaults; adopt them once the snapshot lands.
  useEffect(() => {
    setProvider(prev => prev || (runtime.provider ?? ''))
    setModel(prev => prev || (runtime.model ?? ''))
  }, [runtime.provider, runtime.model])

  async function send() {
    const body = prompt.trim()
    if (!body || running) return
    const at = Date.now()
    setError(null)
    setStats(EMPTY)
    setLive('')
    setRunning(true)
    setTurns(prev => [...prev, { role: 'user', text: body, at }])

    const args: Record<string, unknown> = { prompt: body }
    if (system.trim()) args.system = system.trim()
    if (provider.trim()) args.provider = provider.trim()
    if (model.trim()) args.model = model.trim()
    const tokens = Number(maxTokens)
    if (Number.isFinite(tokens) && tokens > 0) args.maxTokens = Math.floor(tokens)

    const pending = streamCall('chat', args)
    let text = ''
    let chunks = 0
    let firstTokenMs: number | null = null
    try {
      // ⭐ key: model text arrives as it is produced. `streamCall` yields each delta; awaiting the
      // SAME object afterwards is the method's return value (the run summary, not the text).
      for await (const chunk of pending) {
        const piece = typeof chunk === 'string' ? chunk : ''
        if (!piece) continue
        if (firstTokenMs === null) firstTokenMs = Date.now() - at
        chunks += 1
        text += piece
        setLive(text)
        setStats({ chars: text.length, chunks, firstTokenMs, durationMs: null })
      }
      const summary = (await pending) as { durationMs?: number } | undefined
      setStats({ chars: text.length, chunks, firstTokenMs, durationMs: summary?.durationMs ?? Date.now() - at })
      setTurns(prev => [...prev, { role: 'assistant', text, at: Date.now() }])
      setLive('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      if (text) setTurns(prev => [...prev, { role: 'assistant', text, error: message, at: Date.now() }])
      setLive('')
    } finally {
      setRunning(false)
      onRan()
    }
  }

  const streaming = running && live.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 p-3" style={GLASS}>
        <div className="flex items-start gap-2">
          <Textarea
            value={prompt}
            rows={2}
            placeholder="问点什么。Enter 发送，Shift+Enter 换行"
            onChange={(e) => { setPrompt(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            className="min-h-16 flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
          {running ? (
            <Button size="sm" variant="outline" onClick={() => void call('cancel', {})}>
              <Icon.Square className="size-3.5" /> 停止
            </Button>
          ) : (
            <Button size="sm" disabled={!prompt.trim()} onClick={() => void send()}>
              <Icon.Send className="size-3.5" /> 发送
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
              value={maxTokens}
              inputMode="numeric"
              placeholder="maxTokens"
              onChange={(e) => { setMaxTokens(e.target.value.replace(/[^\d]/g, '')) }}
              className="h-7 w-24 font-mono text-[11px]"
            />
          </div>

          <div className="text-muted-foreground/90 ml-auto flex items-center gap-3 font-mono text-[10px]">
            <span>{stats.chunks} chunk</span>
            <span>{stats.chars} 字</span>
            <span>首字 {stats.firstTokenMs == null ? '—' : ms(stats.firstTokenMs)}</span>
            <span>总 {ms(stats.durationMs)}</span>
          </div>
        </div>

        {systemOpen ? (
          <Textarea
            value={system}
            rows={3}
            placeholder="可选。会作为 system 角色发给模型"
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={GLASS}>
        {turns.length || live ? (
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport className="px-4 py-4">
                <MessageScrollerContent className="gap-4">
                  {turns.map((turn, i) => (
                    <MessageScrollerItem key={`${turn.at}-${i}`}>
                      <Bubble
                        align={turn.role === 'user' ? 'end' : 'start'}
                        variant={turn.role === 'user' ? 'tinted' : 'muted'}
                      >
                        <BubbleContent className="max-w-[46rem]">
                          {turn.role === 'user' ? (
                            <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                          ) : (
                            <div className="text-sm">
                              <Markdown>{turn.text}</Markdown>
                            </div>
                          )}
                          {turn.error ? (
                            <p className="text-destructive mt-2 font-mono text-[11px]">{turn.error}</p>
                          ) : null}
                        </BubbleContent>
                      </Bubble>
                    </MessageScrollerItem>
                  ))}
                  {streaming ? (
                    <MessageScrollerItem scrollAnchor>
                      <Bubble align="start" variant="muted">
                        <BubbleContent className="max-w-[46rem]">
                          <div className="text-sm">
                            <Markdown>{live}</Markdown>
                            <span className="bg-primary ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-baseline" />
                          </div>
                        </BubbleContent>
                      </Bubble>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
            </MessageScroller>
          </MessageScrollerProvider>
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Icon.Sparkles className="size-7 opacity-50" />
            <p className="max-w-sm text-xs leading-relaxed">
              LLM 台：一次一个 prompt，逐字流式返回。
              <br />
              跑完右侧「运行记录」会多一条 LLM 记录，含首字延迟与总耗时。
            </p>
          </div>
        )}
      </div>

      {running && !live ? (
        <div className="text-muted-foreground flex items-center gap-2 px-1 text-[11px]">
          <Spinner className="size-3.5" /> 等待首个 token…
        </div>
      ) : null}
    </div>
  )
}
