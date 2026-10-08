---
status: locked
updated: 2026-10-08
---

# Development

This repository has one TypeScript compiler face for packages: `tsconfig.json` typechecks every package from `src`, except author templates. There is no host/client split. `packages/app/templates/tsconfig.json` typechecks the templates and allows an unannotated parameter. `defineApp` still infers `ctx` and a named `args` object.

Author templates are edited in `packages/app/templates/src`. `pnpm gen:skill` copies that directory to `skills/mohou-mini-app/templates`. An edit under the skill directory is replaced by the next copy. `check:skill` fails while the two trees differ. Skill `version` **equals** `@mohou/shell` version: run `pnpm sync:skill` (also at the end of `gen:skill` and before pack). That script copies `skills/mohou-mini-app` into `packages/shell/skill/mohou-mini-app` for the shell npm package. Do not hand-edit the shell copy.

## Commands

```sh
pnpm install          # workspace install; postinstall installs git hooks when it can
pnpm run lint         # oxlint, type-aware, using .oxlintrc.json
pnpm run types         # emit lib/types so an editor package project can resolve workspace deps
pnpm run typecheck    # tsc -p tsconfig.json, then the templates project
pnpm run test         # vitest run
pnpm run test:coverage # coverage gate; the tiers are in testing.md
pnpm run check        # lint, then typecheck, then test:coverage
pnpm build:panel      # write packages/shell/dist/panel.html and panel.js
pnpm build:window     # build packages/launcher/tauri → mini-app-window
pnpm build:artifact   # release window named Mohou, panel bundle, and artifacts/Mohou-<version>-<platform>/
pnpm publish:check    # pack the workspace packages locally; it does not upload
pnpm publish:packages # upload. Requires MINI_APP_PUBLISH=1 and a clean tree. Runs check first. Then queues each package on npmmirror. MINI_APP_MIRROR_SYNC=0, MINI_APP_MIRROR_SYNC=false, or --no-mirror-sync skips that queue. The flag wins over the variable.
pnpm dev:host         # serve the built panel and open the window. It does not compile the panel. The process exits when the window closes
pnpm gen:skill         # regenerate the catalog, copy templates, sync skill into shell (K≡S)
pnpm sync:skill       # set skill version from shell; copy skills/ → packages/shell/skill/
pnpm check:skill      # MCP tools, ctx members, generated contracts, skill version === shell
pnpm bump:product 1.0.47 # the product version in every carrier; the changelog section must exist first
pnpm dist:local       # pack tarballs + install artifacts/local-app from file: tarballs; write run
pnpm dist:app:local   # unsigned bundle under artifacts/app/. Prefix from artifacts/npm tarballs. Copies them to ~/.mini-app/packages and stamps that directory as the tarball channel
pnpm dist:app:release # same bundle shape. Prefix from the npm registry. Channel registry. That shell version must already be published
pnpm migrate:legacy   # dry run: rewrite app source off the retired npm scopes under the runtime root. --write applies it behind a backup
pnpm pack:source      # source tarball under artifacts/source-pack/ (no node_modules / build caches)
```

Node.js `^22.19.0 || >=24.0.0`. The root `package.json` pins `pnpm@11.7.0`.
`tsconfig.base.json` sets `erasableSyntaxOnly` so typecheck refuses constructor parameter properties, enums, and namespaces. `pnpm dev:host` runs with `--experimental-strip-types`, which cannot transform those forms.

GitHub Actions runs `pnpm build:panel`, `pnpm build:window`, then `pnpm run check` on macOS for every push and pull request. The workflow file is `.github/workflows/check.yml`.

`.github/workflows/release.yml` runs `pnpm dist:app:release` on `macos-14` (arm64) and `windows-latest` (x64). It runs on `workflow_dispatch` and on a `v*` tag. A tag must match the `@mohou/shell` version without the `v`, and that version must already be on the npm registry. The tag run also publishes those zip and dmg files on the GitHub Release. The bundles are unsigned. Local install tests use `pnpm dist:app:local`.

`pnpm install` runs `scripts/install-lefthook.mjs`. That script exits 0 when git hooks cannot be installed. Run it again with `node scripts/install-lefthook.mjs` after git metadata is present.

`lefthook.yml` checks staged TypeScript with `.oxlintrc.staged.json` and checks staged whitespace before commit. It runs `pnpm run typecheck` before push.

A functional change runs `pnpm run check` before it is claimed done. The command is lint, typecheck, the coverage gate, and `check:skill`. A change that adds or edits a test, or edits source the gate measures, is covered by that same run. A single test file does not replace it.

Comment tags, by urgency: `FIXME` blocks a release, `TODO` is fixed soon, `XXX` has no commitment.
