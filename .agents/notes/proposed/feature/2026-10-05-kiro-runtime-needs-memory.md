# Agent Note: Kiro needs an in-memory session

Status: proposed

Product home: [Kiro](../../../docs/product/runtime/kiro.md). That page owns the call. This note owns why.

Supersedes [Kiro stays resident](../../rejected/feature/2026-10-05-kiro-runtime-stays-resident.md).

## Problem

A Kiro brain has to match Pi: one completion and one agent session inside the host process, with no Kiro session record and no change to the user's Kiro permissions. The CLI and ACP both write `~/.kiro/`.

## Proposal

Do not register a Kiro provider until Kiro publishes an in-process session that does not save. Shell keeps constructing `echo` and Pi.

## Alternatives considered

- One resident `kiro-cli acp` process, with a new session per call and `allow_once`. The process still writes the local session database, and `--resume` in that directory can pick the row up. `--ephemeral` was closed as not planned. Rejected. See the superseded note.
- `ns-omp-provider-kiro` for `ctx.llm`. It is a third-party client of an unpublished model endpoint, and it does not run Kiro's agent. Rejected as this provider.
- Kiro Crew's SDK. That gateway keeps Crew sessions, and it is a different product. Rejected.

## Acceptance criteria

- No package under `packages/runtime/kiro`.
- Shell does not spawn `kiro-cli` for `ctx.llm` or `ctx.agent`.
- A future API is acceptable only when a call leaves `~/.kiro/` unchanged and does not write `permissions.yaml`.

## Risks

- Kiro's own write-up says the harness is a process so that clients do not link a library. The in-process shape may not arrive.
- A model-only HTTP client would cover `ctx.llm` and still leave `ctx.agent` without Kiro's tools.
