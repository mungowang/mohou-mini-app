
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { diffLines } from 'diff'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@mohou/ui/components/button'
import { useHtmlDark } from '@mohou/ui/hooks/use-html-dark'
import { useLabels } from '@mohou/ui/i18n/context'
import { cn } from '@mohou/ui/lib/utils'

type Row = {
  type: 'equal' | 'add' | 'del'
  text: string
  left?: number | undefined
  right?: number | undefined
}

type Token = { content: string; color?: string | undefined }

function toRows(original: string, modified: string): Row[] {
  const parts = diffLines(original, modified)
  const rows: Row[] = []
  let left = 1
  let right = 1
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const text of lines) {
      if (part.added) {
        rows.push({ type: 'add', text, right: right++ })
      } else if (part.removed) {
        rows.push({ type: 'del', text, left: left++ })
      } else {
        rows.push({ type: 'equal', text, left: left++, right: right++ })
      }
    }
  }
  return rows
}

function stats(rows: Row[]) {
  return {
    added: rows.filter(row => row.type === 'add').length,
    removed: rows.filter(row => row.type === 'del').length,
  }
}

type Hunk = { start: number; end: number; add: number; del: number }

/** Consecutive changed lines are one site. Equal lines split sites. */
function hunks(rows: Row[]): Hunk[] {
  const sites: Hunk[] = []
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.type === 'equal') continue
    const start = index
    let add = 0
    let del = 0
    while (index < rows.length && rows[index]?.type !== 'equal') {
      if (rows[index]?.type === 'add') add += 1
      else del += 1
      index += 1
    }
    sites.push({ start, end: index - 1, add, del })
    index -= 1
  }
  return sites
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function lineToHtml(tokens: Token[]): string {
  return tokens
    .map(t =>
      t.color
        ? `<span style="color:${escapeHtml(t.color)}">${escapeHtml(t.content)}</span>`
        : escapeHtml(t.content),
    )
    .join('')
}

function langFromFile(name?: string): string {
  const ext = name?.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    json: 'json',
    html: 'html',
    md: 'md',
    css: 'css',
  }
  return (ext && map[ext]) || 'ts'
}

function Gutter({ n }: { n?: number | undefined }) {
  return (
    <span className="w-8 shrink-0 pr-2 text-right text-[11px] text-muted-foreground/70 select-none">
      {n ?? ''}
    </span>
  )
}

function Line({
  row,
  side,
  html,
  rowIndex,
}: {
  row: Row
  side?: 'left' | 'right' | undefined
  html?: string | undefined
  rowIndex?: number | undefined
}) {
  const hidden =
    (side === 'left' && row.type === 'add') ||
    (side === 'right' && row.type === 'del')
  const mark = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '
  return (
    <div
      data-diff-row={rowIndex}
      className={cn(
        'flex px-2',
        hidden && 'bg-muted/40',
        !hidden && row.type === 'add' && 'bg-emerald-500/15',
        !hidden && row.type === 'del' && 'bg-destructive/10',
        !html && !hidden && row.type === 'add' && 'text-emerald-800 dark:text-emerald-300',
        !html && !hidden && row.type === 'del' && 'text-destructive',
      )}
    >
      {side !== 'right' ? <Gutter n={hidden ? undefined : row.left} /> : null}
      {side !== 'left' ? <Gutter n={hidden ? undefined : row.right} /> : null}
      <span className="w-4 shrink-0 select-none">{hidden ? ' ' : mark}</span>
      {hidden ? (
        <span className="min-w-0 flex-1" />
      ) : html ? (
        <span
          className="min-w-0 flex-1 whitespace-pre-wrap break-all"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{row.text}</span>
      )}
    </div>
  )
}

function scrollToRow(node: HTMLElement, index: number) {
  const line = node.querySelector(`[data-diff-row="${index}"]`)
  if (line instanceof HTMLElement) line.scrollIntoView({ block: 'center' })
}

/** First row still crossing the top of the scroller. A zero layout reads as the top row. */
function visibleRow(node: HTMLElement): number {
  const top = node.getBoundingClientRect().top
  const lines = node.querySelectorAll('[data-diff-row]')
  for (const line of lines) {
    if (!(line instanceof HTMLElement)) continue
    if (line.getBoundingClientRect().bottom > top + 1) {
      const index = Number(line.dataset.diffRow)
      return Number.isNaN(index) ? 0 : index
    }
  }
  return 0
}

function stepTarget(sites: Hunk[], anchor: number, direction: -1 | 1): number | null {
  if (direction > 0) return sites.find(site => site.start > anchor)?.start ?? null
  let previous: number | null = null
  for (const site of sites) {
    if (site.start < anchor) previous = site.start
    else break
  }
  return previous
}

function HunkJump({
  rows,
  scroller,
}: {
  rows: Row[]
  scroller: RefObject<HTMLDivElement | null>
}) {
  const sites = hunks(rows)
  const labels = useLabels('diffViewer')
  const [anchor, setAnchor] = useState(0)

  useEffect(() => {
    const node = scroller.current
    if (!node || sites.length === 0) return
    const sync = () => setAnchor(visibleRow(node))
    sync()
    node.addEventListener('scroll', sync)
    return () => node.removeEventListener('scroll', sync)
  }, [scroller, rows, sites.length])

  if (sites.length === 0) return null

  function go(direction: -1 | 1) {
    const node = scroller.current
    if (!node) return
    const target = stepTarget(sites, visibleRow(node), direction)
    if (target === null) return
    scrollToRow(node, target)
    setAnchor(target)
  }

  return (
    <span data-testid="diff-hunks" data-hunks={sites.length} className="inline-flex items-center gap-0.5">
      <span className="px-1 tabular-nums text-muted-foreground">{labels.sites(sites.length)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={labels.previous}
        disabled={stepTarget(sites, anchor, -1) === null}
        onClick={() => go(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={labels.next}
        disabled={stepTarget(sites, anchor, 1) === null}
        onClick={() => go(1)}
      >
        <ChevronDown />
      </Button>
    </span>
  )
}

function Overview({
  rows,
  scroller,
}: {
  rows: Row[]
  scroller: RefObject<HTMLDivElement | null>
}) {
  const sites = hunks(rows)
  const labels = useLabels('diffViewer')
  const [view, setView] = useState({ top: 0, height: 1 })

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const sync = () => {
      const span = node.scrollHeight || 1
      setView({
        top: node.scrollTop / span,
        height: Math.min(1, node.clientHeight / span),
      })
    }
    sync()
    node.addEventListener('scroll', sync)
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => {
      node.removeEventListener('scroll', sync)
      observer.disconnect()
    }
  }, [scroller, rows])

  if (sites.length === 0) return null

  function jump(event: MouseEvent<HTMLButtonElement>) {
    const node = scroller.current
    if (!node) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height
    const index = Math.min(rows.length - 1, Math.max(0, Math.floor(ratio * rows.length)))
    scrollToRow(node, index)
  }

  return (
    <button
      type="button"
      data-testid="diff-overview"
      data-hunks={sites.length}
      aria-label={labels.overview(sites.length)}
      className="relative w-3 shrink-0 border-l bg-muted/40"
      onClick={jump}
    >
      {sites.map(site => {
        const span = Math.max(site.end - site.start + 1, 1)
        const kind = site.add > 0 && site.del > 0 ? 'mixed' : site.add > 0 ? 'add' : 'del'
        return (
          <span
            key={site.start}
            data-diff-mark={kind}
            className={cn(
              'absolute inset-x-0.5 min-h-[4px] rounded-sm',
              kind === 'add' && 'bg-emerald-500',
              kind === 'del' && 'bg-destructive',
              kind === 'mixed' && 'bg-gradient-to-b from-destructive to-emerald-500',
            )}
            style={{
              top: `${(site.start / rows.length) * 100}%`,
              height: `${Math.max((span / rows.length) * 100, 1.2)}%`,
            }}
          />
        )
      })}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 border border-foreground/30 bg-foreground/10"
        style={{ top: `${view.top * 100}%`, height: `${Math.max(view.height * 100, 6)}%` }}
      />
    </button>
  )
}

/**
 * Unified or split diff view. The header names how many change sites there are and steps between them. A ruler on the right marks each site. A click scrolls to it.
 * @when Comparing two versions of text. Pass `original` + `modified` strings.
 * @example
 * <DiffViewer original={a} modified={b} language="ts" mode="split" />
 * @family Discovery & inspect
 */
export function DiffViewer({
  original,
  modified,
  mode = 'unified',
  fileName,
  language,
}: {
  original: string
  modified: string
  mode?: 'unified' | 'split' | undefined
  fileName?: string | undefined
  language?: string | undefined
}) {
  const rows = toRows(original, modified)
  const { added, removed } = stats(rows)
  const lang = language ?? langFromFile(fileName)
  const [hi, setHi] = useState<{ orig: string[]; mod: string[] } | null>(null)
  const dark = useHtmlDark()
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const shiki = (await import('https://esm.sh/shiki@4.4.3')) as {
          codeToTokens?: (code: string | undefined, opts: object) => Promise<{ tokens: Token[][] }>
          default?: { codeToTokens?: (code: string | undefined, opts: object) => Promise<{ tokens: Token[][] }> }
        }
        const codeToTokens = shiki.codeToTokens ?? shiki.default?.codeToTokens
        if (!codeToTokens) throw new Error('shiki.codeToTokens missing')
        const theme = dark ? 'github-dark' : 'github-light'
        const [a, b] = await Promise.all([
          codeToTokens(original, { lang, theme }),
          codeToTokens(modified, { lang, theme }),
        ])
        if (cancelled) return
        setHi({
          orig: a.tokens.map(lineToHtml),
          mod: b.tokens.map(lineToHtml),
        })
      } catch (err) {
        console.warn('[DiffViewer] shiki CDN failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [original, modified, lang, dark])

  function htmlFor(row: Row): string | undefined {
    if (!hi) return undefined
    if (row.type === 'del') return hi.orig[(row.left ?? 1) - 1]
    if (row.type === 'add') return hi.mod[(row.right ?? 1) - 1]
    return hi.orig[(row.left ?? 1) - 1] ?? hi.mod[(row.right ?? 1) - 1]
  }

  return (
    <div
      data-testid="diff-viewer"
      data-mode={mode}
      className="overflow-hidden rounded-xl border bg-card font-mono text-xs leading-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="truncate text-muted-foreground">{fileName ?? 'diff'}</span>
        <span className="inline-flex items-center gap-2">
          <HunkJump rows={rows} scroller={scroller} />
          <span className="tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">+{added}</span>
            {' '}
            <span className="text-destructive">-{removed}</span>
          </span>
        </span>
      </div>
      <div className="flex max-h-[28rem] min-h-0">
        <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
          {mode === 'split' ? (
            <div className="grid grid-cols-2">
              <div className="border-r">
                {rows.map((row, index) => (
                  <Line key={`l${index}`} row={row} side="left" html={htmlFor(row)} rowIndex={index} />
                ))}
              </div>
              <div>
                {rows.map((row, index) => (
                  <Line key={`r${index}`} row={row} side="right" html={htmlFor(row)} />
                ))}
              </div>
            </div>
          ) : (
            rows.map((row, index) => (
              <Line key={index} row={row} html={htmlFor(row)} rowIndex={index} />
            ))
          )}
        </div>
        <Overview rows={rows} scroller={scroller} />
      </div>
    </div>
  )
}
