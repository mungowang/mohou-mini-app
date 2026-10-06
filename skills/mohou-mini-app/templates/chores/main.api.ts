import { defineApp } from '@mohou/contract'

type Job = { id: string; title: string; command: string }

// ⭐ key: chores are named buttons with a known command — not a prompt for ctx.agent.
const JOBS: Job[] = [
  { id: 'disk', title: '磁盘用量', command: 'df -k / | tail -1' },
  { id: 'top', title: '最耗 CPU', command: 'ps -axo pid,pcpu,pmem,comm -r | head -n 6' },
  { id: 'who', title: '这台机器', command: 'uname -a' },
]

/** The two shells this app may reach for. Both return the same result shape. */
type ShellContext = {
  bash(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  pwsh(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

/**
 * Run one command in the platform's shell: `ctx.bash` first, and `ctx.pwsh` when there is no bash.
 * The two are different shells, not translations of each other — write the command for the one
 * the button will meet, or keep two command strings per job.
 * @param ctx - the app context
 * @param command - the command string
 */
async function runShell(ctx: ShellContext, command: string) {
  try {
    return await ctx.bash(command)
  } catch (error) {
    if ((error as { code?: string }).code !== 'bash-unavailable') throw error
    return ctx.pwsh(command)
  }
}

export default defineApp({
  name: '一键杂事',
  description: '三个按钮，在这台机器上跑已知脚本，结果回到 app',
  api: {
    jobs() {
      return { jobs: JOBS.map(({ id, title }) => ({ id, title })) }
    },
    async run(ctx, args?: { id?: string }) {
      const job = JOBS.find(item => item.id === args?.id)
      if (!job) throw new Error('没有这个按钮')
      // ⭐ key: a shell here is the point — stdout/stderr/exitCode come back into the UI, not a
      //         terminal window. `ctx.bash` is POSIX; a Windows machine without bash answers
      //         `bash-unavailable`, and `ctx.pwsh` is that platform's own shell.
      const result = await runShell(ctx, job.command)
      return {
        id: job.id,
        title: job.title,
        command: job.command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        at: Date.now(),
      }
    },
  },
})
