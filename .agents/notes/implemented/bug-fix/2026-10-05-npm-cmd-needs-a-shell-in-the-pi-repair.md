# Agent Note: npm.cmd needs a shell, in the Pi repair too

Status: implemented

## Problem

A Windows user pressed probe on Pi and read exactly this: `pi is not available: spawn EINVAL`.

`spawn EINVAL` is Node refusing to start a `.cmd` without a shell — the same rule that broke the release build on Windows earlier in the day, where the fix was a shared spawn helper for the build scripts. Here it was inside our own runtime: Pi's repair step asks npm where its global packages are, and it built the command as `<node dir>/npm.cmd`, which is the only npm Windows has.

The error was also misleading about where the fault was. The repair's `link()` asks the filesystem roots first, then asks npm, and an exception from that second step propagates into `attempt()`, whose `error.message` becomes the recorded failure. So "we could not run npm" was reported as the reason Pi is unavailable, and the reason that mattered — a peer package that is not in any root we know — never reached the message.

## Decision

`npmRootPlan(node, platform)` names the invocation: `npm.cmd` with `shell: true` on Windows, plain `npm` without one elsewhere. It is a pure function with no filesystem access, so the Windows form is testable on a machine that is not Windows; the caller checks whether the file exists.

The npm step also stops being able to fail the load: the call is wrapped, and both a synchronous throw and an asynchronous error resolve as "npm could not say", which leaves `undefined` — the same answer as "npm is not installed here". The recorded failure is then whatever actually stopped the peers from loading.

This matches what the app install path already did: `packages/host/src/install/install.ts` has passed `shell: process.platform === 'win32'` since it was written. One call site was missed, not the rule.

## Alternatives considered

- **`spawn('cmd.exe', ['/d', '/s', '/c', npm, 'root', '-g'])`.** Equivalent, and it duplicates the argument-quoting the platform already provides through `shell`.
- **Skip the npm step on Windows.** The filesystem roots cover the default npm layout, so this would often work — and it would silently give up on a user whose npm prefix is configured elsewhere, which is exactly the user who needs the fallback.
- **Let the error stand.** The probe would keep showing a message about npm while the actual fault was elsewhere. This note exists because that message was the *symptom* a person could act on; it should not become a red herring.

## Consequences

Pi's repair asks npm on Windows, and when it cannot, the message says what is wrong with Pi instead of what went wrong inside the repair.

The next probe on that machine will answer with either a peer that could not be found — which names the search-path question — or a healthy Pi. Either is an answer; `spawn EINVAL` was not.
