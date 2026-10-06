import { defineApp } from '@mohou/contract'

/** One button, with the command written for each shell. The two are not translations of each other. */
type Job = { id: string; title: string; posix: string; windows: string }

// ⭐ key: chores are named buttons with a known command — not a prompt for ctx.agent.
const JOBS: Job[] = [
  {
    id: 'disk',
    title: '磁盘用量',
    posix: 'df -k / | tail -1',
    windows: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{n=\'UsedGB\';e={[math]::Round($_.Used/1GB,1)}},@{n=\'FreeGB\';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize',
  },
  {
    id: 'top',
    title: '最耗 CPU',
    posix: 'ps -axo pid,pcpu,pmem,comm -r | head -n 6',
    windows: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Id,ProcessName,@{n=\'CPU(s)\';e={[math]::Round($_.CPU,1)}},@{n=\'MB\';e={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize',
  },
  {
    id: 'who',
    title: '这台机器',
    posix: 'uname -a',
    windows: 'Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture,CsName | Format-List',
  },
]

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
      //         terminal window. The platform picks the shell *and* the command: `df -k` in
      //         PowerShell fails in a way that reads like the app is broken, and Windows has no
      //         bash to fall back to. `ctx.system.metrics()` reports `win32` there.
      const windows = (await ctx.system.metrics()).platform === 'win32'
      const command = windows ? job.windows : job.posix
      const result = windows ? await ctx.pwsh(command) : await ctx.bash(command)
      return {
        id: job.id,
        title: job.title,
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        at: Date.now(),
      }
    },
  },
})
