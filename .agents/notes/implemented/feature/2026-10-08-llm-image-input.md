# Agent Note: Image input on ctx.llm and ctx.agent

Status: implemented

## Problem

`ctx.llm` and `ctx.agent` took a string only. A pasted image has no path. A file that is already on disk should not be read in the view and sent through the call as base64.

## Decision

`images` is an optional list on the shared model options. Each item is `{ mimeType, data }` or `{ path }`, not both. `path` is an absolute path or a `file:` URI. Host reads that file and passes bytes. The brain never sees a path. An `http` or `https` URI is rejected. Echo and a model whose catalog input has no `image` fail with `image-unsupported`, and that failure is not retried. Count, decoded size, and the four mime types are checked before the provider runs.

## Alternatives considered

- Data only. Lost: a file the API already has would be read twice and inflated across the call.
- A web URL the host fetches. Lost: that is a new network path. The caller already has `ctx.http`.
- The brain reads the path. Lost: every provider would grow a filesystem, and a skipped resolve would leak a path into the model call.

## Consequences

The return stays a string. A browser file input still has no path; that case uses `data`. The iframe does not gain a native path picker.
