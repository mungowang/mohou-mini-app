# Agent Note: An app lists host MCP servers through ctx

Status: implemented

## Problem

`ctx.mcp(serverId, toolName, args?)` could call a host-held MCP server but could not see the set. An app that wanted to offer a server or tool picker had to know ids out of band — the authoring side had `mini_app_mcp_list`, the runtime had nothing. `ctx-mcp.md` carried this as a locked non-goal: "listing external tools into the app".

## Decision

`ctx.mcpServers(includeAll?)` lists the host's servers. Each entry is `{ id, status, tools?, error? }` — names only, no descriptions, no schemas, no env, so the secret rule the call already follows is unchanged. Default returns the alive only: listing opens each session, the same first call `ctx.mcp` makes, so every listed server is one the app can call. `includeAll` also returns the failed — a server boot left out, or one whose start failed — with `status: 'failed'` and an error of a code and a human message.

## Alternatives considered

- Ids only, no tool names. Lost: without names the list cannot back a picker, and the app is no better off than hardcoding.
- Descriptions and schemas per tool. Lost: the authoring side already keeps names only; widening the runtime surface widens the leak for no call the app can make with it.
- Failed servers in the default list. Lost: a runtime app has no use for a server it cannot call; `includeAll` is the explicit ask.

## Consequences

Listing starts every configured stdio server, the same cost the authoring list already pays; the session per id is kept, so repeat lists reuse it. `ctx-mcp.md` drops the non-goal and gains the list fact; the skill ctx table carries the new member.
