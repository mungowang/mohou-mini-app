import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react'

import { Button, Icon, Input, Markdown, Textarea, cn, useApp } from '@mohou/ui'

import type { RunRecall } from '../shared/events'
import { CHIP, GLASS, WELL, ms } from './glass'

type Mode = 'data' | 'path'
type Held = { mimeType: string; data: string; preview: string; name: string }

const DEFAULT_PROMPT = 'You are an OCR engine. Keep layout structure as close as possible with monospace-style spacing. Do not add explanation.'

/**
 * Two ways into `ctx.llm` images. Paste and the file picker are bytes. A path is left for the host to read.
 */
export function VisionRegion({
  runtime,
  onRan,
  recall,
}: {
  runtime: { provider: string | null; model: string | null }
  onRan: () => void
  recall?: RunRecall
}) {
  const { streamCall, call } = useApp()
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('data')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [path, setPath] = useState('')
  const [held, setHeld] = useState<Held | null>(null)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  useEffect(() => {
    setProvider(prev => prev || (runtime.provider ?? ''))
    setModel(prev => prev || (runtime.model ?? ''))
  }, [runtime.provider, runtime.model])

  useEffect(() => {
    if (recall === undefined) return
    setPrompt(recall.record.title || DEFAULT_PROMPT)
    const input = recall.record.input
    if (input.startsWith('/') || input.startsWith('file:')) {
      setMode('path')
      setPath(input)
      setHeld(null)
    }
  }, [recall])

  async function take(file: File) {
    const read = await readImage(file)
    setHeld(read)
    setError(null)
    setMode('data')
  }

  function acceptPaste(event: ClipboardEvent) {
    if (root.current?.closest('[hidden]')) return
    const file = imageFileFromClipboard(event.clipboardData)
    if (!file) return
    event.preventDefault()
    void take(file)
  }

  const acceptPasteRef = useRef(acceptPaste)
  acceptPasteRef.current = acceptPaste

  // ⌘V and Ctrl+V both fire paste. A box that is not focused never sees that event.
  useEffect(() => {
    const node = root.current?.ownerDocument
    if (!node) return
    const onPaste = (event: Event) => { acceptPasteRef.current(event as ClipboardEvent) }
    node.addEventListener('paste', onPaste)
    return () => { node.removeEventListener('paste', onPaste) }
  }, [])

  const ready = mode === 'path' ? path.trim().length > 0 : held !== null

  async function send() {
    if (!ready || running) return
    const at = Date.now()
    setError(null)
    setAnswer('')
    setDurationMs(null)
    setRunning(true)
    const args: Record<string, unknown> = {
      prompt: prompt.trim() || DEFAULT_PROMPT,
      mode,
    }
    if (provider.trim()) args.provider = provider.trim()
    if (model.trim()) args.model = model.trim()
    if (mode === 'path') args.path = path.trim()
    else if (held) {
      args.mimeType = held.mimeType
      args.data = held.data
    }
    const pending = streamCall('recognize', args)
    let text = ''
    try {
      for await (const chunk of pending) {
        if (typeof chunk !== 'string' || chunk.length === 0) continue
        text += chunk
        setAnswer(text)
      }
      const summary = (await pending) as { durationMs?: number } | undefined
      setDurationMs(summary?.durationMs ?? Date.now() - at)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
      onRan()
    }
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 p-3" style={GLASS}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon.Image className="text-muted-foreground size-4" />
          {(['data', 'path'] as const).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => { setMode(item) }}
              className={cn(
                CHIP,
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                item === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {item === 'data' ? '粘贴' : '文件路径'}
            </button>
          ))}
          <span className="text-muted-foreground ml-auto font-mono text-[10px]">
            {mode === 'data' ? '浏览器里的图，走 data' : '绝对路径或 file: URI，Host 读取'}
          </span>
        </div>

        {mode === 'data' ? (
          <div
            tabIndex={0}
            onPaste={(event: ReactClipboardEvent) => { acceptPaste(event.nativeEvent) }}
            onDragOver={(event) => { event.preventDefault() }}
            onDrop={(event) => {
              event.preventDefault()
              const file = imageFileFromList(event.dataTransfer.files)
              if (file) void take(file)
            }}
            className="flex min-h-28 flex-col items-center justify-center gap-2 px-3 py-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            style={WELL}
          >
            {held ? (
              <img src={held.preview} alt="" className="max-h-40 max-w-full rounded-md object-contain" />
            ) : (
              <p className="text-muted-foreground text-xs">⌘V 或 Ctrl+V 粘贴图片，也可以拖进来或选择文件。选择框只交出字节，不是路径。</p>
            )}
            <label className={cn(CHIP, 'text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1 text-[11px]')} style={WELL}>
              选择图片
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void take(file)
                  event.target.value = ''
                }}
              />
            </label>
            {held ? <span className="text-muted-foreground font-mono text-[10px]">{held.name} · {held.mimeType}</span> : null}
          </div>
        ) : (
          <Input
            value={path}
            placeholder="/absolute/path.png 或 file:///…"
            onChange={(event) => { setPath(event.target.value) }}
            className="h-8 font-mono text-[11px]"
          />
        )}

        <Textarea
          value={prompt}
          rows={2}
          onChange={(event) => { setPrompt(event.target.value) }}
          className="resize-none text-sm"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={provider}
            placeholder={runtime.provider ?? 'provider'}
            onChange={(event) => { setProvider(event.target.value) }}
            className="h-7 w-28 font-mono text-[11px]"
          />
          <Input
            value={model}
            placeholder={runtime.model ?? 'model'}
            onChange={(event) => { setModel(event.target.value) }}
            className="h-7 w-40 font-mono text-[11px]"
          />
          <span className="text-muted-foreground ml-auto font-mono text-[10px]">{ms(durationMs)}</span>
          {running ? (
            <Button size="sm" variant="outline" onClick={() => void call('cancel', {})}>
              <Icon.Square className="size-3.5" /> 停止
            </Button>
          ) : (
            <Button size="sm" disabled={!ready} onClick={() => void send()}>
              <Icon.Scan className="size-3.5" /> 识别
            </Button>
          )}
        </div>

        {error ? (
          <div className="text-destructive flex items-start gap-2 px-2.5 py-1.5 text-[11px]" style={WELL}>
            <Icon.AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm" style={WELL}>
        {answer ? <Markdown>{answer}</Markdown> : (
          <p className="text-muted-foreground text-xs">识别结果会出现在这里。</p>
        )}
      </div>
    </div>
  )
}

function imageFileFromList(files: FileList | readonly File[] | null): File | null {
  if (!files) return null
  for (const file of files) {
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file
  }
  return null
}

/** WKWebView often puts the image in `files`. WebView2 often puts it in `items`. */
function imageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null
  const fromFiles = imageFileFromList(data.files)
  if (fromFiles) return fromFiles
  for (const item of data.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

function readImage(file: File): Promise<Held> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = reader.result
      const preview = typeof raw === 'string' ? raw : ''
      const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(preview)
      const mimeType = match?.[1]
      const data = match?.[2]?.replace(/\s/g, '')
      if (!mimeType || !data) {
        reject(new Error('读不到图片数据'))
        return
      }
      resolve({ mimeType, data, preview, name: file.name || 'paste' })
    }
    reader.onerror = () => { reject(reader.error ?? new Error('读取失败')) }
    reader.readAsDataURL(file)
  })
}
