# Agent Note: Pi from its own installer, not only from npm

Status: implemented

## Problem

Pi's documented install on Windows is a PowerShell script, and it does not use npm's global directory: it writes `~/.pi/agent/bin/pi.ps1` and keeps its packages in a tree under `~/.pi/agent`. Mohou's Pi repair only looked where npm puts global packages — `%APPDATA%\npm\node_modules`, the Node directory's `node_modules`, and `npm root -g` — so a Pi installed exactly as its own documentation says was reported as `Cannot find package '@earendil-works/pi-coding-agent'`, and the provider stayed unhealthy on a machine where Pi works in a terminal.

The report arrived because the previous two changes made the failure legible: the probe names the reason, and the reason named the missing package instead of `spawn EINVAL`.

## Decision

**Walk Pi's own tree for the peers.** `installerPeerRoots(agentDir)` descends a bounded four levels and returns every `node_modules` that holds at least one of the two peers. `piAgentDir(home, env)` resolves that directory the way Pi does: `PI_CODING_AGENT_DIR` when set, else `~/.pi/agent`.

Walking rather than naming paths is deliberate. The installer's layout is its own business — packages directly under the agent directory, under `lib/`, or under a versioned directory all work — and a list of guesses would be wrong the next time it changes. The walk only runs when the fixed roots have already failed, and one root holding one peer is still useful: the callers link whichever peers each root has.

npm's global directory stays in the list, as the fallback for a Pi installed with `npm i -g`, and that path is now Windows-correct.

## Alternatives considered

- **Name the installer paths (`<agent>/node_modules`, `<agent>/lib/node_modules`).** It works for today's layout and needs an edit the day the installer moves something. The walk costs a `readdirSync` over a directory tree that holds sessions and a shim.
- **Install the peers from npm into the prefix ourselves.** It removes the dependency on where the user's Pi lives, and it puts a second Pi on the machine: our copy would drift from the version the user runs, and the design links the vendor the user already has.
- **A settings field for the Pi install path.** The right answer for a truly unusual install, and a question the product should not ask before trying to find it. If the walk finds nothing on a real machine, this is the next step, not this one.
- **Detect the `pi` executable on PATH and read where its shim points.** The shim is a script in one installer's shape and a symlink in another's; both are more fragile than looking for the packages.

## Consequences

A Pi installed by its own script is found and linked like one installed by npm. `PI_CODING_AGENT_DIR` is honoured, so a Pi whose agent directory was moved is also found.

The walk is bounded and best-effort: a directory it cannot read is skipped, and a machine with neither layout ends with the same message as before, now naming the package it could not find.
