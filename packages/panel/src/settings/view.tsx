import { Check, ExternalLink, Loader2, Pencil, RefreshCw } from 'lucide-react'
import { useEffect, useReducer, useState, type ReactNode } from 'react'

import { galleryCardStyles, type GalleryCardStyle } from '../gallery/list.ts'
import { isPanelLocale, panelText, type PanelLabelMode, type PanelLocale } from '../labels.ts'
import { Dialog } from '../ui/dialog.tsx'
import type { PaletteChip } from '../theme/client.ts'
import { applyDocumentMode, paintHostStyle } from '../theme/menu.tsx'
import { AuthorMcpInstall } from './author-mcp-view.tsx'
import type { PanelAbout, PanelAuthorMcpStatus, PanelPolicy, PanelRuntime, PanelSettingsClient, PanelSkillStatus, PanelUpdateCheck, PanelUpdateSource } from './client.ts'
import { UpdateSourceChip } from './update-source.tsx'
import { CredentialSettings } from './credentials-view.tsx'
import { McpSettings } from './mcp-view.tsx'
import { SkillInstall } from './skill-install.tsx'
import { loadSettings, reduceSettings, settingsDraft, settingsState } from './state.ts'

/** The rail. Credentials appear only when Host exposes the read call, so a store-less host shows no entry. */
function sections(props: { readonly client?: PanelSettingsClient }): readonly SettingsSection[] {
  return props.client?.readCredentials === undefined
    ? ['appearance', 'network', 'agent', 'mcp', 'about']
    : ['appearance', 'network', 'agent', 'mcp', 'credentials', 'about']
}

type SettingsSection = 'appearance' | 'network' | 'agent' | 'mcp' | 'credentials' | 'about'

/**
 * Settings form. Hidden when Host exposes no config client. No route string lives here.
 * @param props - client, chrome locale, and the palette list for the appearance cards
 */
export function PanelSettings(props: {
  readonly client?: PanelSettingsClient
  readonly locale: PanelLocale
  readonly mode: PanelLabelMode
  readonly versions?: string
  readonly palettes?: readonly PaletteChip[]
  readonly cardStyle?: GalleryCardStyle
  readonly onCardStyle?: (style: GalleryCardStyle) => void
  readonly onClose?: () => void
  readonly onPolicy?: (policy: PanelPolicy) => void
  /** Live host policy from the theme menu (or other writers). */
  readonly hostPolicy?: PanelPolicy
  /** Preview chrome locale while the form is open (discard restores the saved locale). */
  readonly onPreviewLocale?: (locale: PanelLocale) => void
  readonly onUpdateOffer?: (update: PanelUpdateCheck) => void
}): ReactNode {
  const [state, dispatch] = useReducer(reduceSettings, undefined, settingsState)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [section, setSection] = useState<SettingsSection>('appearance')
  const [runtimes, setRuntimes] = useState<readonly PanelRuntime[]>([])
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [update, setUpdate] = useState<PanelUpdateCheck | 'checking' | 'failed' | undefined>(undefined)
  const [about, setAbout] = useState<PanelAbout | undefined>(undefined)
  const [restarting, setRestarting] = useState(false)
  const [portUnlocked, setPortUnlocked] = useState(false)
  useEffect(() => {
    if (section !== 'network') setPortUnlocked(false)
  }, [section])
  useEffect(() => {
    if (props.client === undefined) return
    void loadSettings(props.client, dispatch)
  }, [props.client])
  useEffect(() => {
    if (props.hostPolicy === undefined) return
    dispatch({ type: 'host-policy', policy: props.hostPolicy })
  }, [props.hostPolicy])
  useEffect(() => {
    // The source is a fact about this install, not a network answer, so it loads with the block.
    if (section !== 'about' || about !== undefined) return
    const read = props.client?.readAbout
    if (read === undefined) return
    void read().then(setAbout, () => undefined)
  }, [section, about, props.client])
  useEffect(() => {
    if (state.closed) props.onClose?.()
  }, [state.closed])
  useEffect(() => {
    const list = props.client?.listRuntimes
    if (list === undefined) return
    void list().then(setRuntimes, () => setRuntimes([]))
  }, [props.client])
  // Live preview: theme / palette / locale. Discard paths restore via fromPolicy then this effect.
  useEffect(() => {
    if (state.saved === undefined) return
    if (state.theme === 'light' || state.theme === 'dark' || state.theme === 'system') {
      applyDocumentMode(state.theme)
    }
    const chip = (props.palettes ?? []).find(item => item.id === state.palette)
    if (chip?.style !== undefined && chip.style.length > 0) paintHostStyle(chip.style)
    if (isPanelLocale(state.locale)) props.onPreviewLocale?.(state.locale)
  }, [state.theme, state.palette, state.locale, state.saved, props.palettes, props.onPreviewLocale])
  if (props.client === undefined) return null
  const labelLocale = isPanelLocale(state.locale) ? state.locale : props.locale
  const label = (key: string) => panelText(labelLocale, key, props.mode)
  const client = props.client
  const onSave = async () => {
    if (saveFeedback === 'saving') return
    setSaveFeedback('saving')
    const started = Date.now()
    const written = await saveSettings(client, state, dispatch)
    // Keep the in-progress spinner visible long enough to read (fast saves otherwise flash).
    const elapsed = Date.now() - started
    if (elapsed < 500) await new Promise(resolve => window.setTimeout(resolve, 500 - elapsed))
    if (written === undefined) {
      setSaveFeedback('idle')
      return
    }
    props.onPolicy?.(written)
    setSaveFeedback('saved')
    window.setTimeout(() => setSaveFeedback('idle'), 2000)
  }
  return (
    <form
      className="flex h-full flex-col bg-background text-foreground"
      data-dirty={state.dirty}
      data-closed={state.closed}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dispatch({ type: 'escape' })
      }}
    >
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="min-w-0">
          <h3>{label('settings')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex h-8 items-center rounded-lg px-3 text-sm hover:bg-muted" onClick={() => dispatch({ type: 'escape' })}>{label('settings-close')}</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-36 shrink-0 flex-col gap-1 border-r bg-card p-3">
          {sections(props).map(id => (
            <button key={id} type="button" className="rounded-lg px-2 py-1.5 text-left text-sm data-[on=1]:bg-muted data-[on=1]:font-medium" data-nav={id} data-on={section === id ? '1' : '0'} onClick={() => setSection(id)}>{label(`section-${id}`)}</button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {section === 'mcp' ? <McpSettings client={client} locale={labelLocale} mode={props.mode} /> : null}
          {section === 'credentials' ? <CredentialSettings client={client} locale={labelLocale} mode={props.mode} /> : null}
          {section === 'appearance' ? (<>
            <section className="mb-6">
              <h4>{label('section-appearance')}</h4>
              <div className="mb-4 flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">{label('language')}</span>
                <div className="flex max-w-xs gap-1 rounded-lg bg-muted p-1">
                  <button type="button" className="h-7 flex-1 rounded-md text-xs data-[on=1]:bg-card data-[on=1]:font-semibold data-[on=1]:shadow-sm" data-on={state.locale === 'zh-CN' ? '1' : '0'} onClick={() => dispatch({ type: 'edit-locale', locale: 'zh-CN' })}>{label('lang-zh')}</button>
                  <button type="button" className="h-7 flex-1 rounded-md text-xs data-[on=1]:bg-card data-[on=1]:font-semibold data-[on=1]:shadow-sm" data-on={state.locale === 'en' ? '1' : '0'} onClick={() => dispatch({ type: 'edit-locale', locale: 'en' })}>{label('lang-en')}</button>
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">{label('appearance')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['system', 'light', 'dark'] as const).map(theme => (
                    <button key={theme} type="button" className={choiceCardClass} data-on={state.theme === theme ? '1' : '0'} onClick={() => dispatch({ type: 'edit-theme', theme })}>
                      <span className={theme === 'dark' ? 'block h-10 rounded-lg bg-foreground/80' : theme === 'light' ? 'block h-10 rounded-lg border bg-background' : 'block h-10 rounded-lg bg-gradient-to-r from-background to-foreground/80'} />
                      <span className="text-xs data-[on=1]:font-semibold">{label(themeLabel(theme))}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">{label('palette')}</span>
                <input className="sr-only" value={state.palette} onChange={event => dispatch({ type: 'edit-palette', palette: event.target.value })} />
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(props.palettes ?? []).map((palette) => {
                    const chip = palettePreview(palette)
                    return (
                      <button key={palette.id} type="button" className={choiceCardClass} data-on={state.palette === palette.id ? '1' : '0'} onClick={() => dispatch({ type: 'edit-palette', palette: palette.id })}>
                        <span className="flex h-10 items-end gap-1 rounded-lg border border-border/60 px-2 pb-2" style={{ background: chip.surface }}>
                          <span className="h-5 flex-1 rounded-sm" style={{ background: chip.primary }} />
                          <span className="h-3 flex-1 rounded-sm" style={{ background: chip.muted }} />
                          <span className="h-4 w-3 rounded-sm border border-border/50" style={{ background: chip.card }} />
                        </span>
                        <span className="text-xs">{paletteLabel(labelLocale, palette)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {props.onCardStyle === undefined || props.cardStyle === undefined ? null : (
                <div className="mb-4 flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">{label('card-style')}</span>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {galleryCardStyles.map(style => (
                      <button key={style} type="button" className={choiceCardClass} aria-pressed={props.cardStyle === style} data-on={props.cardStyle === style ? '1' : '0'} onClick={() => props.onCardStyle?.(style)}>
                        <CardStylePreview style={style} />
                        <span className="text-xs">{label(cardKey(style))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>) : null}
          {section === 'network' ? (
            <section className="mb-6">
              <h4>{label('section-network')}</h4>
              <div className={state.portError ? 'mb-4 flex flex-col gap-2 text-destructive' : 'mb-4 flex flex-col gap-2'}>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground" htmlFor="settings-host-port">{label('port')}</label>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={portUnlocked ? label('port-lock') : label('port-edit')}
                    aria-pressed={portUnlocked}
                    onClick={() => { setPortUnlocked(open => !open) }}
                  >
                    <Pencil size={14} className={portUnlocked ? 'text-primary' : 'opacity-60'} />
                  </button>
                </div>
                <p className="m-0 max-w-xl text-xs leading-5 text-muted-foreground">{label('port-help')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-0">
                    <span className="flex h-9 items-center rounded-l-lg border bg-muted px-2 font-mono text-sm text-muted-foreground">127.0.0.1</span>
                    <span className="flex h-9 items-center border border-l-0 bg-muted px-1 font-mono text-sm text-muted-foreground">:</span>
                    <input
                      id="settings-host-port"
                      data-field="port"
                      readOnly={!portUnlocked}
                      className={portUnlocked
                        ? 'h-9 w-28 rounded-r-lg border border-l-0 bg-card px-3 font-mono text-sm outline-none'
                        : 'h-9 w-28 cursor-default rounded-r-lg border border-l-0 bg-muted px-3 font-mono text-sm text-muted-foreground outline-none'}
                      value={state.port}
                      onChange={(event) => {
                        if (!portUnlocked) return
                        dispatch({ type: 'edit-port', port: event.target.value })
                      }}
                    />
                  </div>
                  {hostOrigin(state.port) === undefined ? null : (
                    <a
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm text-primary hover:bg-muted"
                      href={hostOrigin(state.port)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      {label('port-open-panel')}
                    </a>
                  )}
                </div>
                {hostOrigin(state.port) === undefined ? null : (
                  <div className="mt-1 grid max-w-xl gap-1 text-xs text-muted-foreground">
                    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span>{label('port-panel-url')}</span>
                      <a className="font-mono text-foreground underline-offset-2 hover:underline" href={hostOrigin(state.port)} target="_blank" rel="noreferrer">{hostOrigin(state.port)}</a>
                    </p>
                    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span>{label('port-mcp-url')}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{`${hostOrigin(state.port)}/mcp`}</code>
                    </p>
                  </div>
                )}
                {state.portError ? <p className="text-xs text-muted-foreground">{label('port-invalid')}</p> : null}
              </div>
            </section>
          ) : null}
          {section === 'agent' ? (
            <AgentSection
              state={state}
              runtimes={runtimes}
              busy={runtimeBusy}
              restarting={restarting}
              label={label}
              onRuntime={(providerId) => {
                dispatch({ type: 'edit-provider', providerId })
                const first = runtimes.find(item => item.id === providerId)?.models[0]
                dispatch({ type: 'edit-model', provider: first?.provider ?? '', model: first?.models[0] ?? '' })
              }}
              onModel={(provider, model) => dispatch({ type: 'edit-model', provider, model })}
              onProbe={() => { void probeSettings(client, state.providerId, dispatch) }}
              onRefresh={() => {
                const list = client.listRuntimes
                if (list === undefined) return
                setRuntimeBusy(true)
                void list().then(setRuntimes, () => setRuntimes([])).finally(() => setRuntimeBusy(false))
              }}
              {...client.restartHost === undefined ? {} : {
                onRestart: () => {
                  void rebootHost(client, setRestarting, label, dispatch, hostOrigin(String(state.saved?.hostPort ?? state.port)))
                },
              }}
              {...client.readAbout === undefined ? {} : { readAbout: client.readAbout }}
              {...client.readSkill === undefined ? {} : { readSkill: client.readSkill }}
              {...client.installSkill === undefined ? {} : { installSkill: client.installSkill }}
              {...client.revealSkill === undefined ? {} : { revealSkill: client.revealSkill }}
              {...client.readAuthorMcp === undefined ? {} : { readAuthorMcp: client.readAuthorMcp }}
              {...client.installAuthorMcp === undefined ? {} : { installAuthorMcp: client.installAuthorMcp }}
              {...client.revealAuthorMcp === undefined ? {} : { revealAuthorMcp: client.revealAuthorMcp }}
            />
          ) : null}
          {section === 'about' ? (
            <AboutSection
              update={update}
              label={label}
              {...about?.source === undefined ? {} : { source: about.source }}
              {...props.versions === undefined ? {} : { versions: props.versions }}
              {...client.checkUpdate === undefined ? {} : { onCheck: () => { void readUpdate(client, setUpdate, props.onUpdateOffer) } }}
            />
          ) : null}
          {section === 'mcp' || section === 'about' ? null : state.saveError ? <p className="text-sm text-destructive">{state.saveMessage !== undefined && state.saveMessage.length > 0 ? state.saveMessage : label('save-failed')}</p> : null}
          {section === 'mcp' || section === 'about' || section === 'agent' || !state.restartRequired ? null : (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 text-sm text-primary">{label('restart-required')}</p>
                {client.restartHost === undefined ? null : (
                  <button type="button" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={restarting} onClick={() => { void rebootHost(client, setRestarting, label, dispatch, hostOrigin(String(state.saved?.hostPort ?? state.port))) }}>{restarting ? label('restart-wait') : label('restart-host')}</button>
                )}
              </div>
              {state.restartPort ? <p className="m-0 text-sm text-muted-foreground">{label('restart-mcp-hint')}</p> : null}
              {state.restartRuntime ? <p className="m-0 text-sm text-muted-foreground">{label('restart-runtime-hint')}</p> : null}
            </div>
          )}
          {state.pending === undefined ? null : (
            <Dialog width="sm" onClose={() => dispatch({ type: 'escape' })}>
              <p>{label('unsaved-confirm')}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => dispatch({ type: 'escape' })}>{label('cancel')}</button>
                <button type="button" className="go" onClick={() => dispatch({ type: 'confirm' })}>{label('confirm')}</button>
              </div>
            </Dialog>
          )}
        </div>
      </div>
      {section === 'mcp' || section === 'about' ? null : <footer className="flex items-center justify-between border-t bg-card px-4 py-3">
        <div className="flex gap-2">
          <button type="button" className="h-8 rounded-lg border px-3 text-sm hover:bg-muted" onClick={() => dispatch({ type: 'restore' })}>{label('restore')}</button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={[
              'inline-flex min-w-[4.5rem] items-center justify-end gap-1.5 text-xs font-medium transition-all duration-300 ease-out',
              saveFeedback === 'idle' ? 'pointer-events-none translate-x-1 opacity-0' : 'translate-x-0 opacity-100',
              saveFeedback === 'saving' ? 'text-muted-foreground' : '',
              saveFeedback === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : '',
            ].filter(Boolean).join(' ')}
            aria-live="polite"
          >
            {saveFeedback === 'saving' ? <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden /> : null}
            {saveFeedback === 'saved' ? <Check size={14} className="shrink-0 animate-in zoom-in-95 fade-in-0 duration-300" aria-hidden /> : null}
            {saveFeedback === 'saving' ? label('saving') : null}
            {saveFeedback === 'saved' ? label('saved') : null}
          </span>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={saveFeedback === 'saving'}
            onClick={() => { void onSave() }}
          >
            {saveFeedback === 'saving' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {saveFeedback === 'saving' ? label('saving') : label('save')}
          </button>
        </div>
      </footer>}
    </form>
  )
}

function AgentSection(props: {
  readonly state: ReturnType<typeof settingsState>
  readonly runtimes: readonly PanelRuntime[]
  readonly busy: boolean
  readonly restarting: boolean
  readonly label: (key: string) => string
  readonly onRuntime: (id: string) => void
  readonly onModel: (provider: string, model: string) => void
  readonly onProbe: () => void
  readonly onRefresh: () => void
  readonly onRestart?: () => void
  readonly readAbout?: () => Promise<PanelAbout>
  readonly readSkill?: (customDirs?: readonly string[]) => Promise<PanelSkillStatus>
  readonly installSkill?: (agentIds: readonly string[], customDirs: readonly string[]) => Promise<PanelSkillStatus>
  readonly revealSkill?: (dest: string) => Promise<void>
  readonly readAuthorMcp?: () => Promise<PanelAuthorMcpStatus>
  readonly installAuthorMcp?: (agentIds: readonly string[], description: string) => Promise<PanelAuthorMcpStatus>
  readonly revealAuthorMcp?: (dest: string) => Promise<void>
}): ReactNode {
  const runtimes = props.runtimes.some(item => item.id === props.state.providerId) || props.state.providerId.length === 0
    ? props.runtimes
    : [...props.runtimes, { id: props.state.providerId, models: [] }]
  const runtime = runtimes.find(item => item.id === props.state.providerId) ?? runtimes[0]
  const vendors = runtime?.models ?? []
  const vendor = vendors.find(item => item.provider === props.state.modelProvider) ?? vendors[0]
  const models = vendor?.models ?? []
  const vendorId = vendor?.provider ?? ''
  const modelId = models.includes(props.state.model) ? props.state.model : (models[0] ?? '')
  useEffect(() => {
    if (vendorId.length === 0 || modelId.length === 0) return
    if (vendorId === props.state.modelProvider && modelId === props.state.model) return
    props.onModel(vendorId, modelId)
  }, [vendorId, modelId, props.state.modelProvider, props.state.model, props.onModel])
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h4 className="m-0">{props.label('section-model')}</h4>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{props.label('agent-apps-help')}</p>
        {runtimes.length === 0 ? <p className="text-sm text-muted-foreground">{props.label('runtime-missing')}</p> : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex w-full max-w-md shrink-0 items-center gap-2">
                <select className="h-9 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm outline-none" value={props.state.providerId} onChange={event => props.onRuntime(event.target.value)}>
                  {runtimes.map(item => <option key={item.id} value={item.id}>{item.label ?? item.id}</option>)}
                </select>
                <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted" aria-label={props.label('refresh')} onClick={props.onRefresh}>
                  <RefreshCw size={14} className={props.busy ? 'animate-spin' : ''} />
                </button>
                <button type="button" className="h-9 shrink-0 rounded-lg border px-3 text-sm hover:bg-muted" onClick={props.onProbe}>{props.label('probe')}</button>
              </div>
              {props.state.probe === undefined ? null : <span className="min-w-0 text-sm leading-5 text-muted-foreground">{probeText(props.state.probe, props.label)}</span>}
            </div>
            {runtimeRestartNote(props)}
          </>
        )}
        {vendors.length === 0 ? <p className="text-sm text-muted-foreground">{props.label('model-empty')}</p> : (
          <div className="grid max-w-md gap-3 min-[720px]:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{props.label('provider')}</span>
              <select className="h-9 rounded-lg border bg-card px-3 text-sm outline-none" value={vendorId} onChange={(event) => {
                const provider = event.target.value
                const next = vendors.find(item => item.provider === provider)?.models ?? []
                props.onModel(provider, next.includes(props.state.model) ? props.state.model : (next[0] ?? ''))
              }}>
                {vendors.map(item => <option key={item.provider} value={item.provider}>{item.provider}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{props.label('model')}</span>
              <select className="h-9 rounded-lg border bg-card px-3 text-sm outline-none" value={modelId} onChange={event => props.onModel(vendorId, event.target.value)}>
                {models.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>
      <section>
        <h4 className="m-0">{props.label('agent-others')}</h4>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{props.label('agent-others-help')}</p>
        <div className="flex flex-col gap-3">
          <AuthorMcpInstall
            label={props.label}
            {...props.readAbout === undefined ? {} : { readAbout: props.readAbout }}
            {...props.readAuthorMcp === undefined ? {} : { readAuthorMcp: props.readAuthorMcp }}
            {...props.installAuthorMcp === undefined ? {} : { installAuthorMcp: props.installAuthorMcp }}
            {...props.revealAuthorMcp === undefined ? {} : { revealAuthorMcp: props.revealAuthorMcp }}
          />
          <SkillInstall
            label={props.label}
            {...props.readSkill === undefined ? {} : { readSkill: props.readSkill }}
            {...props.installSkill === undefined ? {} : { installSkill: props.installSkill }}
            {...props.revealSkill === undefined ? {} : { revealSkill: props.revealSkill }}
          />
        </div>
      </section>
    </div>
  )
}

function AboutSection(props: {
  readonly versions?: string
  readonly update: PanelUpdateCheck | 'checking' | 'failed' | undefined
  readonly source?: PanelUpdateSource
  readonly label: (key: string) => string
  readonly onCheck?: () => void
}): ReactNode {
  const lines = (props.versions ?? '').split('\n').filter(line => line.length > 0)
  return (
    <section className="mb-6">
      <h4>{props.label('section-about')}</h4>
      <h3 className="mt-2 text-base font-semibold">{props.label('product-name')}</h3>
      <div className="mt-2 mb-4 max-w-2xl space-y-2 text-sm leading-6 text-muted-foreground">
        {props.label('product-meaning').split('\n').filter(line => line.length > 0).map(line => (
          <p key={line.slice(0, 24)} className="m-0">{line}</p>
        ))}
      </div>
      {lines.length === 0 ? null : (
        <ul className="mb-4 font-mono text-sm text-muted-foreground">
          {lines.map(line => <li key={line}>{line}</li>)}
        </ul>
      )}
      {props.source === undefined ? null : (
        <div className="mb-4"><UpdateSourceChip source={props.source} label={props.label} /></div>
      )}
      {props.onCheck === undefined ? null : (
        <button type="button" className="h-8 rounded-lg border px-3 text-sm hover:bg-muted" onClick={props.onCheck}>{props.label('update')}</button>
      )}
      {props.update === undefined ? null : <p className="mt-3 text-sm">{updateText(props.update, props.label)}</p>}
    </section>
  )
}

function themeLabel(theme: 'system' | 'light' | 'dark'): 'theme-system' | 'theme-light' | 'theme-dark' {
  if (theme === 'light') return 'theme-light'
  if (theme === 'dark') return 'theme-dark'
  return 'theme-system'
}

function CardStylePreview(props: { readonly style: GalleryCardStyle }): ReactNode {
  if (props.style === 'stamp') {
    return (
      <span className="relative block h-10 overflow-hidden rounded-lg border bg-card">
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded border text-[8px] font-extrabold">Ab</span>
        <span className="absolute bottom-2 left-2 h-1 w-8 rounded-full bg-foreground/70" />
      </span>
    )
  }
  if (props.style === 'etch') {
    return (
      <span className="flex h-10 items-end rounded-lg border bg-card px-2 pb-1.5">
        <svg viewBox="0 0 52 28" className="h-7 w-12" aria-hidden><text x="1" y="22" fill="var(--card)" stroke="currentColor" strokeWidth="3.2" paintOrder="stroke fill" fontSize="20" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">Ab</text></svg>
      </span>
    )
  }
  if (props.style === 'pulse') {
    return (
      <span className="relative flex h-10 items-center rounded-[14px] border bg-card px-2 shadow-[inset_1px_1px_2px_#fff,0_6px_8px_#00000014]">
        <span className="text-sm font-extrabold text-primary">Ab</span>
        <span className="absolute top-2 right-2 size-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
      </span>
    )
  }
  if (props.style === 'list') {
    return (
      <span className="relative block h-10 overflow-hidden rounded-lg border bg-card">
        <span className="absolute inset-1 rounded-md rounded-tr-[18px] bg-foreground/10" />
        <span className="absolute inset-y-1.5 left-1.5 w-7 rounded-md bg-card/70" />
      </span>
    )
  }
  if (props.style === 'glass') {
    return (
      <span className="relative block h-10 overflow-hidden rounded-lg border bg-card/60">
        <span className="absolute top-1.5 left-2 text-sm font-extrabold tracking-tight text-foreground/80">Ab</span>
        <span className="absolute right-2 bottom-1.5 h-1 w-8 rounded-full bg-foreground/15" />
      </span>
    )
  }
  return (
    <span className="relative block h-10 overflow-hidden rounded-lg border bg-card">
      <span className="absolute -top-3 -right-2 size-10 rounded-full bg-primary/25" />
      <span className="absolute bottom-1.5 left-2 text-sm leading-none font-extrabold text-primary">Ab</span>
    </span>
  )
}

function cardKey(style: GalleryCardStyle): 'card-hero' | 'card-stamp' | 'card-etch' | 'card-pulse' | 'card-list' | 'card-glass' {
  if (style === 'stamp') return 'card-stamp'
  if (style === 'etch') return 'card-etch'
  if (style === 'pulse') return 'card-pulse'
  if (style === 'list') return 'card-list'
  if (style === 'glass') return 'card-glass'
  return 'card-hero'
}

async function saveSettings(
  client: PanelSettingsClient,
  state: ReturnType<typeof settingsState>,
  dispatch: (action: Parameters<typeof reduceSettings>[1]) => void,
): Promise<PanelPolicy | undefined> {
  const draft = settingsDraft(state)
  if (!draft.ok) {
    dispatch({ type: 'port-invalid' })
    return undefined
  }
  try {
    const result = await client.writePolicy(draft.policy)
    dispatch({ type: 'saved', result })
    return result.policy
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    dispatch({ type: 'save-failed', ...message.length > 0 ? { message } : {} })
    return undefined
  }
}

function runtimeRestartNote(props: {
  readonly state: ReturnType<typeof settingsState>
  readonly restarting: boolean
  readonly label: (key: string) => string
  readonly onRestart?: () => void
}): ReactNode {
  const savedId = props.state.saved?.runtimeProvider.id
  const dirtyRuntime = props.state.dirty
    && savedId !== undefined
    && savedId !== props.state.providerId
  if (props.state.restartRequired && props.state.restartRuntime) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
        <p className="m-0 min-w-0 flex-1 text-sm text-primary">{props.label('restart-runtime-hint')}</p>
        {props.onRestart === undefined ? null : (
          <button
            type="button"
            className="h-8 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={props.restarting}
            onClick={props.onRestart}
          >
            {props.restarting ? props.label('restart-wait') : props.label('restart-host')}
          </button>
        )}
      </div>
    )
  }
  if (dirtyRuntime) {
    return <p className="m-0 text-sm text-muted-foreground">{props.label('restart-runtime-pending')}</p>
  }
  return null
}

async function rebootHost(
  client: PanelSettingsClient,
  setRestarting: (value: boolean) => void,
  label: (key: string) => string,
  dispatch: (action: Parameters<typeof reduceSettings>[1]) => void,
  nextOrigin?: string,
): Promise<void> {
  if (client.restartHost === undefined) return
  setRestarting(true)
  const target = nextOrigin !== undefined && nextOrigin.length > 0 ? nextOrigin : window.location.origin
  // Kick restart; the socket may die before the JSON body arrives — that is OK.
  void client.restartHost().catch(() => undefined)
  const ready = await waitForHostOrigin(target, 20_000)
  if (ready) {
    if (target !== window.location.origin) window.location.assign(`${target}/`)
    else window.location.reload()
    return
  }
  setRestarting(false)
  dispatch({ type: 'save-failed', message: label('restart-failed') })
}

/**
 * Poll until the host answers again after dispose+start.
 * Prefer seeing a downtime gap so a probe before dispose does not look "ready".
 */
async function waitForHostOrigin(origin: string, budgetMs: number): Promise<boolean> {
  const started = Date.now()
  let sawDown = false
  // Outlast the server's delayed dispose (400ms) before trusting a 200.
  await new Promise(resolve => setTimeout(resolve, 700))
  while (Date.now() - started < budgetMs) {
    try {
      const response = await fetch(`${origin}/api/about`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      })
      if (response.ok) {
        if (sawDown || Date.now() - started > 1_500) return true
      } else {
        sawDown = true
      }
    } catch {
      sawDown = true
    }
    await new Promise(resolve => setTimeout(resolve, 350))
  }
  return false
}

async function readUpdate(
  client: PanelSettingsClient,
  setUpdate: (value: PanelUpdateCheck | 'checking' | 'failed') => void,
  onOffer?: (update: PanelUpdateCheck) => void,
): Promise<void> {
  if (client.checkUpdate === undefined) return
  setUpdate('checking')
  try {
    const result = await client.checkUpdate()
    setUpdate(result)
    if (result.updateAvailable && result.installable === true && result.latest !== null) onOffer?.(result)
  } catch {
    setUpdate('failed')
  }
}

function updateText(update: PanelUpdateCheck | 'checking' | 'failed', label: (key: string) => string): string {
  if (update === 'checking') return label('update-checking')
  if (update === 'failed') return label('update-failed')
  if (update.error !== undefined && update.error.length > 0) return update.error
  const current = label('update-current').replace('{n}', update.current)
  if (update.updateAvailable && update.latest !== null) {
    return `${label('update-available')} ${label('update-newest').replace('{n}', update.latest)} · ${current}`
  }
  return `${label('update-ok')} ${current}`
}

async function probeSettings(
  client: PanelSettingsClient,
  id: string,
  dispatch: (action: Parameters<typeof reduceSettings>[1]) => void,
): Promise<void> {
  const result = await client.probe(id)
  dispatch({ type: 'probed', message: result.message ?? (result.healthy ? 'probe-ok' : 'probe-failed') })
}

function probeText(probe: string, label: (key: string) => string): string {
  if (probe === 'update-failed' || probe === 'probe-ok' || probe === 'probe-failed') return label(probe)
  return probe
}

/** Loopback panel origin for the draft or saved host port. */
/** Bars from the theme file — not a hash of the palette id. */
function palettePreview(palette: PaletteChip): { primary: string; muted: string; card: string; surface: string } {
  const css = palette.style ?? ''
  const primary = tokenFromCss(css, 'primary') ?? palette.swatch ?? '#888888'
  const muted = tokenFromCss(css, 'muted') ?? soften(primary, 0.55)
  const card = tokenFromCss(css, 'card') ?? '#ffffff'
  const surface = tokenFromCss(css, 'background') ?? soften(primary, 0.88)
  return { primary, muted, card, surface }
}

function tokenFromCss(css: string, name: string): string | undefined {
  const light = css.split(/\[data-mode=["']dark["']\]/)[0] ?? css
  const match = new RegExp(`--${name}:\\s*([^;}]+)`).exec(light)
  const value = match?.[1]?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}

function soften(color: string, mix: number): string {
  return `color-mix(in oklab, ${color} ${Math.round(mix * 100)}%, white)`
}

function paletteLabel(locale: PanelLocale, palette: PaletteChip): string {
  if (locale === 'zh-CN' && palette.nameZh !== undefined && palette.nameZh.length > 0) return palette.nameZh
  return palette.name
}

function hostOrigin(port: string): string | undefined {
  const n = Number(port)
  if (!Number.isInteger(n) || n < 1024 || n > 65535) return undefined
  return `http://127.0.0.1:${n}`
}

/** Appearance / palette / card-style choice tile. Selected state must read at a glance. */
const choiceCardClass = [
  'flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-2 text-left outline-none transition-colors',
  'hover:border-foreground/25',
  'data-[on=1]:border-primary data-[on=1]:bg-primary/10 data-[on=1]:ring-2 data-[on=1]:ring-primary data-[on=1]:ring-offset-2 data-[on=1]:ring-offset-background',
  'data-[on=1]:[&>span:last-child]:font-semibold',
].join(' ')
