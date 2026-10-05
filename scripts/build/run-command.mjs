import { execFileSync } from 'node:child_process'

/** The executable name this platform uses for one command. */
export function commandName(cmd, platform = process.platform) {
  if (platform !== 'win32') return cmd
  if (cmd === 'npm' || cmd === 'pnpm') return `${cmd}.cmd`
  if (cmd === 'cargo' || cmd === 'tar') return `${cmd}.exe`
  return cmd
}

/**
 * What to execute for one command. Windows cannot spawn a `.cmd` directly — Node refuses it
 * since the 2024 fix — so the command interpreter is asked to run it. Arguments stay a list.
 */
export function spawnPlan(cmd, args, platform = process.platform) {
  const name = commandName(cmd, platform)
  if (platform !== 'win32' || !(name.endsWith('.cmd') || name.endsWith('.bat'))) return { file: name, args }
  return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', name, ...args] }
}

/**
 * Run one command in the foreground and fail the script when it fails.
 * @param cmd - command name, resolved for this platform
 * @param args - one argument per entry
 * @param options - `execFileSync` options; `cwd` is the caller's business
 */
export function runCommand(cmd, args, options = {}) {
  const plan = spawnPlan(cmd, args)
  console.log(`$ ${plan.file} ${plan.args.join(' ')}`)
  return execFileSync(plan.file, plan.args, { stdio: 'inherit', ...options })
}
