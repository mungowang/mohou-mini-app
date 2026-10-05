# Agent Note: Kiro stays resident

Status: proposed

Product home: [Kiro](../../../docs/product/runtime/kiro.md). That page owns the call. This note owns why.

Supersedes [one process per Kiro call](../../rejected/feature/2026-10-05-kiro-runtime.md).

## Problem

Mini-apps can use Pi as a brain. Kiro is already a destination for the writing skill and the authoring MCP server, and a machine may already be signed in with Builder ID or IAM Identity Center. A simple `ctx.llm` call cannot pay for starting `kiro-cli` each time.

## Proposal

Add `@mohou/runtime-kiro` as a `RuntimeProvider` Shell registers beside Pi. One `kiro-cli acp --agent-engine v3` process stays up. A call is `session/new` plus `session/prompt` on its own `sessionId`. Calls on that process run together, and every update is routed by `sessionId`. The CLI's existing login is the credential. `KIRO_API_KEY` is left in the environment when it is already there.

An llm session selects a mode with no tools and rejects permission requests. An agent session answers `allow_once` and does not answer `allow_always`. The process is shared. The session is not.

## Alternatives considered

- One `kiro-cli chat --no-interactive` process per call. The startup dominates a short completion. Rejected. See the superseded note.
- Two ACP processes, and a queue on each, so a completion cannot overlap an agent run. Sessions already carry the messages, the directory, the model, and the permission answer. A queue would also hide a CLI that refuses an overlapping prompt. Rejected.
- Require `KIRO_API_KEY` before the brain is healthy. The CLI prefers the `kiro-cli login` session, and that session is how an AWS sign-in is stored. Rejected.
- Point `KIRO_HOME` at a temporary directory so sessions cannot mix with the user's chats. That also hides the login session and the user's Kiro skills. Rejected.
- Teach Host to spawn `kiro-cli`. Host does not embed a vendor. Rejected.
- When a call cannot close its session, delete the newest session for that directory. That can delete the user's own chat. Rejected.

## Acceptance criteria

- With `kiro` selected, a signed-in `kiro-cli whoami` makes the settings probe healthy, and a missing binary or a signed-out CLI does not.
- A probe does not start `kiro-cli login`, does not start `kiro-cli acp`, and does not change `host.json`.
- Two calls in one host life start `kiro-cli acp` once, on two session ids, and neither waits for the other inside this provider.
- A call's answer does not contain the other call's prompt.
- `ctx.llm` does not write the file a prompt asks it to create.
- Aborting a call sends `session/cancel` for that session and leaves the process running for the other session.
- An agent permission answer is `allow_once`.
- The parser is covered by a recorded fixture. `pnpm test` does not require `kiro-cli` on `PATH`.

## Risks

- ACP update fields are not pinned until a recorded fixture exists.
- A mode that lists no tools may still receive Kiro's default tools. `ctx.llm` is not done until a real run shows it does not.
- A call that cannot close its session leaves that session in Kiro's store.
- No ACP field carries `maxTokens`. Host can reject an out-of-policy caller value and still cannot cap the prompt.
- The first call still pays for process start. The process dying fails every session on it, and the next call pays for the start again.
- Kiro may still run only one turn inside the process. That shows up as a failed or stalled overlapping prompt, which this provider does not turn into a queue.
- `allow_once` depends on the CLI offering that option. A payload that only offers broader allows fails the agent call rather than persisting consent.
