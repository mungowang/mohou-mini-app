---
status: locked
updated: 2026-10-09
---

# AGENTS.md

Before editing, read the page that owns the fact.

- [docs/architecture/functions.md](docs/architecture/functions.md) — the product cut by caller, not by a previous package tree.
- [docs/architecture/packages.md](docs/architecture/packages.md) — the package cut. A package that is not listed under Now does not have a directory yet.
- [docs/product/features.md](docs/product/features.md) — what the product does.
- [docs/product/implementation.md](docs/product/implementation.md) — how a feature is built. Libraries and numeric policy are not locked there.
- [docs/architecture/decisions.md](docs/architecture/decisions.md) — locked product decisions.
- [.agents/skills/architecture-guard/SKILL.md](.agents/skills/architecture-guard/SKILL.md) — architecture patterns. Each line links to an example.
- [docs/development.md](docs/development.md) — commands.
- [docs/testing.md](docs/testing.md) — which test tier proves what.
- [packages/README.md](packages/README.md) — package grouping.
- [docs/AGENTS.md](docs/AGENTS.md) — where documentation facts live.

Quote style and semicolons belong to the linter.

## Repository layout

```
packages/               packages/<group>/<pkg>
  util/values/          @mohou/values
  app/contract/         @mohou/contract
  runtime/provider/     @mohou/runtime-provider
  host/                 @mohou/host
  mcp/client/           @mohou/mcp-client
apps/                   process entries, added with the process
docs/                   documentation (docs/AGENTS.md)
.agents/                agent workflows and notes
scripts/                local hook install
```

Package rules: [packages/AGENTS.md](packages/AGENTS.md).

## Commands

```sh
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check
```

[docs/development.md](docs/development.md) states what each command checks. [.agents/skills/pre-push-checks/SKILL.md](.agents/skills/pre-push-checks/SKILL.md) selects the checks that cover an outgoing change.

## Release

Do not hand-edit version fields. [docs/development.md](docs/development.md) owns the commands. Do not bump, publish, or tag unless asked.

- Bump: write `## x.y.z` in `docs/changelog.md` first, then `pnpm bump:product x.y.z`. That script writes every carrier.
- Local packs: `pnpm publish:check`. It does not upload.
- npm: `MINI_APP_PUBLISH=1 pnpm publish:packages`. A dirty tree is refused. The shell version must be on the registry before a release tag.
- GitHub Release: push tag `vX.Y.Z`, matching `@mohou/shell` with no `v`. `workflow_dispatch` builds the bundles and does not publish the Release.

## Conventions

- ESM (`"type": "module"`). Import other packages by package name. Local relative imports use a `.ts` specifier.
- Closed unions end in `assertNever` from `@mohou/values`.
- Exported type names spell their words. [packages/AGENTS.md](packages/AGENTS.md) owns the abbreviation rule.
- Explicit resolution at a package boundary is a named `resolve` step in the owning module, not a hidden default inside the operation that consumes the result.
- Every implementation targets macOS and Windows. [implementation.md](docs/product/implementation.md) owns the rule. [decisions.md](docs/architecture/decisions.md) owns the platform set.
- A non-trivial change adds or updates an Agent Note in the same change. [.agents/notes/README.md](.agents/notes/README.md) owns when and how.
- A functional change is not done until `pnpm run check` has run on it. That command includes typecheck and the coverage gate. A narrower test run does not replace it. Do not wait to be asked. [docs/development.md](docs/development.md) owns the command.
- Files end with exactly one trailing newline.

## Documentation

Every project document starts with these attributes, before the title:

```yaml
---
status: <status>
updated: YYYY-MM-DD
---
```

`updated` is the date of the last content change. A reread does not bump it.

Feature pages under `docs/product/` use only these statuses:

- `index` — the page only points at other pages.
- `draft` — the page is the home of the fact, and the sentences are not decided.
- `shape-locked` — names, arguments, return fields, and failure classes are decided. Timeouts, caps, and other tunables are not.
- `locked` — every sentence on the page is decided, including tunables.
- `deferred` — the page names a capability that is not in this product now.

A feature page also carries `progress`. Other project documents do not.

- `open` — at least one sentence is not implemented, and is not explicitly left as host policy.
- `settled` — every sentence is implemented, or explicitly left as host policy.

`progress` is not a release node. A missing `progress` has not been judged. It is not `settled`. There is no `wip` status.

Which node a capability belongs to is [docs/blueprint.md](docs/blueprint.md). Do not propose a backlog row from that page unless the user names it.

Other project documents use `index`, `locked`, or `open`. `open` means the page owns the fact and at least one value is not decided. They do not use `draft`, `shape-locked`, or `deferred`.

Project documents are `docs/**/*.md`, this file, `packages/README.md`, `packages/AGENTS.md`, and each package `README.md`. A content change sets `updated` to that date and sets `status` to match the page. Copying a paragraph into a second page is not a content change of the copy. Where a fact lives: [docs/AGENTS.md](docs/AGENTS.md).

## Reviews and prose

[.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) owns review. [.agents/skills/prose-standard/SKILL.md](.agents/skills/prose-standard/SKILL.md) owns prose. [.agents/skills/find-simplifications/SKILL.md](.agents/skills/find-simplifications/SKILL.md) owns simplification surveys.

`CLAUDE.md` is a symlink to this file.
