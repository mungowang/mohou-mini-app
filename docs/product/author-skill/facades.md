---
status: shape-locked
progress: settled
updated: 2026-10-02
---

# Facades and looks

Layer: [Author skill](README.md). Index: [features.md](../features.md).

- Owner: Author skill for the recipes. The UI kit supplies the components the facades use.
- Facades, one loop each:

| Facade | Loop | What it teaches |
| --- | --- | --- |
| `minimal` | one `call` | skeleton, no motion |
| `today` | open, see my screen, open one record | `ListDetail`, storage |
| `board` | items move in two-dimensional status | `Kanban` and a sheet |
| `radar` | trigger, wait, read, cancel | `ctx.http`, `ctx.llm`, `ctx.push`, `ctx.signal` |
| `sheets` | file in, grid work | `mini_app_install`, lodash, `DataGrid` |
| `runner` | the UI is the run | `ctx.agent` and `streamCall` |
| `chores` | named buttons, this machine, no model | `ctx.bash` |
| `watch` | numbers move by themselves | `ctx.system.metrics`, hidden-document stop, `DashboardShell`, `Reveal` |
| `workbench` | a custom homepage: what to see first, and how other apps are entered | `kind: "workbench"`, `ctx.workbench`. Any layout. The sample is one homepage |

- `chores` stays buttons. A prompt box would make it `runner`.
- One app may lift one facade per region. A workbench is a homepage the author designs. It shows what this person wants first, and it arranges other apps and their entry points in any layout. The sample rail is one sketch. `ctx.workbench` supplies the apps, the open, the default, and the trash: `listTrash()` returns what the owner deleted in the same shape as `listApps()`, and `restoreApp(id)` puts one back, rejecting a live id or one that is not in the trash. The panel's library uses the same two operations, so a workbench can offer what the library offers. It does not require that sketch.
- The UI kit is a shortcut for SaaS-shaped screens. A facade may use it, mix it with native elements and Tailwind, or use none of it. Using no kit component is valid.
- Looks are optional recipes. The confirm asks once. A named style is used as named. A skip, or "you decide", uses the default pairing and the skill says which. The names are `glass-island`, `aurora-bento`, `desk-split`, `editorial`, `tape`, `void`, `signage`, `terminal`. Each has a light and a dark pair. The skill does not copy look files into every generation. Conventional kit chrome is not a Look. `minimal` and `workbench` have no Look.
- Default pairings: `today`/`glass-island`, `board`/`aurora-bento`, `sheets`/`desk-split`, `radar`/`editorial`, `watch`/`tape`, `runner`/`terminal`, `chores`/`terminal`. `void` and `signage` are opt-in. `minimal` and `workbench` have no Look.
- Failure: two facades that teach the same loop are a skill defect. A Look is not required for an app to be valid.
- Non-goals: a runtime `data-look` attribute; a Look component; a cartesian product of palettes and layouts; a ninth facade without a new loop.

## Implementation


Role: recipes, not a runtime attribute. A facade is one interaction loop. A Look is opt-in. The skill does not copy look files into every generation. Plan: [implementation.md](../implementation.md).
