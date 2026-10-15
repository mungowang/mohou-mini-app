
import { useEffect, useRef, useState } from 'react'

import { useLabels } from '@mohou/ui/i18n/context'
import { useHtmlDark } from '@mohou/ui/hooks/use-html-dark'
import { cn } from '@mohou/ui/lib/utils'

type LangS = 'js' | 'ts' | 'json' | 'html' | 'md'

type EditorViewT = {
  destroy(): void
  dispatch(t: object): void
  state: { doc: { toString(): string; length: number } }
}

function bare<T extends object>(m: T & { default?: T }): T {
  return (m.default ?? m) as T
}

/**
 * Vanilla CodeMirror 6 loaded on demand from `esm.sh` (not npm, not a React wrapper).
 * Do not import `@codemirror/*` or `@uiw/react-codemirror` — the latter pulls a second React.
 * Highlighting needs `@codemirror/language` + a theme; lang packages only provide the parser.
 * Find uses `@codemirror/search` (Mod-f / Ctrl-f, next/prev, match case, regexp).
 * If the CDN fails the host stays empty (no editor), rather than requiring a peer install.
 * @when Editing config/scripts in-app. Do not `import @codemirror/*` or add it to package.json.
 * Soft wrap uses CodeMirror `EditorView.lineWrapping` when `lineWrapping` is true.
 * @example
 * <CodeEditor value={src} language="ts" lineWrapping onChange={(v) => set(v)} />
 * @family Discovery & inspect
 */
export function CodeEditor({
  value,
  onChange,
  language = 'ts',
  height = '220px',
  lineWrapping = false,
  className,
}: {
  value: string
  onChange?: ((value: string) => void) | undefined
  language?: LangS
  height?: string
  /** Soft-wrap long lines (`EditorView.lineWrapping`). Default off (horizontal scroll). */
  lineWrapping?: boolean
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorViewT | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(value)
  valueRef.current = value
  const [cm, setCm] = useState(false)
  const dark = useHtmlDark()
  const t = useLabels('codeEditor')

  useEffect(() => {
    if (!hostRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const [viewMod, stateMod, cmdMod, langMod, searchMod, jsLang, jsonLang, htmlLang, mdLang, themeMod] = await Promise.all([
          import('https://esm.sh/@codemirror/view@6'),
          import('https://esm.sh/@codemirror/state@6'),
          import('https://esm.sh/@codemirror/commands@6'),
          import('https://esm.sh/@codemirror/language@6'),
          import('https://esm.sh/@codemirror/search@6'),
          import('https://esm.sh/@codemirror/lang-javascript@6'),
          import('https://esm.sh/@codemirror/lang-json@6'),
          import('https://esm.sh/@codemirror/lang-html@6'),
          import('https://esm.sh/@codemirror/lang-markdown@6'),
          import('https://esm.sh/@codemirror/theme-one-dark@6'),
        ])
        if (cancelled || !hostRef.current) return
        const viewNs = bare(
          viewMod as {
            EditorView: unknown
            lineNumbers: () => unknown
            keymap: { of: (k: unknown) => unknown }
          },
        )
        const stateNs = bare(stateMod as {
          Prec: { highest: (ext: unknown) => unknown }
          EditorState: { phrases: { of: (map: Record<string, string>) => unknown } }
        })
        const cmdNs = bare(
          cmdMod as { defaultKeymap: unknown[]; history: () => unknown; historyKeymap: unknown[] },
        )
        const langNs = bare(
          langMod as {
            syntaxHighlighting: (s: unknown) => unknown
            defaultHighlightStyle: unknown
          },
        )
        const searchNs = bare(
          searchMod as {
            search: (o?: object) => unknown
            searchKeymap: unknown[]
            highlightSelectionMatches: () => unknown
            openSearchPanel: (view: EditorViewT) => boolean
          },
        )
        const EditorView = viewNs.EditorView as {
          new (o: object): EditorViewT
          lineWrapping: unknown
          updateListener: { of: (fn: (u: { docChanged: boolean }) => void) => unknown }
          theme: (spec: Record<string, Record<string, string>>) => unknown
          darkTheme: { of: (v: boolean) => unknown }
          // Capture before the window/page find handler.
          domEventHandlers: (h: {
            keydown?: (e: KeyboardEvent, v: EditorViewT) => boolean
          }) => unknown
        }
        const pick = (m: unknown, name: string): ((o?: object) => unknown) => {
          const n = bare(m as object & { default?: object }) as Record<string, unknown>
          const fn = n[name] ?? (n.default as Record<string, unknown> | undefined)?.[name]
          if (typeof fn !== 'function') throw new Error(`lang ${name} missing`)
          return fn as (o?: object) => unknown
        }
        const langs: Record<string, unknown> = {
          js: pick(jsLang, 'javascript')(),
          ts: pick(jsLang, 'javascript')({ typescript: true }),
          json: pick(jsonLang, 'json')(),
          html: pick(htmlLang, 'html')(),
          md: pick(mdLang, 'markdown')(),
        }
        const themeNs = bare(themeMod as { oneDark?: unknown; oneDarkHighlightStyle?: unknown })
        const chrome = EditorView.theme({
          '&': {
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            height: '100%',
          },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { caretColor: 'var(--foreground)' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
          '.cm-gutters': {
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
            border: 'none',
          },
          '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--muted) 55%, transparent)' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
          '.cm-panels': {
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            borderColor: 'var(--border)',
          },
          '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
          '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
          '.cm-search': {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            fontSize: '12px',
          },
          '.cm-textfield': {
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--foreground)',
            padding: '3px 8px',
            outline: 'none',
          },
          '.cm-button': {
            backgroundColor: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--foreground)',
            padding: '3px 8px',
            cursor: 'pointer',
          },
          '.cm-searchMatch': {
            backgroundColor: 'color-mix(in oklch, var(--primary) 28%, transparent)',
          },
          '.cm-searchMatch-selected': {
            backgroundColor: 'color-mix(in oklch, var(--primary) 48%, transparent)',
          },
        })
        const highlight = dark
          ? (themeNs.oneDark ?? langNs.syntaxHighlighting(themeNs.oneDarkHighlightStyle ?? langNs.defaultHighlightStyle))
          : langNs.syntaxHighlighting(langNs.defaultHighlightStyle)
        const view = new EditorView({
          parent: hostRef.current,
          doc: valueRef.current,
          extensions: [
            viewNs.lineNumbers(),
            ...lineWrapping ? [EditorView.lineWrapping] : [],
            cmdNs.history(),
            searchNs.search({ top: true }),
            searchNs.highlightSelectionMatches(),
            stateNs.EditorState.phrases.of({
              Find: t.find,
              Replace: t.replace,
              next: t.next,
              previous: t.previous,
              all: t.all,
              'match case': t.matchCase,
              regexp: t.regexp,
              'by word': t.byWord,
              replace: t.replaceOne,
              'replace all': t.replaceAll,
              close: t.close,
              'Go to line': t.goToLine,
              go: t.go,
              'current match': t.currentMatch,
              'on line': t.onLine,
            }),
            langs[language] ?? langs.ts,
            EditorView.darkTheme.of(dark),
            highlight,
            chrome,
            // Highest so Mod-f wins over browser/page find inside the iframe.
            stateNs.Prec.highest(viewNs.keymap.of([...(searchNs.searchKeymap ?? [])])),
            viewNs.keymap.of([...(cmdNs.defaultKeymap ?? []), ...(cmdNs.historyKeymap ?? [])]),
            EditorView.domEventHandlers({
              keydown(event, view) {
                if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'f') return false
                event.preventDefault()
                event.stopPropagation()
                return searchNs.openSearchPanel(view)
              },
            }),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) onChangeRef.current?.(view.state.doc.toString())
            }),
          ],
        })
        viewRef.current = view
        setCm(true)
      } catch (err) {
        console.warn('[CodeEditor] CodeMirror CDN failed', err)
      }
    })()
    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [language, dark, t, lineWrapping])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (value === cur) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      {!cm && (
        <textarea
          data-testid="code-editor"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          spellCheck={false}
          className={cn(
            'w-full resize-y overflow-auto bg-transparent px-3 py-2 font-mono text-xs leading-6 outline-none',
            lineWrapping ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
          )}
          style={{ height }}
        />
      )}
      <div
        ref={hostRef}
        data-testid={cm ? 'code-editor' : undefined}
        className={cn(
          'text-xs leading-6 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:h-full',
          !cm && 'hidden',
        )}
        // Fixed height (not only minHeight) so CM's h-full resolves after async mount.
        style={{ height: cm ? height : undefined, minHeight: cm ? height : 0 }}
      />
    </div>
  )
}
