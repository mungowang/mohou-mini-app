import { defineApp } from '@mohou/contract'

// ⭐ key: the host already exposes OS basics via ctx.system.metrics() (memory/CPU/load/uptime are all there),
//         so don't recompute them with bash. Use ctx.bash only for what the host lacks: ps (processes), df (disk).
type Proc = { pid: string; cpu: number; mem: number; name: string }

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  const unit = units[i] ?? 'TB'
  return n.toFixed(i ? 1 : 0) + unit
}

/** `ctx.bash` is POSIX; a Windows machine without bash runs the same line through `ctx.pwsh`. */
async function shell(ctx, cmd: string) {
  try {
    return await ctx.bash(cmd)
  } catch (error) {
    if ((error as { code?: string }).code !== 'bash-unavailable') throw error
    return ctx.pwsh(cmd)
  }
}

async function sh(ctx, cmd: string): Promise<string> {
  try {
    const r = await shell(ctx, cmd)
    if (r.exitCode !== 0) return ''
    return r.stdout.trim()
  } catch {
    return ''
  }
}

function parseProcesses(text: string): Proc[] {
  // the last column is comm and may contain spaces; join the trailing tokens as name, the leading columns are pid/cpu/mem
  if (!text) return []
  return text
    .split('\n')
    .map((line) => {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 5) return null
      const cpu = Number(cols[1])
      const mem = Number(cols[2])
      if (Number.isNaN(cpu) || Number.isNaN(mem)) return null
      return { pid: cols[0], cpu, mem, name: cols.slice(3).join(' ') || '?' }
    })
    .filter((p): p is Proc => p !== null)
    .slice(0, 8)
}

function parseDisk(text: string): { total: number; used: number; avail: number; usedPct: number; mount: string } | null {
  const cols = text.trim().split(/\s+/)
  if (cols.length < 5) return null
  const total = Number(cols[1]) * 1024
  const used = Number(cols[2]) * 1024
  const avail = Number(cols[3]) * 1024
  const usedPct = Number(cols[4]?.replace('%', ''))
  if (Number.isNaN(total) || Number.isNaN(usedPct)) return null
  return { total, used, avail, usedPct, mount: cols[5] || '/' }
}

export default defineApp({
  name: '值班屏',
  description: '打开就自己在跳。没有开始按钮。',
  api: {
    async getSnapshot(ctx) {
      const base = await ctx.system.metrics()
      const platform = base.platform
      // memory/CPU/load come from metrics; only fill in what the host lacks here: processes + disk
      const [psText, dfLine] = await Promise.all([
        sh(ctx, platform === 'darwin' ? 'ps -axo pid,pcpu,pmem,comm -r | head -n 9' : 'ps -axo pid,pcpu,pmem,comm --sort=-pcpu | head -n 9'),
        sh(ctx, 'df -k / | tail -1'),
      ])
      const mem = base.memory
      const disk = parseDisk(dfLine)
      return {
        hostname: base.hostname,
        platform,
        arch: base.arch,
        loadavg: base.loadavg,
        uptimeSec: base.uptimeSec,
        collectedAt: Date.now(),
        cpu: { model: base.cpu.model || '—', count: base.cpu.count },
        processes: parseProcesses(psText),
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          usedPct: Math.round((mem.usedRatio || 0) * 100),
        },
        disk: disk
          ? { total: fmtBytes(disk.total), used: fmtBytes(disk.used), free: fmtBytes(disk.avail), usedPct: disk.usedPct }
          : null,
      }
    },
  },
})
