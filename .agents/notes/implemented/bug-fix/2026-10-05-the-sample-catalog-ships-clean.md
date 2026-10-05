# Agent Note: The sample catalog ships clean

Status: implemented

## Problem

The workbench template shipped with the catalog of the machine it was written on: a filesystem server rooted at one absolute directory, a Jira entry pointing at a local checkout beside the published one, and example values naming a colleague, an internal project, and two ticket keys. The template had been scrubbed before the port; that scrub was then lost. It was written into the working tree, the tree was reverted to undo an unrelated experiment, and the copy it was restored from predated the scrub. Every check passed, because the file is valid TypeScript with clean types and no lint complaint — the content was the problem, and no gate looks at content.

It was caught by reading the file: the user asked why their installed app still listed the old servers, and the answer was that the template itself still held them. By then 1.0.32 through 1.0.34 had published it, and the release bundles carry the skill inside the prefix, so those downloads hold it too.

## Decision

**The catalog names what the product presets**, and nothing about a machine: `jira` (`@mohou/jira-mcp`), `gitlab` (`@mohou/gitlab-mcp`), and `jenkins` (`@kud/mcp-jenkins`, read-only tools only), with placeholder arguments (`PROJ-1`, `group/project`, `demo`) and neutral preset labels.

**Verify the artifact, not the tree.** The immediate lesson is bigger than the fix: the shipped file is the one inside the published tarball, and that is what to read when the question is "what did we publish". A working tree that has been reverted, restored, or copied has no memory of what it held ten minutes ago.

**Fix forward, and say what happened.** A published version cannot be quietly corrected: npm tarballs are immutable, and the bundles for those tags are downloadable. The changelog entry describes the catalog change without repeating what it contained, and the note records it here, where the reason matters more than the names.

## Alternatives considered

- **Rewrite the history and re-release the three versions.** The tags, the bundles, and the npm tarballs are already public; a rewrite fixes the repository's copy and leaves the rest. Offered, not assumed.
- **Unpublish 1.0.32 through 1.0.34.** Within npm's window, with the account's 2FA, it would remove the tarballs. It also breaks `latest` for anyone mid-update, and the versions are otherwise good.
- **Leave the catalog as it was and document it.** The template is read by strangers; a filesystem root with someone's name in it is not documentation.
- **Add a content check to the gate.** A list of forbidden words would have caught these and misses the next shape. A checklist line for template changes is honest about being a human step.

## Consequences

The template and both generated copies hold three product servers. Any library that installs samples gets that version; a library that already had the workbench keeps its own app, which is why the user's own copy was updated directly and reloaded.

The next time a sample is ported, the check is the published tarball: `npm pack @mohou/shell@<version>` and read the file inside it.
