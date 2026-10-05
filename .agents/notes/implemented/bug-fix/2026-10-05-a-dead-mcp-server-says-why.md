# Agent Note: A dead MCP server says why

Status: implemented

## Problem

Two stdio servers on Windows — the Jira and GitLab presets — answered a connection check with `MCP error -32000: Connection closed`. That message is what the transport reports when the child process is gone; it is identical for a package npm could not fetch, a token the server refused at startup, a missing runtime, and a crash. The check had done its job and reported the only thing the protocol gave it.

The process had said more. `transportFor` opens stdio servers with `stderr: 'pipe'`, and nothing ever read that pipe: the SDK captures it, the failure path threw the transport's error, and the child's own explanation was discarded one step before the person who needed it.

## Decision

**A failed start carries the child's last words.** `collectStderr(transport)` keeps a bounded tail of the piped stderr from before `connect` is called, and the failure message appends it — capped at 600 characters, trimmed, and passed through the same redaction as the spec's resolved references, which is what keeps a credential in a stack trace out of the panel.

**A short grace before reading it.** `connect` rejects when the socket closes, which can be a few milliseconds before the pipe drains. The failure path waits 100ms, which is enough for a process that has already exited and short enough not to be felt.

This is the same move as the launcher's `launcher.log` and the provider's `reason`: the layer that knows why hands it to the layer that shows it, instead of replacing it with a category.

## Alternatives considered

- **Leave the message and document the symptom.** The message is what a person pastes into a search box, and every cause would find the same advice.
- **Log the stderr and point at the log.** The panel shows the check's message inline; a log the person has to find is a second step for something already in hand.
- **Read stderr only after a failure.** Late: the stream may already have ended, and Node drops what nobody read.
- **Include everything, unbounded.** A server that fails after printing a screenful would put a screenful in a settings row.
- **Distinguish the causes ourselves** (sniff for `E404`, `ENOENT`, auth words). Guessing at another program's output, in place of quoting it.

## Consequences

A check that fails now names the cause when the server said one: the npm error, the missing token, the missing module. A server that dies silently still reports `Connection closed`, which is then the truth rather than a placeholder.

The tail is per connection attempt, so a reconnect does not inherit the previous attempt's output, and it is discarded with the transport.
