import { createServer } from 'node:net'

/**
 * A loopback port nothing holds right now.
 *
 * A spec that boots a real Host must not seed the same preferred port as a spec running beside it:
 * first boot probes from the seed port, so two specs that both ask for the same one race, and the
 * loser fails with `port-in-use`. Ask the OS instead. The seed keeps its documented meaning — the
 * probe still starts at the port this returns.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
