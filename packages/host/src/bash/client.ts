import type { CommandHandle, CommandPolicy, CommandResult } from '../shell/command.ts'
import { createCommand, scrubShellEnv } from '../shell/command.ts'
import { BashError } from './codes.ts'

export type { CommandPolicy as BashPolicy, CommandResult as BashResult, CommandHandle as BashHandle }

/** Parent environment minus key, secret, token, and password entries. */
export function scrubBashEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return scrubShellEnv(env)
}

/**
 * Build `ctx.bash`. Each command is a fresh `bash -c`.
 * Bash is not translated into PowerShell. A Windows machine needs `bash` on `PATH`.
 * @param policy - resolved host bounds
 * @param callSignal - aborting it stops the child
 * @param shell - executable name; tests inject a missing one
 */
export function createBash(policy: CommandPolicy, callSignal?: AbortSignal, shell = 'bash'): CommandHandle {
  return createCommand(policy, callSignal, command => [shell, '-c', command], () => new BashError('bash-unavailable', 'bash is not available; ctx.pwsh is the shell on a Windows machine without it'))
}
