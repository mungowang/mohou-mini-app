import { Settings } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { Dialog } from '../ui/dialog.tsx'
import type { McpCheckResult, McpServerDraft, PanelMcpFailure, PanelSettingsClient } from './client.ts'
import { mcpPresets, presetDraft, type McpPreset } from './mcp-presets.ts'

type Transport = 'stdio' | 'sse' | 'http'
type CheckMap = Readonly<Record<string, McpCheckResult>>

export interface Draft {
  readonly id: string
  readonly description: string
  readonly transport: Transport
  readonly command: string
  readonly args: string
  readonly url: string
  readonly env: string
  readonly headers: string
  readonly editing: string | undefined
}

const emptyDraft: Draft = {
  id: '',
  description: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
  editing: undefined,
}

/**
 * MCP settings. Cards show status and tools. Add, edit, paste, and import open a dialog.
 * A connection check does not write the file. Import writes only the servers the person keeps.
 * @param props - settings client and chrome locale
 */
export function McpSettings(props: {
  readonly client: PanelSettingsClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const [servers, setServers] = useState<McpServerDraft[]>([])
  const [unresolved, setUnresolved] = useState<readonly PanelMcpFailure[]>([])
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  const [paste, setPaste] = useState(false)
  const [candidates, setCandidates] = useState<readonly McpServerDraft[] | undefined>(undefined)
  const [queue, setQueue] = useState<readonly McpServerDraft[]>([])
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  const [checks, setChecks] = useState<CheckMap>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [alert, setAlert] = useState<'import' | 'save' | undefined>(undefined)
  const loaded = useRef(false)
  useEffect(() => {
    const list = props.client.listMcp
    if (list === undefined || loaded.current) return
    loaded.current = true
    void list().then(
      (listed) => {
        setServers([...listed.servers])
        setUnresolved([...listed.unresolved])
      },
      () => setLoadFailed(true),
    )
  }, [props.client.listMcp])
  if (props.client.listMcp === undefined) return <p className="text-sm text-muted-foreground">{label('mcp-empty')}</p>
  const write = (next: readonly McpServerDraft[]) => commit(props.client, next, setServers, setUnresolved, setAlert, setNotice, label)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="m-0">{label('section-mcp')}</h4>
          {servers.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{label('mcp-empty')}</p> : null}
          {unresolved.length === 0 ? null : <p className="mt-1 text-xs text-destructive">{label('mcp-unresolved-hint')}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button type="button" className="h-8 rounded-lg border bg-card px-3 text-sm" onClick={() => setPaste(true)}>{label('mcp-paste')}</button>
          <button type="button" className="h-8 rounded-lg border bg-card px-3 text-sm" onClick={() => { void pullSource(props.client, 'pi', setCandidates, setAlert) }}>{label('mcp-from-pi')}</button>
          <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border bg-card px-3 text-sm">
            {label('mcp-from-file')}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void readChosen(event.target.files?.[0], props.client, setCandidates, setAlert) }} />
          </label>
          <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setDraft(emptyDraft)}>{label('mcp-add')}</button>
        </div>
      </div>
      {props.client.writeMcp === undefined ? null : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{label('mcp-quick-add')}</span>
          {mcpPresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              data-preset={preset.id}
              className="h-8 rounded-lg border bg-card px-3 text-sm hover:bg-muted"
              onClick={() => { void openPreset(props.client, preset, setDraft, setNotice, label) }}
            >
              {preset.label}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">{label('mcp-quick-add-help')}</span>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-2 min-[720px]:grid-cols-2">
        {servers.map(server => (
          <ServerCard
            key={server.id}
            server={server}
            failure={unresolved.find(item => item.id === server.id)}
            check={checks[server.id]}
            busy={busy === server.id}
            label={label}
            onEdit={() => setDraft(toDraft(server))}
            onRemove={() => setRemoving(server.id)}
            onToggle={() => {
              const next = servers.map(item => item.id === server.id ? { ...item, enabled: item.enabled === false } : item)
              void write(next)
            }}
            onCheck={() => { void runCheck(props.client, server, setChecks, setBusy, setAlert) }}
          />
        ))}
      </ul>
      {loadFailed ? <p className="text-sm text-muted-foreground">{label('mcp-load-failed')}</p> : null}
      {notice.length > 0 ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {draft === undefined ? null : (
        <EditorDialog
          draft={draft}
          label={label}
          onChange={setDraft}
          onCancel={() => {
            setDraft(undefined)
            setQueue([])
          }}
          onSubmit={() => {
            void saveDraft(props.client, servers, draft, setServers, setUnresolved, setAlert, setNotice, label).then((ok) => {
              if (!ok) return
              const next = queue[0]
              setQueue(queue.slice(1))
              setDraft(next === undefined ? undefined : openImported(next, servers))
            })
          }}
          {...props.client.checkMcp === undefined ? {} : { onCheck: props.client.checkMcp }}
        />
      )}
      {paste ? (
        <PasteDialog
          label={label}
          onCancel={() => setPaste(false)}
          onPick={(server) => {
            setPaste(false)
            setDraft(openImported(server, servers))
          }}
          {...props.client.admitMcp === undefined ? {} : { admit: props.client.admitMcp }}
        />
      ) : null}
      {candidates === undefined ? null : (
        <PickDialog
          servers={candidates}
          label={label}
          onCancel={() => setCandidates(undefined)}
          onConfirm={(picked) => {
            if (picked.length === 0) return
            setCandidates(undefined)
            setQueue(picked.slice(1))
            setDraft(openImported(picked[0]!, servers))
          }}
        />
      )}
      {alert === undefined ? null : (
        <Dialog width="sm" onClose={() => setAlert(undefined)}>
          <p className="m-0 text-sm">{label(alert === 'import' ? 'mcp-import-none' : 'save-failed')}</p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setAlert(undefined)}>{label('confirm')}</button>
          </div>
        </Dialog>
      )}
      {removing === undefined ? null : (
        <ConfirmDialog
          label={label}
          title={label('delete-confirm')}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => { void write(servers.filter(item => item.id !== removing)).then((ok) => { if (ok) setRemoving(undefined) }) }}
        />
      )}
    </div>
  )
}

function ServerCard(props: {
  readonly server: McpServerDraft
  readonly check: McpCheckResult | undefined
  /** Set when the last boot left this server out, so the card says why instead of looking live. */
  readonly failure: PanelMcpFailure | undefined
  readonly busy: boolean
  readonly label: (key: string) => string
  readonly onEdit: () => void
  readonly onRemove: () => void
  readonly onToggle: () => void
  readonly onCheck: () => void
}): ReactNode {
  const enabled = props.server.enabled !== false
  const running = enabled && props.check?.ok === true
  const kind = transportOf(props.server)
  const tools = props.check?.ok === true ? props.check.tools : []
  const shown = tools.slice(0, 4)
  const extra = tools.length - shown.length
  const [openTool, setOpenTool] = useState<string | undefined>(undefined)
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{props.server.id}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Switch on={enabled} label={props.label('section-mcp')} onClick={props.onToggle} />
          <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={props.label('mcp-edit')} onClick={props.onEdit}>
            <Settings size={16} strokeWidth={2} />
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Status running={running} label={props.label(running ? 'mcp-running' : 'mcp-stopped')} />
        <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-[11px] leading-none text-muted-foreground">{props.label(transportKey(kind))}</span>
      </div>
      {props.server.description === undefined ? null : <p className="truncate text-xs text-muted-foreground">{props.server.description}</p>}
      {shown.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map(tool => (
            <button key={tool.name} type="button" className="inline-flex h-6 items-center rounded-full border px-2 text-[11px] leading-none hover:bg-muted" onClick={() => setOpenTool(tool.name)}>{tool.name}</button>
          ))}
          {extra > 0 ? (
            <button type="button" className="inline-flex h-6 items-center rounded-full px-2 text-[11px] leading-none text-muted-foreground hover:bg-muted" onClick={() => setOpenTool(tools[shown.length]?.name ?? tools[0]?.name)}>{countLabel(props.label('mcp-more'), extra)}</button>
          ) : null}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className="h-7 rounded-md px-2 text-xs hover:bg-muted" onClick={props.onCheck}>{props.busy ? '…' : props.label('mcp-check')}</button>
        <button type="button" className="h-7 rounded-md px-2 text-xs text-destructive hover:bg-muted" onClick={props.onRemove}>{props.label('delete')}</button>
      </div>
      {props.failure === undefined ? null : (
        <p className="m-0 text-xs text-destructive">{props.label('mcp-unstarted')}: {props.failure.message}</p>
      )}
      {props.check !== undefined && props.check.ok !== true ? <p className="text-xs text-destructive">{props.check.message ?? props.label('mcp-offline')}</p> : null}
      {openTool === undefined ? null : (
        <ToolsDialog
          title={props.server.id}
          tools={tools}
          selected={openTool}
          label={props.label}
          onSelect={setOpenTool}
          onClose={() => setOpenTool(undefined)}
        />
      )}
    </li>
  )
}

function ToolsDialog(props: {
  readonly title: string
  readonly tools: McpCheckResult['tools']
  readonly selected: string
  readonly label: (key: string) => string
  readonly onSelect: (name: string) => void
  readonly onClose: () => void
}): ReactNode {
  const tool = props.tools.find(item => item.name === props.selected) ?? props.tools[0]
  return (
    <Dialog width="wide" onClose={props.onClose}>
      <div className="flex h-[min(70vh,36rem)] min-h-[24rem] flex-col">
        <div>
          <h5 className="m-0 text-base font-semibold">{props.title}</h5>
          <p className="mt-1 text-xs text-muted-foreground">{`${props.tools.length} ${props.label('mcp-tools')}`}</p>
        </div>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-2xl border min-[720px]:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="max-h-48 overflow-auto border-b bg-muted/40 p-2 min-[720px]:max-h-none min-[720px]:border-r min-[720px]:border-b-0">
            {props.tools.map(item => (
              <li key={item.name}>
                <button
                  type="button"
                  className={item.name === tool?.name ? 'w-full rounded-lg bg-card px-3 py-2.5 text-left text-sm font-medium shadow-sm' : 'w-full rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-card/80'}
                  onClick={() => props.onSelect(item.name)}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          <section className="overflow-auto p-6">
            {tool === undefined ? null : (
              <>
                <p className="m-0 text-xs text-muted-foreground">{props.label('mcp-tools')}</p>
                <h6 className="mt-2 text-xl font-semibold tracking-tight">{tool.name}</h6>
                <p className="mt-4 text-sm leading-7 whitespace-pre-wrap text-muted-foreground">{tool.description ?? props.label('mcp-tool-empty')}</p>
                {tool.inputSchema === undefined ? null : <SchemaBlock caption={props.label('mcp-schema-input')} schema={tool.inputSchema} label={props.label} />}
                {tool.outputSchema === undefined ? null : <SchemaBlock caption={props.label('mcp-schema-output')} schema={tool.outputSchema} label={props.label} />}
              </>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * One declared schema: its top-level fields, then the schema the server sent.
 * @param props - caption, schema, and the label lookup
 */
function SchemaBlock(props: {
  readonly caption: string
  readonly schema: Record<string, unknown>
  readonly label: (key: string) => string
}): ReactNode {
  const fields = schemaFields(props.schema)
  return (
    <section className="mt-6">
      <p className="m-0 text-xs text-muted-foreground">{props.caption}</p>
      {fields.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{props.label('mcp-schema-no-fields')}</p>
      ) : (
        <ul className="mt-2 list-none space-y-2 p-0">
          {fields.map(field => (
            <li key={field.name} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-sm">{field.name}</span>
                <span className="text-[11px] text-muted-foreground">{field.type}</span>
                {field.required ? <span className="rounded-full border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">{props.label('mcp-schema-required')}</span> : null}
              </div>
              {field.description === undefined ? null : <p className="mt-1.5 mb-0 text-xs leading-6 text-muted-foreground">{field.description}</p>}
            </li>
          ))}
        </ul>
      )}
      <pre className="mt-3 max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-5 break-all whitespace-pre-wrap">{JSON.stringify(props.schema, null, 2)}</pre>
    </section>
  )
}

/** The top-level fields of an object schema, in the order the server declared them. */
function schemaFields(schema: Record<string, unknown>): readonly { name: string; type: string; required: boolean; description?: string }[] {
  const properties = recordValue(schema.properties)
  if (properties === undefined) return []
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []
  return Object.entries(properties).flatMap(([name, value]) => {
    const field = recordValue(value)
    if (field === undefined) return []
    return [{
      name,
      type: fieldType(field),
      required: required.includes(name),
      ...typeof field.description === 'string' && field.description.length > 0 ? { description: field.description } : {},
    }]
  })
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function fieldType(field: Record<string, unknown>): string {
  const declared = field.type
  if (typeof declared === 'string') return declared
  if (Array.isArray(declared)) {
    const names = declared.filter((item): item is string => typeof item === 'string')
    if (names.length > 0) return names.join(' | ')
  }
  if (field.properties !== undefined) return 'object'
  if (field.items !== undefined) return 'array'
  return 'any'
}

function EditorDialog(props: {
  readonly draft: Draft
  readonly label: (key: string) => string
  readonly onChange: (draft: Draft) => void
  readonly onCancel: () => void
  readonly onSubmit: () => void
  readonly onCheck?: (server: McpServerDraft) => Promise<McpCheckResult>
}): ReactNode {
  const set = (patch: Partial<Draft>) => props.onChange({ ...props.draft, ...patch })
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<McpCheckResult | undefined>(undefined)
  return (
    <Dialog onClose={props.onCancel}>
      <h5 className="m-0 text-sm font-semibold">{props.draft.editing === undefined ? props.label('mcp-new') : props.label('mcp-edit')}</h5>
      <p className="mt-4 mb-2 text-xs text-muted-foreground">{props.label('mcp-transport')}</p>
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        {(['stdio', 'sse', 'http'] as const).map(kind => (
          <button key={kind} type="button" className="h-7 rounded-md px-3 text-xs data-[on=1]:bg-foreground data-[on=1]:text-background" data-on={props.draft.transport === kind ? '1' : '0'} onClick={() => set({ transport: kind })}>{props.label(transportKey(kind))}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 min-[720px]:grid-cols-2">
        <Field label={props.label('mcp-name')} value={props.draft.id} hint={props.label('mcp-name-hint')} onChange={id => set({ id })} />
        <Field label={props.label('mcp-description')} value={props.draft.description} hint={props.label('mcp-desc-hint')} onChange={description => set({ description })} />
      </div>
      {props.draft.transport === 'stdio' ? (
        <div className="mt-3 grid gap-3 min-[720px]:grid-cols-2">
          <Field label={props.label('mcp-command')} value={props.draft.command} hint={props.label('mcp-command-hint')} onChange={command => set({ command })} />
          <Field label={props.label('mcp-args')} value={props.draft.args} hint={props.label('mcp-args-hint')} onChange={args => set({ args })} />
        </div>
      ) : <div className="mt-3"><Field label={props.label('mcp-url')} value={props.draft.url} hint={props.label('mcp-url-hint')} onChange={url => set({ url })} /></div>}
      {props.draft.transport === 'stdio' ? (
        <label className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
          {props.label('mcp-env')}
          <textarea className="min-h-24 rounded-lg border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none" placeholder={props.label('mcp-env-hint')} value={props.draft.env} onChange={event => set({ env: event.target.value })} />
          <span className="font-sans text-muted-foreground">{props.label('mcp-reference-hint')}</span>
        </label>
      ) : (
        <label className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
          {props.label('mcp-headers')}
          <textarea className="min-h-24 rounded-lg border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none" placeholder={props.label('mcp-headers-hint')} value={props.draft.headers} onChange={event => set({ headers: event.target.value })} />
          <span className="font-sans text-muted-foreground">{props.label('mcp-reference-hint')}</span>
        </label>
      )}
      {check === undefined ? null : (
        <div className="mt-3">
          {check.ok ? (
            <>
              <p className="m-0 text-sm text-primary">{countLabel(props.label('mcp-check-ok'), check.tools.length)}</p>
              {check.tools.length === 0 ? null : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {check.tools.slice(0, 8).map(tool => <span key={tool.name} className="rounded-full border px-2 py-0.5 text-[11px]">{tool.name}</span>)}
                </div>
              )}
            </>
          ) : <p className="m-0 text-sm text-destructive">{check.message ?? props.label('mcp-offline')}</p>}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {props.onCheck === undefined ? null : (
          <button type="button" className="mr-auto h-8 rounded-lg border px-3 text-sm disabled:opacity-60" disabled={busy} onClick={() => {
            const checkMcp = props.onCheck
            if (checkMcp === undefined) return
            void testDraft(props.draft, checkMcp, setBusy, setCheck, props.label)
          }}>{busy ? '…' : props.label('mcp-check')}</button>
        )}
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onCancel}>{props.label('cancel')}</button>
        <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={props.onSubmit}>{props.draft.editing === undefined ? props.label('mcp-add') : props.label('save')}</button>
      </div>
    </Dialog>
  )
}

function PasteDialog(props: {
  readonly label: (key: string) => string
  readonly admit?: (text: string) => Promise<readonly McpServerDraft[]>
  readonly onCancel: () => void
  readonly onPick: (server: McpServerDraft) => void
}): ReactNode {
  const [text, setText] = useState('')
  const [found, setFound] = useState<readonly McpServerDraft[] | undefined>(undefined)
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog onClose={props.onCancel}>
      <h5 className="m-0 text-sm font-semibold">{props.label('mcp-paste')}</h5>
      <textarea className="mt-3 min-h-36 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none" value={text} onChange={event => setText(event.target.value)} />
      {failed.length > 0 ? <p className="mt-2 text-sm text-destructive">{failed}</p> : null}
      {found === undefined ? null : (
        <ul className="mt-3 flex max-h-48 flex-col gap-1 overflow-auto">
          {found.map(server => (
            <li key={server.id}>
              <button type="button" className="flex w-full items-baseline gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => props.onPick(server)}>
                <span className="font-medium">{server.id}</span>
                <span className="text-xs text-muted-foreground">{props.label(transportKey(transportOf(server)))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onCancel}>{props.label('cancel')}</button>
        <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={busy || props.admit === undefined} onClick={() => {
          const admit = props.admit
          if (admit === undefined) return
          void recognizePaste(text, admit, setBusy, setFailed, setFound, props.onPick, props.label)
        }}>{busy ? '…' : props.label('mcp-admit')}</button>
      </div>
    </Dialog>
  )
}

function PickDialog(props: {
  readonly servers: readonly McpServerDraft[]
  readonly label: (key: string) => string
  readonly onCancel: () => void
  readonly onConfirm: (servers: readonly McpServerDraft[]) => void
}): ReactNode {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(props.servers.map(server => server.id)))
  const chosen = props.servers.filter(server => picked.has(server.id))
  return (
    <Dialog width="wide" onClose={props.onCancel}>
      <h5 className="m-0 text-base font-semibold">{props.label('mcp-pick')}</h5>
      <ul className="mt-4 grid max-h-[60vh] grid-cols-1 gap-2 overflow-auto min-[720px]:grid-cols-2">
        {props.servers.map(server => (
          <li key={server.id}>
            <label className="flex h-full items-start gap-3 rounded-xl border px-3 py-3 text-sm hover:bg-muted">
              <input className="mt-1" type="checkbox" checked={picked.has(server.id)} onChange={() => setPicked(toggleSet(picked, server.id))} />
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{server.id}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{props.label(transportKey(transportOf(server)))}</span>
                </span>
                {server.description === undefined ? null : <span className="mt-1 block text-xs leading-5 text-muted-foreground">{server.description}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onCancel}>{props.label('cancel')}</button>
        <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => props.onConfirm(chosen)}>{props.label('mcp-add')}</button>
      </div>
    </Dialog>
  )
}

function ConfirmDialog(props: {
  readonly title: string
  readonly label: (key: string) => string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}): ReactNode {
  return (
    <Dialog onClose={props.onCancel}>
      <p className="m-0 text-sm">{props.title}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={props.onCancel}>{props.label('cancel')}</button>
        <button type="button" className="h-8 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground" onClick={props.onConfirm}>{props.label('delete')}</button>
      </div>
    </Dialog>
  )
}

function Switch(props: { readonly on: boolean; readonly label: string; readonly onClick: () => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={props.on} aria-label={props.label} className={props.on ? 'relative h-5 w-9 rounded-full bg-foreground' : 'relative h-5 w-9 rounded-full bg-muted'} onClick={props.onClick}>
      <span className={props.on ? 'absolute top-0.5 left-4 size-4 rounded-full bg-background' : 'absolute top-0.5 left-0.5 size-4 rounded-full bg-background'} />
    </button>
  )
}

function Status(props: { readonly running: boolean; readonly label: string }): ReactNode {
  return (
    <span className={props.running ? 'inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/15 px-2 text-[11px] leading-none font-medium text-primary' : 'inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] leading-none text-muted-foreground'}>
      <i className={props.running ? 'size-1.5 rounded-full bg-primary' : 'size-1.5 rounded-full bg-muted-foreground'} />
      {props.label}
    </span>
  )
}

function countLabel(template: string, count: number): string {
  return template.replace('{n}', String(count))
}

function Field(props: {
  readonly label: string
  readonly value: string
  readonly hint: string
  readonly onChange: (value: string) => void
}): ReactNode {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {props.label}
      <input className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground outline-none" placeholder={props.hint} value={props.value} onChange={event => props.onChange(event.target.value)} />
    </label>
  )
}

function transportOf(server: McpServerDraft): Transport {
  if (server.url === undefined || server.url.length === 0) return 'stdio'
  return server.transport === 'sse' ? 'sse' : 'http'
}

function transportKey(kind: Transport): 'mcp-stdio' | 'mcp-sse' | 'mcp-http' {
  if (kind === 'sse') return 'mcp-sse'
  if (kind === 'http') return 'mcp-http'
  return 'mcp-stdio'
}

function toggleSet(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function toDraft(server: McpServerDraft): Draft {
  return {
    id: server.id,
    description: server.description ?? '',
    transport: transportOf(server),
    command: server.command ?? '',
    args: (server.args ?? []).join(' '),
    url: server.url ?? '',
    env: Object.entries(server.env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    headers: Object.entries(server.headers ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    editing: server.id,
  }
}

/**
 * Open the form for one of our own servers, and make the credentials it references exist.
 * The form is not saved here: the person fills the credentials, checks the server, then saves.
 */
async function openPreset(
  client: PanelSettingsClient,
  preset: McpPreset,
  setDraft: (draft: Draft) => void,
  setNotice: (notice: string) => void,
  label: (key: string) => string,
): Promise<void> {
  setDraft(presetDraft(preset))
  const put = client.putCredential
  if (put === undefined) return
  const created: string[] = []
  for (const credential of preset.credentials) {
    try {
      await put(credential.name, credential.description)
      created.push(credential.name)
    } catch {
      // A credential that cannot be written is not a reason to refuse the form.
    }
  }
  if (created.length > 0) setNotice(`${label('mcp-preset-credentials')} ${created.join(', ')}`)
}

function fromDraft(draft: Draft): McpServerDraft {
  const env = envOf(draft.env)
  const headers = envOf(draft.headers)
  const description = draft.description.trim()
  const base = {
    id: draft.id.trim(),
    ...description.length > 0 ? { description } : {},
  }
  if (draft.transport === 'stdio') {
    const args = draft.args.split(/\s+/).filter(item => item.length > 0)
    return {
      ...base,
      ...draft.command.trim().length > 0 ? { command: draft.command.trim() } : {},
      ...args.length > 0 ? { args } : {},
      ...Object.keys(env).length > 0 ? { env } : {},
    }
  }
  return {
    ...base,
    ...draft.url.trim().length > 0 ? { url: draft.url.trim() } : {},
    transport: draft.transport === 'sse' ? 'sse' : 'streamable-http',
    ...Object.keys(headers).length > 0 ? { headers } : {},
  }
}

function envOf(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const at = trimmed.indexOf('=')
    if (at <= 0) continue
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1)
  }
  return env
}

function openImported(server: McpServerDraft, existing: readonly McpServerDraft[]): Draft {
  const draft = toDraft(server)
  return existing.some(item => item.id === server.id) ? draft : { ...draft, editing: undefined }
}

async function saveDraft(
  client: PanelSettingsClient,
  servers: readonly McpServerDraft[],
  draft: Draft,
  setServers: (servers: McpServerDraft[]) => void,
  setUnresolved: (failures: readonly PanelMcpFailure[]) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
  setNotice: (message: string) => void,
  label: (key: string) => string,
): Promise<boolean> {
  const next = servers.filter(server => server.id !== draft.editing && server.id !== draft.id.trim()).concat(fromDraft(draft))
  return commit(client, next, setServers, setUnresolved, setAlert, setNotice, label)
}

async function commit(
  client: PanelSettingsClient,
  servers: readonly McpServerDraft[],
  setServers: (servers: McpServerDraft[]) => void,
  setUnresolved: (failures: readonly PanelMcpFailure[]) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
  setNotice: (message: string) => void,
  label: (key: string) => string,
): Promise<boolean> {
  if (client.writeMcp === undefined) return false
  if (servers.some(server => server.id.length === 0)) {
    setAlert('save')
    return false
  }
  try {
    const written = await client.writeMcp(servers)
    setServers([...servers])
    // The write resolved the file: what it left out is the current answer, not boot's.
    setUnresolved([...written.unresolved])
    setAlert(undefined)
    setNotice(label('mcp-saved'))
    return true
  } catch {
    setAlert('save')
    return false
  }
}

async function testDraft(
  draft: Draft,
  checkMcp: (server: McpServerDraft) => Promise<McpCheckResult>,
  setBusy: (busy: boolean) => void,
  setCheck: (result: McpCheckResult) => void,
  label: (key: string) => string,
): Promise<void> {
  const server = fromDraft(draft)
  if (server.id.length === 0) {
    setCheck({ ok: false, tools: [], message: label('mcp-need-name') })
    return
  }
  setBusy(true)
  try {
    setCheck(await checkMcp(server))
  } catch (error) {
    setCheck({
      ok: false,
      tools: [],
      message: error instanceof Error && error.message.length > 0 ? error.message : label('mcp-offline'),
    })
  } finally {
    setBusy(false)
  }
}

async function runCheck(
  client: PanelSettingsClient,
  server: McpServerDraft,
  setChecks: (value: CheckMap | ((current: CheckMap) => CheckMap)) => void,
  setBusy: (id: string) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
): Promise<void> {
  if (client.checkMcp === undefined) return
  setBusy(server.id)
  try {
    const result = await client.checkMcp(server)
    setChecks(current => ({ ...current, [server.id]: result }))
  } catch {
    setAlert('save')
  } finally {
    setBusy('')
  }
}

async function pullSource(
  client: PanelSettingsClient,
  source: string,
  onCandidates: (servers: readonly McpServerDraft[]) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
): Promise<void> {
  if (client.importMcp === undefined) return
  try {
    const listed = await client.importMcp(source)
    if (listed.length === 0) {
      setAlert('import')
      return
    }
    onCandidates(listed)
  } catch {
    setAlert('import')
  }
}

async function recognizePaste(
  text: string,
  admit: (text: string) => Promise<readonly McpServerDraft[]>,
  setBusy: (busy: boolean) => void,
  setFailed: (message: string) => void,
  setFound: (servers: readonly McpServerDraft[]) => void,
  onPick: (server: McpServerDraft) => void,
  label: (key: string) => string,
): Promise<void> {
  setBusy(true)
  setFailed('')
  try {
    const listed = await admit(text)
    if (listed.length === 0) {
      setFailed(label('mcp-import-none'))
      setFound([])
      return
    }
    if (listed.length === 1) {
      onPick(listed[0]!)
      return
    }
    setFound(listed)
  } catch {
    setFailed(label('mcp-import-none'))
  } finally {
    setBusy(false)
  }
}

async function admit(
  client: PanelSettingsClient,
  text: string,
  onCandidates: (servers: readonly McpServerDraft[]) => void,
  setPaste: (open: boolean) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
): Promise<void> {
  if (client.admitMcp === undefined) return
  try {
    const listed = await client.admitMcp(text)
    if (listed.length === 0) {
      setAlert('import')
      return
    }
    onCandidates(listed)
    setPaste(false)
  } catch {
    setAlert('import')
  }
}

async function readChosen(
  file: File | undefined,
  client: PanelSettingsClient,
  onCandidates: (servers: readonly McpServerDraft[]) => void,
  setAlert: (alert: 'import' | 'save' | undefined) => void,
): Promise<void> {
  if (file === undefined) return
  await admit(client, await file.text(), onCandidates, () => undefined, setAlert)
}
