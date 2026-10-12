import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Tooltip } from '../ui/tooltip.tsx'
import type { PanelSkillCopy, PanelSkillStatus } from './client.ts'
import { endsWithSkills, installingCaption, shortHomePath, toggleId } from './install-row.tsx'
import { readSkillAgentIds, readSkillCustomDirs, writeSkillAgentIds, writeSkillCustomDirs } from './skill-dirs.ts'

/**
 * Writing-skill dest list. One-click copy into the assistants Shell named.
 * @param props - status loaders and chrome labels
 */
export function SkillInstall(props: {
  readonly label: (key: string) => string
  readonly readSkill?: (customDirs?: readonly string[]) => Promise<PanelSkillStatus>
  readonly installSkill?: (agentIds: readonly string[], customDirs: readonly string[]) => Promise<PanelSkillStatus>
  readonly revealSkill?: (dest: string) => Promise<void>
  /** Latest status from a sibling install. Replaces the last read while this instance is open. */
  readonly status?: PanelSkillStatus
}): ReactNode {
  const [skill, setSkill] = useState<PanelSkillStatus | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(readSkillAgentIds() ?? []))
  const [customDirs, setCustomDirs] = useState<readonly string[]>(() => readSkillCustomDirs())
  const [customDraft, setCustomDraft] = useState('')
  const [customError, setCustomError] = useState(false)
  // Bumped when a sibling install lands, so an in-flight read cannot overwrite it.
  const generation = useRef(0)
  useEffect(() => {
    if (props.readSkill === undefined) return
    const gen = generation.current + 1
    generation.current = gen
    void props.readSkill(customDirs).then((status) => {
      if (gen !== generation.current) return
      setSkill(status)
      if (readSkillAgentIds() === undefined) {
        setPicked(new Set(status.agents.filter(agent => agent.homePresent).map(agent => agent.id)))
      }
    }, () => {
      if (gen !== generation.current) return
      setSkill(undefined)
    })
  }, [props.readSkill, customDirs])
  useEffect(() => {
    if (props.status === undefined) return
    generation.current += 1
    setSkill(props.status)
  }, [props.status])
  if (props.readSkill === undefined) return null
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <p className="m-0 text-sm font-medium">{props.label('skill-install')}</p>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        {props.label('skill-help')}
        {skill?.version === null || skill?.version === undefined ? null : ` ${props.label('skill-version').replace('{n}', skill.version)}`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {(skill?.agents ?? []).map(agent => (
          <li key={agent.id} className={agent.homePresent ? 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted' : 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 opacity-50 hover:bg-muted'}>
            <input type="checkbox" checked={picked.has(agent.id)} onChange={() => {
              const next = toggleId(picked, agent.id)
              setPicked(next)
              writeSkillAgentIds([...next])
            }} />
            <span className="text-sm">{agent.label}</span>
            <span className="ml-4 flex min-w-0 items-center gap-2">
              {agent.homePresent ? null : <span className="text-[11px] text-muted-foreground">{props.label('skill-missing-home')}</span>}
              {busy && picked.has(agent.id) ? installingCaption(props.label) : skillCopyCaption(agent, props.label)}
              {agent.installed && props.revealSkill !== undefined ? (
                <Tooltip text={agent.dest}><button type="button" className="max-w-[28rem] truncate font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => { void props.revealSkill?.(agent.dest) }}>{shortHomePath(agent.dest)}</button></Tooltip>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <p className="mb-1 text-xs text-muted-foreground">{props.label('skill-custom')}</p>
        <div className="flex gap-2">
          <input className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none" placeholder={props.label('skill-custom-hint')} value={customDraft} onChange={(event) => { setCustomDraft(event.target.value); setCustomError(false) }} />
          <button type="button" className="h-9 rounded-lg border px-3 text-sm" onClick={() => {
            const dir = customDraft.trim()
            if (!endsWithSkills(dir)) {
              setCustomError(true)
              return
            }
            if (customDirs.includes(dir)) {
              setCustomDraft('')
              return
            }
            const next = [...customDirs, dir]
            setCustomDirs(next)
            writeSkillCustomDirs(next)
            setCustomDraft('')
            setCustomError(false)
          }}>{props.label('skill-add-dir')}</button>
        </div>
        {customError ? <p className="mt-1 mb-0 text-xs text-destructive">{props.label('skill-custom-format')}</p> : null}
        <ul className="mt-2 flex list-none flex-col gap-1 p-0">
          {customDirs.map((dir) => {
            const row = skill?.customs.find(item => item.dir === dir || item.dir.endsWith(dir.replace(/^~/, '')))
            return (
              <li key={dir} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <span className="max-w-[28rem] truncate font-mono text-xs">{dir}</span>
                {busy ? installingCaption(props.label) : row === undefined ? null : skillCopyCaption(row, props.label)}
                {row?.installed === true && props.revealSkill !== undefined ? (
                  <Tooltip text={row.dest}><button type="button" className="max-w-[28rem] truncate font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => { void props.revealSkill?.(row.dest) }}>{shortHomePath(row.dest)}</button></Tooltip>
                ) : null}
                <button type="button" className="text-[11px] text-muted-foreground" onClick={() => {
                  const next = customDirs.filter(item => item !== dir)
                  setCustomDirs(next)
                  writeSkillCustomDirs(next)
                }}>×</button>
              </li>
            )
          })}
        </ul>
      </div>
      <button type="button" className="mt-3 h-8 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-60" disabled={busy || props.installSkill === undefined} onClick={() => {
        const install = props.installSkill
        if (install === undefined) return
        setBusy(true)
        setFailed(false)
        void install([...picked], customDirs).then(setSkill, () => setFailed(true)).finally(() => setBusy(false))
      }}>{busy ? '…' : props.label(skillNeedsUpdate(skill, picked, customDirs) ? 'skill-update-install' : 'skill-install')}</button>
      {failed ? <p className="mt-2 mb-0 text-xs text-destructive">{props.label('skill-failed')}</p> : null}
    </div>
  )
}

function skillCopyCaption(row: PanelSkillCopy, label: (key: string) => string): ReactNode {
  if (!row.installed) return null
  return (
    <>
      <span className={row.updateAvailable ? 'text-[11px] text-primary' : 'text-[11px] text-muted-foreground'}>
        {label(row.updateAvailable ? 'skill-update' : 'skill-installed')}
      </span>
      {row.version === null ? null : <span className="text-[11px] text-muted-foreground">{row.version}</span>}
    </>
  )
}

function skillNeedsUpdate(skill: PanelSkillStatus | undefined, picked: ReadonlySet<string>, customDirs: readonly string[]): boolean {
  if (skill === undefined) return false
  if (skill.agents.some(agent => picked.has(agent.id) && agent.updateAvailable)) return true
  return customDirs.some((dir) => {
    const row = skill.customs.find(item => item.dir === dir || item.dir.endsWith(dir.replace(/^~/, '')))
    return row?.updateAvailable === true
  })
}
