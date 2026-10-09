---
status: shape-locked
progress: settled
updated: 2026-10-08
---

# ctx.agent

Layer: [Runtime](README.md). Index: [features.md](../features.md).

- Owner: Runtime. Host resolves the working directory before the provider runs.
- Input: `ctx.agent(goal, opts?)` with the shared options plus `maxIterations`, `stream`, `cwdType`, `cwd`. `images` is the same field as [ctx.llm](ctx-llm.md). `stream` defaults to false. Omitted `retryTimes` and `maxIterations` use the resolved host policy. A caller value outside that policy fails the call. `cwdType` is `app`, `process`, `temp`, or `custom`. Default is `process`. A `cwd` path alone means `custom`. `cwd` plus a non-custom `cwdType` fails the call. `custom` requires an absolute `cwd`.
- Output: a string when `stream` is omitted or false. When `stream` is true, the same object is an async iterable. Events are `status` (`running` or `idle`), `text-delta`, `tool` (`start` or `end`, with `name`, optional `args`, optional `result`), `turn` (`start` or `end`, with `turn` and optional `reason`), `error`, and `done`. `reason.kind` includes `completed`, `blocked`, `error`, `aborted`, and `max-tokens`. Awaiting it is still the final string. `done` is that call's final string. The iterable does not reach the UI. `agentEventType` from `@mohou/ui` lists those `type` values, including `tool` and `turn`. The same union is `AgentEvent` from `@mohou/ui`.
- `maxIterations` is a soft cap. Host cancels the run after that many completed turns.
- The run is isolated from the user's chat session and disposed when it finishes.
- Failure: unbound provider, empty result, and cancel throw. Those messages name `agent:`. A caller image outside policy fails with `model-policy`. A brain or model that cannot accept images fails with `image-unsupported` and is not retried. A tool error inside the run is an event; the final string is still the return unless the provider ends in error, in which case the call throws.
- Non-goals: faking an agent with a loop of `ctx.llm`; the app passing a tool list; persisting every event to storage (the snapshot is the author's job, once per stage, not once per token).

## Implementation


Role: Host resolves cwd before the provider runs. Failures are prefixed `agent:`. Cancel is not retried. A bad cwd emits `cwd-invalid`. `stream` true is a pull stream. The return stays a string. Pi opens one in-memory coding-agent session for that call and does not write a session file. The loader uses Pi's agent directory, so that directory's extensions, skills, and packages are in the run. The provider does not pass a tool allowlist. Those tools are Pi's, not `ctx.mcp` and not Host's bash. `llm` is one `ModelRuntime.completeSimple` call. Pi chooses the provider API. Echo stays one step. Plan: [implementation.md](../implementation.md).
