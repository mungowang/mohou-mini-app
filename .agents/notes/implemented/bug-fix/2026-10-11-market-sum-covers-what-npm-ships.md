# Agent Note: The market sum covers only the names npm ships

Status: implemented

## Problem

`@mohou-apps/com.mohou.kedu@0.2.10` refused to install from the registry: `app package sum does not match`. The packer summed the staged tree and wrote that value into `mohou.sum`. `npm publish` then repacked the folder and dropped `app/.gitignore`, because npm never publishes that name. Install recomputes the sum over the tree it received, so no host could reproduce the declared value. The name was in the author tree alone.

## Decision

The packer excludes the names npm never publishes — `.gitignore`, `.npmignore`, `.npmrc`, `.DS_Store` — beside the product state and build names it already excluded. The packed tree is then the summed tree and the shipped tree, on the registry channel and the local dist channel alike. The pack also runs `npm pack --dry-run --json` and fails when npm would drop a staged file, so a name the exclusion list misses stops the pack instead of publishing a package that cannot verify. [publish.md](../../../../docs/product/market/publish.md) carries the exclusion list.

## Alternatives considered

- Ship the file by listing it in the package `files` field, which overrides npm's rule. Lost: the exclusion list stays a hand-kept copy of npm's rules, and every publisher must know the trick.
- Compare the sum against npm's own output instead of the staged tree. Lost: the author tree and the shipped tree stop being the same tree.
- Repair `0.2.10` in place. Lost: npm refuses a second publish of a version, and the declared sum was computed with a file the registry never held. The fix publishes `0.2.11`, and the catalog row moves with it.

## Consequences

An app directory that carries a `.gitignore` installs without that file. The host does not read it: history and install each keep their own skip table. Packing now needs npm beside `tar`, one invocation per app.
