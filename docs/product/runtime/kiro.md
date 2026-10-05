---
status: draft
progress: open
updated: 2026-10-05
---

# Kiro

Layer: [Runtime](README.md). Index: [features.md](../features.md).

`ctx.llm` and `ctx.agent` share one `kiro-cli acp` process that stays up for the host's life. A call is a new session on that process. Calls run at the same time. The CLI keeps the login. This brain does not read AWS credential files and does not write an API key.

Installing the writing skill or the authoring MCP server into Kiro is [Settings](../panel/settings.md). That install is a different feature.

- Owner: Runtime, constructed by Shell and injected into Host. The package will be `@mohou/runtime-kiro`. Host does not import it. This page does not create the directory.
- Input: `runtimeProvider.id` of `kiro`, plus optional `{ provider, model, options }` from config. `options.effort`, when it is `low`, `medium`, `high`, `xhigh`, or `max`, is that call's reasoning effort. Login is the session from `kiro-cli login`: Builder ID, IAM Identity Center, GitHub, or Google. A `KIRO_API_KEY` already in the process environment stays there for the CLI.
- Output: Host calls `configure`, then `start`, then routes `ctx.llm` and `ctx.agent` here. Settings lists `kiro` beside `echo` and Pi. `start` resolves without spawning. The id stays registered and unhealthy until `kiro-cli whoami` exits 0.
- Failure: a missing binary or a signed-out CLI fails the call with `provider-unhealthy` and names the cause. The provider does not run `kiro-cli login` and does not open a browser. The process exiting mid-call fails every call still on it with `provider-unhealthy` and includes stderr. The next call starts the process again. An empty final string is `empty-completion`. `session/cancel` for that session is `cancelled`.
- Non-goals: one CLI process per call; a second process so that calls can avoid waiting; a provider-side queue; a key field in `host.json` or in Settings; reading `~/.aws`, `AWS_PROFILE`, or an instance role; passing Host bash or `ctx.mcp` into the CLI; `session/load`; changing `HOME` or `KIRO_HOME`.

## One process, one session per call

The binary is resolved on `PATH`, including Windows `PATHEXT`, and started with `execFile`. The child inherits the current environment. The command is `kiro-cli acp --agent-engine v3 --auth-method=cli`. The first call starts it. Later calls reuse it. `stop` kills it.

A call does not reuse a session. `session/new` passes `mcpServers: []`, the working directory, and the initial mode, model, and effort for that call. Model, effort, and mode changes after that go to that `sessionId`. The provider does not load an existing session. Updates and permission requests are dispatched by `sessionId`. A call never reads another call's chunks.

What the calls share is the process: the CLI login, and the skills, steering, hooks, and MCP servers already in the user's Kiro home. They do not share messages, working directory, model, effort, or mode. A permission answer is for the option and the resource on that request. The provider does not answer `allow_always`, so one call does not write a standing allow into the user's policy.

`initialize` advertises no filesystem and no terminal. Tool work stays inside `kiro-cli`.

The provider does not queue calls. Two calls are two sessions with prompts in flight together. If the CLI rejects or stalls an overlapping `session/prompt`, that call fails in the open. The provider does not hide it by waiting.

## Probe

`healthy` runs `kiro-cli whoami --format json` and is true when that command exits 0. `reason` is the CLI's text when it does not. A failed probe is not remembered. The next call tries again, so a login made after boot becomes visible without a restart. The probe is not on the call path.

`models` runs `kiro-cli chat --list-models --format json`. A failure returns an empty list. That command is not on the call path. The JSON fields are open until a recorded payload is in the package tests. A payload that is a flat list of ids becomes one group named `kiro`.

## Calls

A call sends `session/new`, then sets the model and effort through the config options `initialize` advertised, then `session/prompt`. `system`, when present, is the first part of that prompt. `schema`, when present, is the next part and asks for one JSON value that matches it. The prompt or the goal is the last part. Host still strips one fence after the string comes back. Host still checks `maxTokens` before the provider runs. No ACP field carries it.

A call that names a model, when the advertised options have no model field, fails `provider-unhealthy` instead of running a different model. Setting the model on one session does not change another session.

`ctx.agent` uses the absolute directory Host already resolved. The tools that run are Kiro's own file, shell, web, and MCP tools. A `session/request_permission` is answered with an `allow_once` option the CLI offered. The provider does not answer `allow_always`.

`ctx.llm` uses a new temporary directory as `session/new`'s `cwd`, and selects an agent mode that lists no tools. The directory is removed when the prompt finishes, including when the call is cancelled or fails. A permission request on this session is rejected with an option the CLI offered. If every offered option allows the tool, the call fails `provider-unhealthy`. `ctx.llm` stays open until a recorded run shows that a prompt which asks to create a file leaves that directory without the file.

## Events

`agent_message_chunk` becomes `text-delta`. `tool_call` and `tool_call_update` become `tool`. A turn that settles while the prompt is still running becomes `turn`, so Host can abort at `maxIterations`. The prompt response is the returned string and the last `turn` end. Field names inside those updates are open until a recorded fixture is in the package tests. The parser is tested from that fixture and does not spawn `kiro-cli`.

Abort sends `session/cancel` for that `sessionId` and leaves the process up. Other sessions keep running. When cancel does not return, the provider kills the process, fails the aborted call as `cancelled`, fails every other call still on it as `provider-unhealthy`, and the next call starts the process again.

## Sessions

Each call creates a session and does not reuse it. When the negotiated capabilities advertise `session/close`, the provider closes that `sessionId` after the prompt finishes, including on cancel and failure. When they advertise a delete for one id, it uses that too. When neither is advertised, that saved session stays. The provider does not delete the newest session for that directory.

Two agent calls whose directories overlap can both write those files. That is Kiro's tools running in parallel, not one session reading the other session's messages. `ctx.llm` uses its own temporary directory, so its tools are not pointed at the app directory.

## Implementation

Role: provider. Shell registers this brain beside Pi. Host routes `ctx.llm` and `ctx.agent` through the existing provider interface. The interface stays in `@mohou/runtime-provider`. [implementation.md](../implementation.md) gains no row while this page is draft.
