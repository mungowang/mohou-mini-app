# Agent Note: One writer for the product version

Status: implemented

## Problem

The product version is stated in more than a dozen tracked files. Every release, from 1.0.1 through 1.0.46, edited them by hand, and nothing checked the set: `publishFailures` compares the ten publishable packages with each other, and `check:skill` compares the skill with the shell, but neither reads the Tauri crate, its lockfile entry, or the window config. The 1.0.45 bump left `Cargo.lock` at 1.0.44 while `Cargo.toml` said 1.0.45, and no gate noticed.

## Decision

`pnpm bump:product <x.y.z>` runs `scripts/bump/product.mjs`. It writes one version into every carrier: the package.json of each package `workspacePackages()` returns, so the bump and the publish gate agree on which packages are publishable; `version` under `[package]` in `Cargo.toml`; the lockfile entry whose `name` is the crate `Cargo.toml` declares; `version` in `tauri.conf.json`; and the skill frontmatter. It then runs the skill sync, which refreshes `packages/shell/skill/mohou-mini-app`.

It refuses, before writing anything, when the argument is not `x.y.z`, when it is not newer than the shell version, when a carrier file is missing, or when [the changelog](../../../../docs/changelog.md) has no `## <x.y.z>` section. The release note is prose and stays with the author. It does not commit; it prints the carriers it wrote and `git diff --stat`.

`scripts/bump/product.spec.mjs` reads the real checkout and fails while any carrier disagrees with the shell version, so a hand-edit that reaches only some files fails `pnpm run check`. [Development](../../../../docs/development.md) owns the command.

## Alternatives considered

- A hard-coded list of carriers. It drifts as packages are added or renamed; `workspacePackages()` and the crate name in `Cargo.toml` answer the same questions from the files themselves.
- Writing the changelog section too. The script can insert a `## <version>` heading but not the sentences the release note is for, and an empty section can be committed by accident. The gate only checks that the section exists.
- Auto-incrementing from the shell version (`pnpm bump:product patch`). The argument is a release decision, and the explicit number keeps the diff reviewable; nothing is gained by hiding it.
- Committing from the script, or behind `--commit`. The checkout is deliberately dirty while the bump runs, because the release note is written first, so the script cannot promise a single-purpose commit.
- Requiring every carrier to already state the shell version. That drift is what the script repairs: a lagging lockfile entry is rewritten with the rest, and the post-write check proves the result.

## Consequences

The carrier set holds while a version lives in a publishable package.json, the Tauri `[package]` table, its lockfile entry, the window config, or the skill frontmatter. A version written anywhere else stays out of scope and can drift. The bump is not a release: publishing still runs `pnpm run check`, `pnpm publish:check`, and the npm version. Untracked build output such as `artifacts/Mohou-<version>-<platform>/` is out of scope; the next build writes it.
