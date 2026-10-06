---
status: shape-locked
progress: settled
updated: 2026-10-05
---

# ctx.log

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host writes the file; the app only calls.
- Input: `ctx.log(...args)` with any values.
- Output: nothing. One JSON line per call, appended to `apps/<appId>/logs/app.log`, with the values as they arrived.
- Failure: a write never throws into the app and is not reported back. Past the cap the oldest sealed segment is deleted, so the oldest records are gone and the newest are not. Nothing reads the log back for the app: the file is the record, and the app directory is where a person opens it.
- Numbers: one record per line; a record is written whole even when it is larger than a segment. The active file is sealed at 1 MiB. The cap across one app's segments is 5 MiB. Segment size is host policy; the cap is host policy.
- Non-goals: levels and severities; a UI; retention by age; a second destination. This is the app's own log and not the host log or `launcher.log`.
- Secrets: the file sits under the app directory and is not scrubbed after the fact. Do not log credentials — the values passed here are written as they are.

## Implementation

Role: definition. Host provides the call. [Host log](../host/log.md) owns the writer, the segment policy, and the cap. `createHostLog(runtimeRoot, maxBytes)` appends JSONL and never reads the log to write one: it uses stat, rename, and unlink. The app-facing call is `log.write(appId, ...args)` through the call capabilities.
