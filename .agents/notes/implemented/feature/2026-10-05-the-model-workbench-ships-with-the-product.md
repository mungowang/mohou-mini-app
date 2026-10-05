# Agent Note: The model workbench ships with the product

Status: implemented

## Problem

The workbench that exercises `ctx.llm`, `ctx.agent`, and `ctx.mcp` lived in one runtime root. It was authored there, so a fresh install had nothing to try the model surface with, and the app carried the machine it was written on: an absolute `WORKSPACE_ROOT`, an MCP catalog whose first server was the local `filesystem` one, and example values naming a colleague, an internal project, and two ticket keys.

The MCP section gained Quick add for this product's own servers in the same change, which made the second half of the problem visible: the app's MCP tab named `filesystem` and a `jira-npm` clone of a checkout, while the product publishes exactly two servers a person can add.

## Decision

**It is a startup sample, like `today` and `board`.** The template lives in `packages/app/templates/src/lab`, `gen:skill` copies it into the skill, and `ensureRuntimeAppsLayout` seeds it on the same once-per-runtime-root terms — no marker, no apps, then copy and rewrite the manifest id. Nothing about the runtime treats it differently from an app the person wrote.

**The catalog names the two servers Quick add creates.** `filesystem` is gone, and with it the absolute workspace root; `jira` and `gitlab` replace it (`@mohou/jira-mcp`, `@mohou/gitlab-mcp`), each with the read-only tools worth starting from and the argument names the servers actually take. The example values are placeholders — `PROJ-1`, `group/project` — because a sample is read by strangers.

**It passes the gates.** The host compiles an app with esbuild and never typechecks it, so the app had never met `pnpm run check`. A template source lives inside the typechecked and linted tree, so the port fixed what that surfaced: about fifty style fixes, and the type errors behind them — a `step()` builder because `exactOptionalPropertyTypes` refuses an optional field set to `undefined`, guards where an array index was read, `SqlValue` at the storage boundary, and the `stream: true` overload of `ctx.llm` and `ctx.agent` at the two streaming call sites.

## Alternatives considered

- **Ship it outside the gates** (exclude template sources from lint or typecheck). It would put app code in the repository that no gate covers, which is the one thing a sample is supposed to demonstrate.
- **Ship a trimmed workbench** (LLM and Agent tabs, no MCP picker or run log). Less to port, and it drops the part that shows `ctx.mcp` doing something real.
- **Keep the `filesystem` server.** It needs a workspace root, which a fresh user has not chosen; the previous value was one person's path. The filesystem server remains a fine thing to add through the MCP section.
- **Seed every template.** The others are recipes to copy from, and a library of ten samples is a worse first screen than three that work.
- **Re-seed on upgrade, so existing libraries gain it.** The marker exists to keep a deletion deleted. An owner who wants the app can copy the template.

## Consequences

A new runtime root opens with three apps, one of which is a working model workbench whose MCP tab and the MCP section name the same servers.

The workbench is now maintained in this repository: an edit to Pi's streaming API or to either MCP server has a second place to update, which is the price of shipping a sample that exercises them. Verified after the port by seeding a fresh runtime root: the three apps appear, `open` compiles the workbench, and `listRuns` answers `{ ok: true, value: [] }`.
