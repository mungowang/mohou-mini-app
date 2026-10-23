---
status: shape-locked
progress: settled
updated: 2026-10-23
---

# Write loop

Layer: [Author skill](README.md). Index: [features.md](../features.md).

- Owner: Author skill.
- Input: a user ask for a local tool, dashboard, board, report, or similar. The agent reads this skill, not a live app directory, as the contract.
- Before register, the skill classifies the ask as one loop, several regions in one app, or a workbench homepage, and says which. One message asks only the core choices the agent cannot see: what the first screen is for, where the records come from, one app versus a workbench, and how a named external system is reached. Each option carries a consequence and one recommendation. A skip, or "you decide", is a stated assumption, not a second round. `mini_app_register` does not run in that same turn while a core choice is still open. A one-loop ask whose source and shape are already clear is two sentences of intent, then register. Several independent products are named, and only the first is built. Familiarity with an app shape does not skip the confirm. The option table and the red flags live in the skill's `references/guide/choices.md`.
- A workbench is `kind: "workbench"`. It is a homepage the author designs: what this person wants to see first, and how other apps are arranged and entered. The layout is free. The sample rail is one sketch, not the type. `ctx.workbench` exists only on this kind. `listApps` and `openApp` supply the apps and the open. `openApp` asks the panel to add a tab and does not navigate inside the homepage. The app keeps every ordinary capability. Sample rows are replaced from `ctx.http`, `ctx.mcp`, or this app's own storage. `setDefaultWorkbench` makes this homepage the panel's first screen instead of the builtin library.
- One app may lift one facade per region. The skill does not paste a whole facade file. Filterable entities do not share one `kv` array. Settings, one snapshot, and a short list use `kv()`. Rows that are filtered get `schema/NNN_*.sql` plus `query` / `run`. A schema file may also seed or rewrite those rows, and may read or rewrite `kv` rows. Do not run a one-shot TypeScript migration through `ctx.storage.run`. An applied schema file is not edited. Status unions and `ctx.push` event names live in `shared/`.
- The UI kit is a shortcut for SaaS-shaped screens. It is not required for a valid app or for a beautiful one. Native elements and Tailwind, kit parts, or both are allowed. Using no kit component is valid.
- Steps the skill locks:

1. Confirm, as above.
2. Lift one facade per region. A workbench is the homepage described above.
3. Create with `mini_app_register` (manifest fields). Write the paths in `needed` with the agent's file tools. Later edits use the same tools. The skill does not document `mini_app_write`, `mini_app_edit`, or `mini_app_delete`.
4. `mini_app_reload` until `ok`. A successful reload of a dirty tree commits. A failed reload does not. Fix the layer named by the error prefix. Read `notices`.
5. `mini_app_call` against the methods. Batch with `calls` when several methods need a smoke test.
6. `mini_app_open`. If `panel` is `no-panel-connected`, tell the user to open the panel. The app is fine.
7. `mini_app_errors`, then `mini_app_view_eval`. Compile green is not a running view.

- A whole-app delete is a panel action. The skill says so and does not delete the directory.
- External systems are chosen in the confirm, after `mini_app_mcp_list`. A connected server is the recommendation: `ctx.mcp` with that server's own arguments. Otherwise `ctx.http`, a logged-in `ctx.bash` or `ctx.pwsh`, or `mini_app_install`. Secrets use `ctx.credentials.get` and are not written into the UI or into source. Never install the denylist. Never install a UI library. `sheets` is the facade that teaches install, and it ships without `package.json`.
- Long jobs check `ctx.signal`, persist a snapshot, and `ctx.push` progress. The UI loads one snapshot on mount and then applies events. It does not poll. A gap refetches the snapshot.
- Live numbers stop their timer when the document is hidden.
- Colour is tokens. The confirm asks for a look once. A named look is used as named. A skip, or "you decide", uses the facade's default pairing, and the skill says which. A custom host theme file is written only when the user asks for a named palette, at `~/.mini-app/themes/theme-<id>.css`, with both modes and the token names. An app `theme.css` is written only when the look depends on a hue.
- When authoring tools fail or are unavailable, the skill may point at `bin/diagnose` in the skill tree. That script reports Host about, authoring MCP, tool names, skill version, and runtime root as JSON. It is help for analysis, not a required gate, and not a ban on other investigation.
- Failure: the skill tells the agent which tool result or diagnose field to read next.
- Non-goals: editing Host, Panel, or Shell source; a hand-maintained component catalog; a security essay on the skill hot path; a ready authoring tool; assistant mcp.json scanning in diagnose.

## Implementation


Role: consumer of the authoring tools. The skill is [skills/mohou-mini-app/SKILL.md](../../../skills/mohou-mini-app/SKILL.md). It documents the write loop, the MCP tool names, the facades, the generated component catalog, and diagnose. It does not delete the app directory and does not register a second tool schema. Pre-1.0 confirm gate: [.agents/notes/implemented/feature/2026-09-27-author-skill-confirm.md](../../../.agents/notes/implemented/feature/2026-09-27-author-skill-confirm.md). L0 shape: [.agents/notes/implemented/feature/2026-09-27-skill-l0-is-the-gate.md](../../../.agents/notes/implemented/feature/2026-09-27-skill-l0-is-the-gate.md). Plan: [implementation.md](../implementation.md).
