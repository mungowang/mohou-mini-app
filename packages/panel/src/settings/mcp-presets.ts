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

/**
 * Jenkins tools that change something on the instance. The preset blocks them: a server that can
 * restart a controller or delete a job does not need that reach to answer "is the build green".
 */
const jenkinsBlockedTools = [
  'jenkins_create_job',
  'jenkins_update_job_config',
  'jenkins_delete_job',
  'jenkins_rename_job',
  'jenkins_copy_job',
  'jenkins_delete_build',
  'jenkins_replay_build',
  'jenkins_enable_job',
  'jenkins_disable_job',
  'jenkins_toggle_node_offline',
  'jenkins_quiet_down',
  'jenkins_cancel_quiet_down',
  'jenkins_safe_restart',
].join(',')

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
    id: 'jenkins',
    label: 'Jenkins',
    description: 'Jenkins jobs, builds, and console output, through @kud/mcp-jenkins',
    packageName: '@kud/mcp-jenkins',
    env: {
      MCP_JENKINS_URL: '${credential:JENKINS_URL}',
      MCP_JENKINS_USER: '${credential:JENKINS_USERNAME}',
      MCP_JENKINS_API_TOKEN: '${credential:JENKINS_API_TOKEN}',
      MCP_JENKINS_TIMEOUT_MS: '30000',
      MCP_JENKINS_BLOCK_TOOLS: jenkinsBlockedTools,
    },
    credentials: [
      { name: 'JENKINS_URL', description: 'Jenkins root, for example https://jenkins.example.com' },
      { name: 'JENKINS_USERNAME', description: 'Jenkins user' },
      { name: 'JENKINS_API_TOKEN', description: 'Jenkins API token' },
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
