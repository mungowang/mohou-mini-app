# Agent Note: Kiro as a runtime provider

Status: rejected — a process per call is too heavy for ctx.llm

Superseded by [Kiro stays resident](../../proposed/feature/2026-10-05-kiro-runtime-stays-resident.md).

## Problem

Mini-apps can use Pi as a brain. Kiro is already a destination for the writing skill and the authoring MCP server, and a machine may already be signed in with Builder ID or IAM Identity Center. There is no brain that runs that CLI.

## Proposal

Add `@mohou/runtime-kiro` as a `RuntimeProvider` Shell registers beside Pi. One call spawns one `kiro-cli chat --no-interactive` process. The CLI's existing login is the credential. `KIRO_API_KEY` is left in the environment when it is already there.

`ctx.agent` runs in the directory Host resolved, with Kiro's tools trusted for that process. `ctx.llm` runs in a fresh temporary directory against an agent file that lists no tools.

## Alternatives considered

- `kiro-cli acp` as a standing JSON-RPC client. Each product call is one shot, and the V2 and V3 method sets differ. This alternative won after the process-per-call cost was counted. See the superseding note.
- Require `KIRO_API_KEY` before the brain is healthy. The CLI prefers the `kiro-cli login` session, and that session is how an AWS sign-in is stored. Rejected.
- Point `KIRO_HOME` at a temporary directory so sessions cannot mix with the user's chats. That also hides the login session and the user's Kiro skills. Rejected.
- Teach Host to spawn `kiro-cli`. Host does not embed a vendor. Rejected.
- When the stream has no session id, delete the newest session for that directory. That can delete the user's own chat. Rejected.

## Acceptance criteria

- With `kiro` selected, a signed-in `kiro-cli whoami` makes the settings probe healthy, and a missing binary or a signed-out CLI does not.
- A probe does not start `kiro-cli login` and does not change `host.json`.
- `ctx.agent` is one process whose working directory is the directory Host resolved, and whose tools are Kiro's.
- `ctx.llm` does not write the file a prompt asks it to create.
- Aborting a call kills that process and surfaces `cancelled`.
- A session id present in the stream is deleted. A missing id deletes nothing.
- The stream parser is covered by a recorded fixture. `pnpm test` does not require `kiro-cli` on `PATH`.

## Risks

- `stream-json` and `--list-models` have no published field list. The parser cannot be finished from the docs alone.
- An agent file with an empty tool list may still receive Kiro's default tools. `ctx.llm` is not done until a real run shows it does not.
- An agent run whose stream omits the session id remains in that directory's Kiro history.
- The CLI accepts no `maxTokens` flag. Host can reject an out-of-policy caller value and still cannot cap the process.
- Each call pays a process start.
