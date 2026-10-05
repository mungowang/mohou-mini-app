# Agent Note: The update registry can be a mirror

Status: implemented

## Problem

An install updates from `https://registry.npmjs.org` because the prefix was built that way. In a network where that registry is slow or intermittently unreachable, the owner had no way out: the check fetches `<registry>/@mohou/shell/latest`, the launcher installs with `--registry <registry>`, and both read the same build-time value. The only lever was editing `package.json` inside the app bundle by hand.

Changing the owner's global npm configuration was not an acceptable answer. It would steer every project on the machine, and the product is a guest in that setup, not its owner.

## Decision

One policy field, applied to our own npm children only.

- `host.json` gains optional `updateRegistry`. Empty means the packaged default. Precedence is `MINI_APP_NPM_REGISTRY` (environment), then `updateRegistry`, then the prefix's registry.
- The policy becomes the environment for our own update work: `updateEnv(policy)` returns `process.env` with `MINI_APP_NPM_REGISTRY` set, and `checkPackageUpdate`, `stagePackageUpdate`, and `readUpdateSource` all take it. One precedence rule, read at one place.
- We never run `npm config set`, never write `~/.npmrc`, and never export a global variable. The value reaches exactly one place: the `--registry` argument the launcher already builds for its install command. An app's own dependency install (`mini_app_install`) is untouched and keeps following the owner's npm configuration, which is what a private registry in an app needs.
- The panel's Network section offers the packaged default, Alibaba npmmirror, Tencent Cloud, and a custom url. `admitUpdateRegistry` accepts only an https url with no username or password; a bad value is refused in the form and never written. The host admits it again at the boundary: a non-string never clobbers the stored value, and an empty string means the default.
- A saved value applies at once. The check reads the policy per request, and the install command is built when an install starts, so no restart is involved.

Two fixes ride along, both from the same mirror scenario:

- The registry channel compared `latest !== current` and so offered an *older* version as an update. A mirror syncs late, which makes that the common case, not a corner. It now compares versions and offers only something newer, the rule the tarball channel already used.
- The check budget was three seconds. A mirror's first response (a cold cache in front of an unsynced package) often exceeds that, and the panel then reported a failure for a registry that works. It is eight seconds, host policy and not a locked number.

## Alternatives considered

- Write the owner's npm configuration. One line of code, and it changes every other project on the machine. Rejected: the product must not reconfigure its host's toolchain.
- A native `<input list>` + `<datalist>` combobox. It is the obvious control and it does not work: WebKit does not implement `datalist`, so macOS would show a plain input while Windows showed a dropdown. Same code, two behaviours.
- A hand-rolled combobox with filtering. More code than the field deserves, with keyboard and accessibility work the panel has no pattern for yet.
- Scope the registry to `mini_app_install` as well. Convenient for a slow registry, and wrong for an app that installs from a private one: our flag would override that app's own registry choice. The product's own update is the thing whose registry we own.
- A settings field with no badge. Then a mirror is invisible: the owner cannot tell which registry an offered update would install from, and the failure mode of a mirror (a version that lags) has no explanation on screen. The chip from the previous change names the registry in force.

## Consequences

An owner behind a slow registry picks a preset and the next check and install use it, with the chip confirming which host is in force. Nothing outside this product's own update path changes.

`updateRegistry` lives in `host.json`, which is a policy file the panel writes with the authoring token. A mirror is therefore a trust decision the owner makes once. The form owns the https shape, because that is a usability rule; the host owns the field itself — a string when present, and an empty string clears it rather than storing one.

The first release of this change was broken in a way worth naming. A panel save writes *every* editable field, so adding one to the form without adding it to the host's allowlist (`PUBLIC_KEYS` / `OPTIONAL_KEYS`) failed **every** settings save, not just the new field. The route test that covered the write used stubbed ports and so never reached the allowlist, and the panel tests used a fake client. The allowlist now has a test through the real `writeHostPolicy`, and the HTTP boundary has one that saves a registry and reads it back.

The staged-publishing behaviour of npm's bypass-2FA tokens is unrelated to this and unimplemented here: a publish with such a token lands in staging and needs 2FA to approve. That is a publishing concern, not an update-source one.
