---
status: draft
progress: open
updated: 2026-10-08
---

# Kiro

Layer: [Runtime](README.md). Index: [features.md](../features.md).

This brain is the same shape as Pi. `ctx.llm` is one completion in this process. `ctx.agent` is one in-memory session. Neither call writes a Kiro session record, and neither call changes the user's Kiro permissions. The package is not created while Kiro has no such API.

Installing the writing skill or the authoring MCP server into Kiro is [Supported agents](../mcp-client/supported-agents.md). The form is [Settings](../panel/settings.md).

- Owner: Runtime, constructed by Shell and injected into Host. The package would be `@mohou/runtime-kiro`. Host does not import it.
- Input: `runtimeProvider.id` of `kiro`, plus optional `{ provider, model, options }` from config. Login stays where Kiro already stores it: the `kiro-cli login` session (Builder ID, IAM Identity Center, GitHub, or Google), or a `KIRO_API_KEY` already in the environment.
- Output: none until an in-process API exists. Settings does not gain a `kiro` row for a CLI wrapper.
- Failure: there is no call to fail. A wrapper that saves into `~/.kiro/` is not this provider.
- Non-goals: `kiro-cli chat`; `kiro-cli acp`; a cloud session; writing `permissions.yaml`; reading `~/.aws`.

## What Kiro publishes

The agent harness is a standalone process. Clients cross it with the Agent Client Protocol. Kiro does not publish a library that runs a completion or an agent session inside the host process.

`kiro-cli chat` and `kiro-cli acp` both save the session. The CLI writes every turn into the local database under `~/.kiro/`, keyed by working directory. `kiro-cli chat --resume` in that directory can pick that row up. A requested `--ephemeral` / `--no-save` flag was closed as not planned. Closing or deleting the row afterwards still creates it first.

An `allow_always` permission answer can write `~/.kiro/settings/permissions.yaml` or the workspace file under `~/.kiro/workspace-roots/`. The IDE reads those files.

## What is not this provider

`ns-omp-provider-kiro` calls the model endpoint with the machine's Kiro login. That is a completion client kept by someone else. It does not run Kiro's tools, and the endpoint is not a contract on Kiro's docs. Kiro Crew's SDK drives a Crew gateway, which keeps its own sessions.

## Implementation

Role: none yet. Shell does not register a Kiro brain. [implementation.md](../implementation.md) gains no row while this page is draft.
