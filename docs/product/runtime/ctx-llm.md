---
status: shape-locked
progress: settled
updated: 2026-10-08
---

# ctx.llm

Layer: [Runtime](README.md). Index: [features.md](../features.md).

- Owner: Runtime.
- Input: `ctx.llm(prompt, opts?)`. Shared options: `provider`, `model`, `system`, `schema`, `maxTokens`, `retryTimes`, `signal`, `images`. `stream` defaults to false. Omitted `provider` and `model` use the runtime provider config. Omitted `maxTokens` and `retryTimes` use the resolved host policy. A caller value outside that policy fails the call. `retryTimes` counts the first attempt. `images` is optional. Each item is `{ mimeType, data }` or `{ path }`, not both. `data` is base64 with no `data:` prefix. `path` is an absolute path or a `file:` URI. The host reads that file. An `http` or `https` URI is not a path. A relative path is not a path. A path may omit `mimeType`; the host takes it from the extension. Data requires `mimeType`. The admitted types are `image/png`, `image/jpeg`, `image/gif`, and `image/webp`. Count and decoded size are host policy.
- Output: a string when `stream` is omitted or false. `schema` is a JSON Schema hint plus fence stripping. The caller parses it. When `stream` is true, the same object is an async iterable of `status`, `text-delta`, `error`, and `done`, and awaiting it is still the final string. `done` is that call's final string. The iterable does not reach the UI. A method that wants the UI to see text `yield`s it. `llmEventType` from `@mohou/ui` lists those `type` values. A view does not write `"text-delta"`. The same union is `LlmEvent` from `@mohou/ui`.
- Failure: no live provider throws. An empty completion throws. Cancel throws `cancelled`. Retries exhaust and throw the last error. A caller image outside policy, including a missing path, fails with `model-policy` before the provider runs. A brain or model that cannot accept images fails with `image-unsupported` and is not retried. Echo cannot. A throwing app does not leave a session behind.
- Non-goals: a separate `ctx.llm.stream` method; a tool list on this call; copying this iterable onto `streamCall`. The method yields what the UI should see.

## Implementation


Role: Host wraps the provider call. A `schema` option strips one fence and still returns a string. `stream` true is a pull stream. Empty result emits `empty-completion`. Cancel emits `cancelled` and is not retried. Exhausted retries emit `retry-exhausted`. A caller budget outside policy emits `model-policy` before the provider runs. Host reads a path image before that call and passes bytes. The brain does not see a path. Token, retry, image count, and image size are host policy and are not locked. Plan: [implementation.md](../implementation.md).
