import type { RunKind } from './events'

/**
 * MCP servers this app offers, as its own catalog. `ctx.mcp` calls a server by id and does not
 * discover them, so the app ships the three the MCP section adds with one click: `jira`
 * (`@mohou/jira-mcp`), `gitlab` (`@mohou/gitlab-mcp`), and `jenkins` (`@kud/mcp-jenkins`). A call
 * to a server that is not connected fails on its own, and the picker says so before the call.
 *
 * The catalog is a starting point: add a row for any other server you connected.
 */
export type McpTool = {
  name: string
  description: string
  /** `required` from the tool's own inputSchema, so the UI can warn before spending a call. */
  required: string[]
  example: Record<string, unknown>
}

export type McpServer = {
  id: string
  label: string
  /** One line of context under the tool row. Server-specific, so it lives here and not in the UI. */
  note?: string
  tools: McpTool[]
}

export const MCP_SERVERS: McpServer[] = [
  {
    id: 'jira',
    label: 'jira · Jira Server + Zephyr Scale',
    note: '只列只读工具：@mohou/jira-mcp 还提供创建、流转、评论等写操作。连不上实例时调用会失败',
    tools: [
      {
        name: 'jira_server_info',
        description: '确认 Jira 版本与部署类型（Server / Cloud），不取业务数据',
        required: [],
        example: {},
      },
      {
        name: 'jira_get_current_user',
        description: '当前凭据对应的账号，用来确认 token 配对正确',
        required: [],
        example: {},
      },
      {
        name: 'jira_list_projects',
        description: '可见项目列表，拿 project key 用',
        required: [],
        example: {},
      },
      {
        name: 'jira_search_issues',
        description: '按 JQL 搜索 issue',
        required: ['jql'],
        example: {
          jql: 'assignee = currentUser() ORDER BY created DESC',
          fields: ['summary', 'status', 'assignee'],
          maxResults: 5,
        },
      },
      {
        name: 'jira_get_issue',
        description: '读一条 issue 的字段与描述',
        required: ['issueKey'],
        example: { issueKey: 'PROJ-1' },
      },
      {
        name: 'jira_get_fields',
        description: '字段目录（自定义字段用 id 才稳）',
        required: [],
        example: {},
      },
      {
        name: 'jira_get_transitions',
        description: '一条 issue 当前可做的状态流转',
        required: ['issueKey'],
        example: { issueKey: 'PROJ-1' },
      },
      {
        name: 'jira_list_comments',
        description: '一条 issue 的评论',
        required: ['issueKey'],
        example: { issueKey: 'PROJ-1' },
      },
    ],
  },
  {
    id: 'gitlab',
    label: 'gitlab · GitLab',
    note: '只列只读工具：发布版还提供创建、评论、合并等写操作，可用 GITLAB_READ_ONLY=true 全禁掉',
    tools: [
      {
        name: 'gitlab_whoami',
        description: '当前凭据对应的账号——证明 token 可用最便宜的一步',
        required: [],
        example: {},
      },
      {
        name: 'gitlab_server_version',
        description: '目标实例的 GitLab 版本',
        required: [],
        example: {},
      },
      {
        name: 'gitlab_project_search',
        description: '按名字搜项目，拿项目路径',
        required: ['search'],
        example: { search: 'demo' },
      },
      {
        name: 'gitlab_project_get',
        description: '按路径或 id 读项目，拿默认分支',
        required: ['project'],
        example: { project: 'group/project' },
      },
      {
        name: 'gitlab_mr_list',
        description: '项目的合并请求，默认只看 opened',
        required: ['project'],
        example: { project: 'group/project', state: 'opened' },
      },
      {
        name: 'gitlab_mr_get',
        description: '一个合并请求的字段，含 work_in_progress',
        required: ['project', 'iid'],
        example: { project: 'group/project', iid: 1 },
      },
      {
        name: 'gitlab_mr_changes',
        description: '逐文件 diff 摘要（patch 有截断上限）',
        required: ['project', 'iid'],
        example: { project: 'group/project', iid: 1 },
      },
      {
        name: 'gitlab_mr_pipelines',
        description: '这个合并请求的流水线状态，合并前的闸门',
        required: ['project', 'iid'],
        example: { project: 'group/project', iid: 1 },
      },
      {
        name: 'gitlab_branches_list',
        description: '项目分支，新建 MR 前确认源分支',
        required: ['project'],
        example: { project: 'group/project' },
      },
      {
        name: 'gitlab_labels_list',
        description: '项目标签名——写标签前先查，避免建出拼错的标签',
        required: ['project'],
        example: { project: 'group/project' },
      },
    ],
  },
  {
    id: 'jenkins',
    label: 'jenkins · Jenkins',
    note: '只列只读工具：@kud/mcp-jenkins 还能触发/停止构建，预设里没有屏蔽这两类',
    tools: [
      { name: 'jenkins_get_version', description: '控制器版本与就绪状态，最便宜的一次探活', required: [], example: {} },
      { name: 'jenkins_list_jobs', description: '任务列表（可按 folder 收窄）', required: [], example: {} },
      { name: 'jenkins_search_jobs', description: '按名字搜任务', required: [], example: { search: 'build' } },
      { name: 'jenkins_get_job_status', description: '一个任务的状态与最近构建', required: ['jobName'], example: { jobName: 'demo' } },
      { name: 'jenkins_get_recent_builds', description: '最近几次构建的编号与结果', required: ['jobName'], example: { jobName: 'demo' } },
      {
        name: 'jenkins_get_build_status',
        description: '一次构建的结果、时长、参数',
        required: ['jobName', 'buildNumber'],
        example: { jobName: 'demo', buildNumber: 1 },
      },
      {
        name: 'jenkins_get_console_log',
        description: '控制台输出（排错主入口）',
        required: ['jobName'],
        example: { jobName: 'demo', buildNumber: 1, limit: 200 },
      },
      {
        name: 'jenkins_get_pipeline_stages',
        description: '流水线各阶段与耗时',
        required: ['jobName', 'buildNumber'],
        example: { jobName: 'demo', buildNumber: 1 },
      },
      {
        name: 'jenkins_get_build_changes',
        description: '这次构建带的提交',
        required: ['jobName', 'buildNumber'],
        example: { jobName: 'demo', buildNumber: 1 },
      },
      { name: 'jenkins_list_nodes', description: '节点与在线状态', required: [], example: {} },
    ],
  },
]

export function findServer(id: string): McpServer | undefined {
  return MCP_SERVERS.find(s => s.id === id)
}

export const KIND_ORDER: RunKind[] = ['llm', 'agent', 'mcp', 'shell']

/** A preset's args are the tool's own object, so the shape stays open. */
export type McpPreset = {
  label: string
  tool: string
  args: Record<string, unknown>
}

/** One preset per useful call, matched to a server by tool name — a starting point, not a limit. */
export const MCP_PRESETS: McpPreset[] = [
  { label: 'Jira 版本', tool: 'jira_server_info', args: {} },
  { label: 'Jira 当前账号', tool: 'jira_get_current_user', args: {} },
  {
    label: '我名下最近 5 条',
    tool: 'jira_search_issues',
    args: {
      jql: 'assignee = currentUser() ORDER BY created DESC',
      fields: ['summary', 'status', 'assignee'],
      maxResults: 5,
    },
  },
  { label: '字段目录', tool: 'jira_get_fields', args: {} },
  { label: 'GitLab 当前账号', tool: 'gitlab_whoami', args: {} },
  { label: '搜项目', tool: 'gitlab_project_search', args: { search: 'demo' } },
  { label: '项目的 opened MR', tool: 'gitlab_mr_list', args: { project: 'group/project', state: 'opened' } },
  { label: '一个 MR 的流水线', tool: 'gitlab_mr_pipelines', args: { project: 'group/project', iid: 1 } },
  { label: 'Jenkins 版本', tool: 'jenkins_get_version', args: {} },
  { label: '任务列表', tool: 'jenkins_list_jobs', args: {} },
  { label: '最近构建', tool: 'jenkins_get_recent_builds', args: { jobName: 'demo' } },
  { label: '控制台输出', tool: 'jenkins_get_console_log', args: { jobName: 'demo', buildNumber: 1, limit: 200 } },
]
