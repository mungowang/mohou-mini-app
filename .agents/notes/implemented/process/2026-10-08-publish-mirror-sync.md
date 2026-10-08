# Agent Note: Publish queues an npmmirror sync

Status: implemented

## Problem

`pnpm publish:packages` uploaded the workspace packages to npmjs and stopped. npmmirror does not show a new version until something asks it to sync. The Tencent mirror answered the package read without a sync route.

## Decision

After a successful upload, `publishAll` sends `PUT /-/package/<name>/syncs` to `https://registry.npmmirror.com` for each workspace package. The step is on unless the command line contains `--no-mirror-sync` or `MINI_APP_MIRROR_SYNC` is `0` or `false`. The flag wins. `publish:check` does not call the mirror. A failed queue exits 1 after the upload has already finished. The command is [development.md](../../../../docs/development.md).

## Alternatives considered

- Queue the Tencent mirror the same way. Lost because `PUT https://mirrors.cloud.tencent.com/npm/-/package/@mohou/shell/syncs` answers 404.
- Wait until npmmirror reports the new version. Lost because the request only joins a queue, and the upload has already succeeded.
- A second command that publish does not run. Lost because the default publish is the moment the mirror should be asked.

## Consequences

- A sync failure does not unpublish the packages. The process exit is about the queue.
- Turning the step off leaves npmmirror on its own schedule.
- The Tencent mirror is not queued.
