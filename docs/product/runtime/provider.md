---
status: shape-locked
progress: settled
updated: 2026-10-01
---

# Provider injection

Layer: [Runtime](README.md). Index: [features.md](../features.md).

- Owner: Runtime, constructed by Shell and injected into Host.
- Input: `runtimeProvider.id` plus optional `{ provider, model, options }` from config. The provider exposes `id`, optional `label`, optional `configure`, `llm`, `agent`, optional `healthy`, `start`, `stop`, and optional `describe` for Settings fields (`string`, `secret`, `select`).
- Output: Host calls `configure`, then `start`, then routes `ctx.llm` and `ctx.agent` to that object. Settings lists only providers Shell registered. `echo` is always registered.
- Failure: a config id that is not registered fails Host boot. `start` throwing fails Host boot. Pi registers before listen and loads after the sidecar starts. A failed Pi load leaves the id registered and unhealthy. A later call when the provider is unhealthy throws on that call, and names the load failure. The app still loads.
- Pi's load asks the filesystem whether its peers are in the prefix, repairs them when they are not, and only then makes the one loader call an attempt makes. It never asks the loader before the repair: the runtime remembers a failed resolution for the life of the process, so a probe first would leave a repaired prefix reporting Pi unavailable until the next restart. A failed attempt is not remembered either; the next call retries it, which is what a hot update needs. A repair that fails is a load failure, not a rejected promise.
- Non-goals: the provider implementing bash, HTTP, storage, push, MCP, or authoring tools; Host shipping a vendor adapter; a chat session reused as the app brain.

Echo: `llm` returns the prompt unchanged; `agent` returns the goal unchanged and emits `status` running then `done`; `healthy` is true; the tool set is empty.

## Implementation


Role: seam. Shell registers providers and injects one into Host. Host calls `configure`, then `start`, and routes `ctx.llm` and `ctx.agent`. Host does not embed a vendor. `echo` lives in `@mohou/runtime-provider`. Pi lives in `@mohou/runtime-pi` and registers itself. A missing id fails boot with `config-invalid`. `start` throwing fails boot. A Pi load that fails after registration does not. Plan: [implementation.md](../implementation.md).
