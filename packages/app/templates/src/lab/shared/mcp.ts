import type { RunKind } from './events'

/**
 * The host's connected MCP servers, as read while authoring this app with the authoring tools
 * (`mini_app_mcp_list` / `mini_app_mcp_tools`). `ctx` has no server-discovery member, so the app
 * ships this catalog to offer choices. A call to a server that is not connected fails on its own.
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

/**
 * The connected `filesystem` server is launched with this directory as its only allowed root
 * (see `~/.mini-app/runtime/mcp.json`), so every seeded path stays inside it. `ctx` has no
 * server-discovery member, which is why the root is spelled out here rather than discovered.
 * The `list_allowed_directories` tool in the picker answers the same question at runtime.
 */
export const WORKSPACE_ROOT = '/Users/wangpeng/Workspace/DeepSeekRoot'

export const MCP_SERVERS: McpServer[] = [
  {
    id: 'filesystem',
    label: 'filesystem · 本机文件',
    note: `允许的根目录 ${WORKSPACE_ROOT}`,
    tools: [
      {
        name: 'list_directory',
        description: '列出目录内容，带 [FILE] / [DIR] 前缀',
        required: ['path'],
        example: { path: WORKSPACE_ROOT },
      },
      {
        name: 'read_text_file',
        description: '按文本读一个文件，可用 head / tail 只取若干行',
        required: ['path'],
        example: { path: `${WORKSPACE_ROOT}/hermes-memo/README.md`, head: 40 },
      },
      {
        name: 'directory_tree',
        description: '递归目录树',
        required: ['path'],
        example: { path: `${WORKSPACE_ROOT}/hermes-memo/scripts` },
      },
      {
        name: 'read_multiple_files',
        description: '一次读多个文件',
        required: ['paths'],
        example: { paths: [`${WORKSPACE_ROOT}/hermes-memo/package.json`] },
      },
      {
        name: 'search_files',
        description: '按模式搜索文件',
        required: ['path', 'pattern'],
        example: { path: `${WORKSPACE_ROOT}/hermes-memo`, pattern: '*.md' },
      },
      {
        name: 'get_file_info',
        description: '文件元信息：大小、时间、权限',
        required: ['path'],
        example: { path: `${WORKSPACE_ROOT}/hermes-memo/package.json` },
      },
      {
        name: 'list_allowed_directories',
        description: '这个 server 被允许访问的根目录',
        required: [],
        example: {},
      },
      {
        name: 'read_media_file',
        description: '读图片/音频，返回 base64',
        required: ['path'],
        example: { path: `${WORKSPACE_ROOT}/hermes-memo/LICENSE` },
      },
    ],
  },
  {
    id: 'jira',
    label: 'jira · Jira Server + Zephyr Scale',
    note: '全部只读：Jira 侧 8 个 + Zephyr 测试用例 9 个；写操作走各自界面。实例走 VPN，未连 VPN 时调用会失败',
    tools: [
      {
        name: 'jira_server_info',
        description: '确认 Jira 版本与部署类型（Server / Cloud），不取业务数据',
        required: [],
        example: {},
      },
      {
        name: 'jira_get_issue',
        description: '读一个 issue，默认带回全部字段，自定义字段也在里面',
        required: ['key'],
        example: { key: 'QA-1' },
      },
      {
        name: 'jira_search_issues',
        description: '用 JQL 搜索 issue，可用 fields 只取需要的字段',
        required: ['jql'],
        example: { jql: 'project = QA ORDER BY created DESC', fields: ['summary', 'status', 'assignee'], maxResults: 5 },
      },
      {
        name: 'jira_list_projects',
        description: '列出当前账号可见的项目',
        required: [],
        example: {},
      },
      {
        name: 'jira_get_fields',
        description: '列出全部字段（含插件提供的），用来查字段 id 是否是 customfield_xxxxx',
        required: [],
        example: {},
      },
      {
        name: 'jira_describe_create',
        description: '创建 issue 前先调它：返回该项目/类型的可写字段、必填项、值形状和可选值',
        required: ['projectKey', 'issueTypeName'],
        example: { projectKey: 'QA', issueTypeName: 'Task' },
      },
      {
        name: 'jira_list_comments',
        description: '列出某个 issue 的评论',
        required: ['key'],
        example: { key: 'QA-1' },
      },
      {
        name: 'jira_get_transitions',
        description: '列出这个 issue 当前可用的状态流转，id 就是流转时要传的 transitionId',
        required: ['key'],
        example: { key: 'QA-1' },
      },
      // Zephyr Scale 测试用例。同一个 MCP server，工具名没有 jira_ 前缀。
      {
        name: 'search_test_cases',
        description: '用 TQL 搜测试用例（这里按当前用户 owner 过滤）；语法严格，运算符两侧要有空格、值用双引号',
        required: ['query'],
        example: {
          query: 'projectKey = "QA" AND owner = "rainie.lu"',
          fields: ['key', 'name', 'status', 'priority', 'folder', 'lastTestResultStatus'],
          maxResults: 20,
        },
      },
      {
        name: 'get_test_case',
        description: '读一个测试用例；STEP_BY_STEP 的每个步骤都带数值 id，按 id 改才不会丢步骤',
        required: ['testCaseKey'],
        example: { testCaseKey: 'QA-T2' },
      },
      {
        name: 'get_latest_result_for_test_case',
        description: '某个用例最近一次执行的结果：状态、环境、执行人',
        required: ['testCaseKey'],
        example: { testCaseKey: 'QA-T2' },
      },
      {
        name: 'get_test_cases_linked_to_issue',
        description: '某个 issue 关联的测试用例；按 link 返回，同一用例可能重复出现',
        required: ['issueKey'],
        example: { issueKey: 'TA-11616' },
      },
      {
        name: 'get_issue_test_coverage',
        description: '某个 issue 的测试覆盖：关联用例 + 各自最近一次执行。看需求/缺陷和用例的追溯',
        required: ['issueKey'],
        example: { issueKey: 'TA-11616' },
      },
      {
        name: 'get_custom_field_definitions',
        description: '该项目的用例自定义字段定义；customFields 的键是字段名，不是 id',
        required: ['projectKey'],
        example: { projectKey: 'QA' },
      },
      {
        name: 'get_status_options',
        description: '执行状态 / 用例状态 / 优先级的「确切」名字，大小写敏感，写错了会被拒',
        required: ['projectKey'],
        example: { projectKey: 'QA' },
      },
      {
        name: 'get_folder_tree',
        description: '用例文件夹树：路径与数值 folderId 都在这；列表接口拿不到它',
        required: ['projectKey'],
        example: { projectKey: 'QA' },
      },
      {
        name: 'find_jira_user',
        description: '把 Jira user key 换成能看懂的名字（owner / executedBy 要的就是 key）',
        required: ['query'],
        example: { query: 'Rainie' },
      },
    ],
  },
]

/**
 * The same tool surface, served by the published package rather than by this checkout. Registered
 * in the host as `jira-npm`, so the panel can compare "what a user installs" against "what we are
 * editing" - the local entry keeps working offline and picks up source edits with no publish.
 */
const localJira = MCP_SERVERS.find(s => s.id === 'jira')
if (localJira) {
  MCP_SERVERS.push({
    ...localJira,
    id: 'jira-npm',
    label: 'jira · npm 发布版',
    note: '同一批工具，由 npm 上发布的 @mohou/jira-mcp 提供（跟随 latest）',
  })
}

export function findServer(id: string): McpServer | undefined {
  return MCP_SERVERS.find(s => s.id === id)
}

export const KIND_ORDER: RunKind[] = ['llm', 'agent', 'mcp']

/** A preset's args are the tool's own object, so the shape stays open. */
export type McpPreset = {
  label: string
  tool: string
  args: Record<string, unknown>
}

/** One preset per useful call, matched to a server by tool name — a starting point, not a limit. */
export const MCP_PRESETS: McpPreset[] = [
  { label: '列工作区目录', tool: 'list_directory', args: { path: WORKSPACE_ROOT } },
  {
    label: '读 README 前 40 行',
    tool: 'read_text_file',
    args: { path: `${WORKSPACE_ROOT}/hermes-memo/README.md`, head: 40 },
  },
  { label: '允许的根目录', tool: 'list_allowed_directories', args: {} },
  { label: 'Jira 版本', tool: 'jira_server_info', args: {} },
  {
    label: '最近 5 条 issue',
    tool: 'jira_search_issues',
    args: { jql: 'project = QA ORDER BY created DESC', fields: ['summary', 'status', 'assignee'], maxResults: 5 },
  },
  { label: '字段目录', tool: 'jira_get_fields', args: {} },
  {
    label: '我的用例前 20 条',
    tool: 'search_test_cases',
    args: {
      query: 'projectKey = "QA" AND owner = "rainie.lu"',
      fields: ['key', 'name', 'status', 'priority', 'folder', 'lastTestResultStatus'],
      maxResults: 20,
    },
  },
  { label: '读一个用例', tool: 'get_test_case', args: { testCaseKey: 'QA-T2' } },
  { label: 'issue 测试覆盖', tool: 'get_issue_test_coverage', args: { issueKey: 'TA-11616' } },
]
