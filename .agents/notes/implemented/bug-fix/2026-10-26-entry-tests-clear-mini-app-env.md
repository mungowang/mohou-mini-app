# Agent Note: Entry tests clear inherited MINI_APP_ env

Status: implemented

## Problem

`packages/shell/tests/entry.spec.ts` spread `process.env` into the child. A live packaged Mohou sets `MINI_APP_SUPERVISED=1` on the shell. The skip-window case then took the supervised path and never exited, so the test hung for its full 60s budget.

## Decision

Entry tests build the child env through `entryEnv`, which drops every `MINI_APP_*` key from the parent before applying the case's own values. The supervised case sets `MINI_APP_SUPERVISED=1` explicitly.

## Alternatives considered

- Only clear `MINI_APP_SUPERVISED` in the skip-window case. Lost: other host-owned keys (`MINI_APP_PANEL`, runtime, port) can still bind the child to a live install.
- Require developers to unset the variables before `pnpm test`. Lost: a packaged app leaves them on the shell by design.

## Consequences

A check run while Mohou.app is open no longer hangs on the skip-window entry case. Other suites that spawn Host and still spread raw `process.env` remain a risk if they assume an unsupervised shell.
