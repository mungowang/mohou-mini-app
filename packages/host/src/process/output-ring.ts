/** Default bytes kept per stream side. Host policy, not locked. */
export const DEFAULT_SPAWN_OUTPUT_BYTES = 32 * 1024

/**
 * Bounded text ring for one byte stream. Drops from the front when over cap.
 * For failure diagnostics only — not a live subscription.
 */
export function createOutputRing(maxBytes = DEFAULT_SPAWN_OUTPUT_BYTES) {
  let text = ''

  function push(chunk: string): void {
    if (chunk.length === 0) return
    text += chunk
    if (text.length > maxBytes) text = text.slice(text.length - maxBytes)
  }

  function read(): string {
    return text
  }

  return { push, read }
}

export type OutputRing = ReturnType<typeof createOutputRing>

/** Merge stdout/stderr labels for a single diagnostic block. */
export function formatSpawnOutput(stdout: string, stderr: string): string {
  const parts: string[] = []
  if (stdout.length > 0) parts.push(`--- stdout ---\n${stdout}`)
  if (stderr.length > 0) parts.push(`--- stderr ---\n${stderr}`)
  return parts.join('\n')
}

/** Attach utf8 data listeners; returns a reader of combined output. */
export function captureChildOutput(
  child: { readonly stdout?: NodeJS.ReadableStream | null; readonly stderr?: NodeJS.ReadableStream | null },
  maxBytes = DEFAULT_SPAWN_OUTPUT_BYTES,
): { output(): string } {
  const out = createOutputRing(maxBytes)
  const err = createOutputRing(maxBytes)
  const onData = (ring: OutputRing) => (chunk: Buffer | string) => {
    ring.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  }
  child.stdout?.on('data', onData(out))
  child.stderr?.on('data', onData(err))
  return {
    output: () => formatSpawnOutput(out.read(), err.read()),
  }
}
