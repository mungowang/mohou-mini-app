import type { Draft } from './mcp-view.tsx'

/** A credential the preset's server reads, created empty so the Credentials section shows it. */
export interface McpPresetCredential {
  readonly name: string
  readonly description: string
}

/**
 * One server this product publishes, offered as a form the person completes.
 * The package name is the fact; the form, not this table, is what reaches `mcp.json`.
 */
export interface McpPreset {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly packageName: string
  /** Environment the server reads, as `${credential:NAME}` references. */
  readonly env: Readonly<Record<string, string>>
  readonly credentials: readonly McpPresetCredential[]
}

/** Presets the MCP section offers. Adding one here is all a new server needs. */
export const mcpPresets: readonly McpPreset[] = [
  {
    id: 'jira',
    label: 'Jira',
    description: 'Jira issues, comments, transitions, and worklogs, through @mohou/jira-mcp',
    packageName: '@mohou/jira-mcp',
    env: {
      JIRA_BASE_URL: '${credential:JIRA_BASE_URL}',
      JIRA_USERNAME: '${credential:JIRA_USERNAME}',
      JIRA_PASSWORD: '${credential:JIRA_PASSWORD}',
      JIRA_AUTH: 'basic',
    },
    credentials: [
      { name: 'JIRA_BASE_URL', description: 'Jira instance root, for example https://jira.example.com' },
      { name: 'JIRA_USERNAME', description: 'Jira account name' },
      { name: 'JIRA_PASSWORD', description: 'Jira password or API token' },
    ],
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    description: 'GitLab projects, merge requests, issues, and pipelines, through @mohou/gitlab-mcp',
    packageName: '@mohou/gitlab-mcp',
    env: {
      GITLAB_BASE_URL: '${credential:GITLAB_BASE_URL}',
      GITLAB_TOKEN: '${credential:GITLAB_TOKEN}',
    },
    credentials: [
      { name: 'GITLAB_BASE_URL', description: 'GitLab instance root, for example http://gitlab.example.com' },
      { name: 'GITLAB_TOKEN', description: 'Personal access token with the api scope' },
    ],
  },
]

/** The form a preset opens. Nothing is written to `mcp.json` until the person saves it. */
export function presetDraft(preset: McpPreset): Draft {
  return {
    id: preset.id,
    description: preset.description,
    transport: 'stdio',
    command: 'npx',
    args: `-y ${preset.packageName}`,
    url: '',
    env: Object.entries(preset.env).map(([key, value]) => `${key}=${value}`).join('\n'),
    headers: '',
    editing: undefined,
  }
}
