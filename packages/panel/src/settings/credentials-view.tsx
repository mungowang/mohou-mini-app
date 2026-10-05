import { KeyRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { Dialog } from '../ui/dialog.tsx'
import type { PanelCredential, PanelSettingsClient } from './client.ts'

interface Draft {
  readonly name: string
  readonly description: string
  readonly secret: string
  /** The name being replaced, when the form edits a row instead of adding one. */
  readonly editing: string | undefined
}

const emptyDraft: Draft = { name: '', description: '', secret: '', editing: undefined }

/**
 * Credentials settings. The list carries names and descriptions only: a secret is written once and
 * never read back, so the form has no field that can show an existing value.
 * A read-only store keeps the list and hides every write control.
 * @param props - settings client and chrome locale
 */
export function CredentialSettings(props: {
  readonly client: PanelSettingsClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
}): ReactNode {
  const label = (key: string) => panelText(props.locale, key, props.mode)
  const [rows, setRows] = useState<readonly PanelCredential[]>([])
  const [writable, setWritable] = useState(false)
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const [notice, setNotice] = useState('')
  const loaded = useRef(false)
  const read = props.client.readCredentials

  useEffect(() => {
    if (read === undefined || loaded.current) return
    loaded.current = true
    const client = props.client
    void read.call(client).then((next) => {
      setRows(next.credentials)
      setWritable(next.writable)
    }, () => setFailed(label('credentials-load-failed')))
  }, [read, props.client, label])

  if (read === undefined) return <p className="text-sm text-muted-foreground">{label('credentials-empty')}</p>

  const refresh = async (): Promise<void> => {
    const next = await read.call(props.client)
    setRows(next.credentials)
    setWritable(next.writable)
  }

  const save = async (value: Draft): Promise<void> => {
    const put = props.client.putCredential
    if (put === undefined) return
    setBusy(true)
    setFailed('')
    try {
      // Blank means "keep the stored secret": Host resolves it, and the panel has no value to send.
      const secret = value.secret.length === 0 ? undefined : value.secret
      await put.call(props.client, value.name.trim(), value.description.trim(), secret)
      await refresh()
      setDraft(undefined)
      setNotice(label(secret === undefined ? 'credentials-saved-description' : 'credentials-saved'))
    } catch {
      setFailed(label('credentials-save-failed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string): Promise<void> => {
    const drop = props.client.removeCredential
    setRemoving(undefined)
    if (drop === undefined) return
    setBusy(true)
    setFailed('')
    try {
      await drop.call(props.client, name)
      await refresh()
      setNotice('')
    } catch {
      setFailed(label('credentials-save-failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="m-0">{label('section-credentials')}</h4>
          {rows.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{label('credentials-empty')}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">{label('mcp-reference-hint')}</p>
        </div>
        {writable ? (
          <button type="button" className="h-8 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setDraft(emptyDraft)}>
            {label('credentials-add')}
          </button>
        ) : <span className="shrink-0 text-xs text-muted-foreground">{label('credentials-read-only')}</span>}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(row => (
          <li key={row.name} className="flex items-start gap-3 rounded-xl border bg-card px-3 py-2">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
              <KeyRound size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-medium">{row.name}</p>
              <p className="m-0 truncate text-xs text-muted-foreground">{row.description}</p>
              <p className="m-0 mt-1 font-mono text-[11px] text-muted-foreground">{label('credentials-reference').replace('{reference}', `\${credential:${row.name}}`)}</p>
            </div>
            {writable ? (
              <div className="flex shrink-0 gap-1">
                <button type="button" className="h-7 rounded-md px-2 text-xs hover:bg-muted" onClick={() => setDraft({ name: row.name, description: row.description, secret: '', editing: row.name })}>
                  {label('credentials-edit')}
                </button>
                <button type="button" className="h-7 rounded-md px-2 text-xs text-destructive hover:bg-muted" onClick={() => setRemoving(row.name)}>
                  {label('delete')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {notice.length > 0 ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {failed.length > 0 ? <p className="text-xs text-destructive">{failed}</p> : null}
      {draft === undefined ? null : (
        <Dialog onClose={() => setDraft(undefined)}>
          <h4 className="m-0">{label(draft.editing === undefined ? 'credentials-new' : 'credentials-edit')}</h4>
          <div className="mt-4 flex flex-col gap-3">
            <Field label={label('credentials-name')} hint={label('credentials-name-hint')} value={draft.name} disabled={draft.editing !== undefined} onChange={name => setDraft({ ...draft, name })} />
            <Field label={label('credentials-description')} hint={label('credentials-desc-hint')} value={draft.description} onChange={description => setDraft({ ...draft, description })} />
            <Field label={label('credentials-secret')} hint={label('credentials-secret-hint')} value={draft.secret} password onChange={secret => setDraft({ ...draft, secret })} />
            {draft.editing === undefined ? null : <p className="m-0 text-xs text-muted-foreground">{label('credentials-replace-hint')}</p>}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {draft.name.trim().length === 0
              ? <span className="mr-auto text-xs text-muted-foreground">{label('credentials-need-name')}</span>
              : draft.editing === undefined && draft.secret.length === 0
                ? <span className="mr-auto text-xs text-muted-foreground">{label('credentials-need-secret')}</span>
                : null}
            <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={() => setDraft(undefined)}>{label('cancel')}</button>
            <button
              type="button"
              className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={busy || draft.name.trim().length === 0 || (draft.editing === undefined && draft.secret.length === 0)}
              onClick={() => { void save(draft) }}
            >
              {label('credentials-save')}
            </button>
          </div>
        </Dialog>
      )}
      {removing === undefined ? null : (
        <Dialog width="sm" onClose={() => setRemoving(undefined)}>
          <p className="m-0 text-sm">{label('credentials-delete-confirm')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="h-8 rounded-lg border px-3 text-sm" onClick={() => setRemoving(undefined)}>{label('cancel')}</button>
            <button type="button" className="h-8 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground" onClick={() => { void remove(removing) }}>{label('delete')}</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Field(props: {
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly password?: boolean
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{props.label}</span>
      <input
        type={props.password === true ? 'password' : 'text'}
        className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground disabled:opacity-60"
        placeholder={props.hint}
        value={props.value}
        disabled={props.disabled === true}
        onChange={event => props.onChange(event.target.value)}
      />
    </label>
  )
}
