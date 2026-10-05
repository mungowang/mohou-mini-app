import { authorMcpToolNames, authorToolNames, reloadMessage, type AuthorToolName } from './author.ts'

interface ToolInput {
  readonly description: string
  readonly inputSchema: {
    readonly type: 'object'
    readonly properties: Record<string, unknown>
    readonly required?: readonly string[]
  }
}

const appId = { type: 'string' }
const path = { type: 'string' }
const commit = { type: 'boolean' }

/** One projection of the author catalog. Callers do not invent a second argument list. */
export const authorToolInputs: Record<AuthorToolName, ToolInput> = {
  mini_app_list: {
    description: 'List mini-apps on this host.',
    inputSchema: { type: 'object', properties: {} },
  },
  mini_app_get: {
    description: 'Read one mini-app name, version, and directory.',
    inputSchema: { type: 'object', properties: { appId }, required: ['appId'] },
  },
  mini_app_list_files: {
    description: 'List files in a mini-app.',
    inputSchema: { type: 'object', properties: { appId }, required: ['appId'] },
  },
  mini_app_read: {
    description: 'Read a mini-app file. Optional line range.',
    inputSchema: {
      type: 'object',
      properties: { appId, path, start: { type: 'number' }, end: { type: 'number' }, numbered: { type: 'boolean' } },
      required: ['appId', 'path'],
    },
  },
  mini_app_edit: {
    description: 'Replace unique text in a mini-app file.',
    inputSchema: {
      type: 'object',
      properties: {
        appId,
        path,
        edits: { type: 'array', items: { type: 'object', properties: { oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['oldText', 'newText'] } },
        commit,
      },
      required: ['appId', 'path', 'edits'],
    },
  },
  mini_app_write: {
    description: 'Create or overwrite a mini-app file.',
    inputSchema: { type: 'object', properties: { appId, path, content: { type: 'string' }, commit }, required: ['appId', 'path', 'content'] },
  },
  mini_app_delete: {
    description: 'Delete a mini-app file.',
    inputSchema: { type: 'object', properties: { appId, path, commit }, required: ['appId', 'path'] },
  },
  mini_app_register: {
    description: 'Create a mini-app directory from manifest fields. Write ui.tsx and main.api.ts with file tools.',
    inputSchema: {
      type: 'object',
      properties: {
        appId,
        name: { type: 'string' },
        description: { type: 'string' },
        version: { type: 'string' },
        acronym: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string' },
      },
      required: ['appId', 'name', 'description', 'version'],
    },
  },
  mini_app_reload: {
    description: reloadMessage,
    inputSchema: { type: 'object', properties: { appId, cleanCaches: { type: 'boolean' } }, required: ['appId'] },
  },
  mini_app_call: {
    description: 'Call a mini-app API method, or a batch.',
    inputSchema: {
      type: 'object',
      properties: {
        appId,
        method: { type: 'string' },
        args: { type: 'object' },
        calls: { type: 'array', items: { type: 'object' } },
      },
      required: ['appId'],
    },
  },
  mini_app_mcp_list: {
    description: 'List connected MCP servers and their tool names. No descriptions or schemas.',
    inputSchema: { type: 'object', properties: {} },
  },
  mini_app_mcp_tools: {
    description: 'Read tool descriptions and input schemas for one MCP server. Optional toolName narrows to one tool.',
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string' }, toolName: { type: 'string' } },
      required: ['serverId'],
    },
  },
  mini_app_mcp_add: {
    description: 'Add or replace one MCP server in the host config, and check it by opening it once. A value may be written as ${env:NAME} or ${credential:NAME}; the host resolves it and the secret never reaches the file. The row is live after the next host start.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        description: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
        url: { type: 'string' },
        transport: { type: 'string', enum: ['sse', 'streamable-http'] },
        headers: { type: 'object' },
        enabled: { type: 'boolean' },
        check: { type: 'boolean' },
        force: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  mini_app_mcp_remove: {
    description: 'Remove one MCP server from the host config by id. The removal is live after the next host start.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  mini_app_credential_list: {
    description: 'List credential names. Values are not returned.',
    inputSchema: { type: 'object', properties: {} },
  },
  mini_app_history_commit: {
    description: 'Commit the mini-app tree.',
    inputSchema: { type: 'object', properties: { appId, message: { type: 'string' } }, required: ['appId', 'message'] },
  },
  mini_app_history_list: {
    description: 'List commits.',
    inputSchema: { type: 'object', properties: { appId, limit: { type: 'number' } }, required: ['appId'] },
  },
  mini_app_history_reset: {
    description: 'Reset the tree to a commit.',
    inputSchema: { type: 'object', properties: { appId, commitId: { type: 'string' } }, required: ['appId', 'commitId'] },
  },
  mini_app_open: {
    description: 'Show a mini-app in the panel.',
    inputSchema: { type: 'object', properties: { appId, title: { type: 'string' } }, required: ['appId'] },
  },
  mini_app_errors: {
    description: 'Read recent runner errors.',
    inputSchema: { type: 'object', properties: { appId, since: { type: 'number' }, clear: { type: 'boolean' } }, required: ['appId'] },
  },
  mini_app_install: {
    description: 'Add or remove libraries in a mini-app.',
    inputSchema: {
      type: 'object',
      properties: {
        appId,
        packages: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name'] } },
        remove: { type: 'array', items: { type: 'string' } },
        commit,
      },
      required: ['appId'],
    },
  },
  mini_app_view_eval: {
    description: 'Run JavaScript in an open mini-app view.',
    inputSchema: {
      type: 'object',
      properties: { appId, code: { type: 'string' }, maxBytes: { type: 'number' }, timeoutMs: { type: 'number' } },
      required: ['appId'],
    },
  },
}

export function authorToolList(): Array<{ name: AuthorToolName; description: string; inputSchema: ToolInput['inputSchema'] }> {
  return authorToolNames.map(name => ({ name, ...authorToolInputs[name] }))
}

export function authorMcpToolList(): Array<{ name: string; description: string; inputSchema: ToolInput['inputSchema'] }> {
  return authorMcpToolNames.map(name => ({ name, ...authorToolInputs[name] }))
}
