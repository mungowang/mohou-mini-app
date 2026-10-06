import { useEffect, useState } from 'react'

import { Button, Icon, ScrollArea, StatusBadge, cn, useApp } from '@mohou/ui'

import type { RunRecall } from '../shared/events'
import { GLASS, WELL, ms } from './glass'

type ShellChoice = 'auto' | 'bash' | 'pwsh'

type Outcome = {
  shell: string
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

const SHELLS: { value: ShellChoice; label: string; hint: string }[] = [
  { value: 'auto', label: 'auto', hint: '按平台：macOS/Linux 用 bash，Windows 用 pwsh' },
  { value: 'bash', label: 'bash', hint: 'POSIX shell；Windows 上通常不可用' },
  { value: 'pwsh', label: 'pwsh', hint: 'PowerShell；Windows 上依次尝试 pwsh、powershell.exe' },
]

/**
 * `ctx.bash` / `ctx.pwsh`, driven by hand. The two are different shells, so the choice is explicit
 * and `auto` reads the platform rather than guessing from a failure.
 */
export function ShellRegion({ onRan, recall }: { onRan: () => void; recall?: RunRecall }) {
  const { call } = useApp()
  const [choice, setChoice] = useState<ShellChoice>('auto')
  const [command, setCommand] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The rail's button fills this box so a command can be run again without retyping it.
  useEffect(() => {
    if (recall === undefined) return
    setCommand(recall.record.input)
    const source = recall.record.source
    setChoice(source === 'bash' || source === 'pwsh' ? source : 'auto')
  }, [recall])

  async function run() {
    if (command.trim().length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = (await call('shell', { command, shell: choice })) as Outcome
      setOutcome(result)
      onRan()
    } catch (cause) {
      setOutcome(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-col gap-2 p-3" style={WELL}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon.Terminal className="text-muted-foreground size-4" />
          {SHELLS.map(item => (
            <button
              key={item.value}
              type="button"
              title={item.hint}
              onClick={() => { setChoice(item.value) }}
              className={cn(
                'rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors',
                item.value === choice
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
          <span className="text-muted-foreground ml-auto font-mono text-[10px]">
            {SHELLS.find(item => item.value === choice)?.hint}
          </span>
        </div>
        <textarea
          value={command}
          spellCheck={false}
          placeholder="df -k / | tail -1   /   Get-PSDrive -PSProvider FileSystem"
          onChange={(e) => { setCommand(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void run()
            }
          }}
          className="min-h-[5.5rem] w-full resize-y rounded-xl border-0 bg-transparent px-3 py-2 font-mono text-xs outline-none"
          style={GLASS}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || command.trim().length === 0} onClick={() => void run()}>
            {busy ? '运行中…' : '运行'}
          </Button>
          <span className="text-muted-foreground font-mono text-[10px]">⌘/Ctrl + Enter</span>
        </div>
      </div>

      {error !== null ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {outcome !== null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" style={WELL}>
          <div className="flex items-center gap-2">
            <StatusBadge status={outcome.exitCode === 0 ? 'done' : 'error'} />
            <span className="text-muted-foreground font-mono text-[10px]">
              exit {outcome.exitCode} · {outcome.shell} · {ms(outcome.durationMs)}
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <pre className="px-1 font-mono text-[11px] whitespace-pre-wrap">{outcome.stdout || '(标准输出为空)'}</pre>
            {outcome.stderr.length > 0 ? (
              <pre className="mt-2 px-1 font-mono text-[11px] whitespace-pre-wrap text-destructive">
                {outcome.stderr}
              </pre>
            ) : null}
          </ScrollArea>
        </div>
      ) : null}
    </div>
  )
}
