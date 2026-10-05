import type { AgentSessionServices } from '@earendil-works/pi-coding-agent'

/**
 * Open Pi the way its own CLI does: build the cwd-bound services first, then list models or create a
 * session on top of them.
 *
 * A bare `ModelRuntime` is not equivalent, and this module exists because it is not: the services
 * step is what loads the user's extensions, and loading them is what lets an extension register a
 * provider or a virtual model. A model an extension added — a proxy, a hosted gateway, a vendor Pi
 * does not ship — is otherwise missing from Settings and unknown when it runs.
 * @param cwd - project directory, for project-level resources and extensions
 * @param loader - resource loader options this call adds, such as an appended system prompt
 */
export async function openPiServices(
  cwd: string,
  loader?: { readonly appendSystemPrompt?: string[] },
): Promise<AgentSessionServices> {
  const { createAgentSessionServices, getAgentDir } = await import('@earendil-works/pi-coding-agent')
  return createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
    ...loader === undefined ? {} : { resourceLoaderOptions: loader },
  })
}
