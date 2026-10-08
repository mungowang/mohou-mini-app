---
status: shape-locked
progress: settled
updated: 2026-09-29
---

# ctx.http

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. Host performs the request.
- Input: `ctx.http(url)` or `ctx.http(url, opts)` or `ctx.http({ url, ...opts })`. `opts` is `method`, `headers`, `query`, `body`, `timeout`, `signal`. Object `body` is sent as JSON. A `content-type` the caller already set is kept, in any letter case. When the caller sets none, the request uses `application/json`. `query` values are strings, numbers, booleans, `null`, or `undefined`.
- Output: `{ ok, status, headers, text, json }`. `ok` follows the status class. `json` is the parsed body only when the content type contains `json` and parsing succeeds; otherwise `null`.
- Failure: HTTP 4xx and 5xx do not throw and have no code. The caller checks `ok` and `status`. Timeout emits `http-timeout`. A non-http(s) URL emits `http-scheme`. An oversize body emits `http-too-large`. A network failure emits `http-network` with the underlying error as `cause`. An omitted `timeout` uses the resolved host policy. A caller `timeout` outside that policy emits `http-policy` before the request is sent. The body cap is the same policy. The call's `ctx.signal` aborts the request along with any `opts.signal`. Callers match the code. Codes: [implementation.md](../implementation.md).
- Non-goals: a platform `Response` object; shelling out to an HTTP client; a host-side allowlist of hosts.

## Implementation


Role: definition. Host provides the call until a second HTTP provider exists. Do not split a package for this one implementation. 4xx and 5xx stay in the result. Policy failures emit a code before the socket opens. Plan: [implementation.md](../implementation.md).
