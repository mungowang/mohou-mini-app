# Agent Note: The MCP page offers our own servers

Status: implemented

## Problem

Adding Jira or GitLab meant knowing the package name, the `npx -y` invocation, and the environment variable names each server reads — then typing them into a form, and separately creating the credential entries their `${credential:NAME}` references point at. The knowledge existed in two READMEs outside this product, and the credential step was only discoverable by saving a server and reading the warning that a reference names nothing.

The product publishes both servers (`@mohou/jira-mcp`, `@mohou/gitlab-mcp`), so it can carry that knowledge.

## Decision

**A preset table in the panel**, one row per server: id, label, description, package name, the environment it reads as `${credential:NAME}` references, and the credentials those references name. `presetDraft` turns a row into the form the section already has.

**Quick add opens the form; it does not write the server.** This follows the import path's rule: the person sees the fields, checks the server, then saves. A saved preset that does not connect — a typo in a base URL, a missing token — would be a server that fails at every boot, and the form is where those are corrected.

**The credentials are created, empty.** `putCredential(name, description)` with no secret makes the entry exist, which turns "this reference names an unknown credential" into "this credential is empty" and puts the next step in the section that owns it. A credential that cannot be written does not refuse the form; the reference warning still says what is missing.

**The table is panel data.** The command and the variable names are facts about packages this product publishes, and only the panel consumes them, so they live beside the view rather than on the host policy wire.

## Alternatives considered

- **Write the server directly, then tell the person to fill the credentials.** One click instead of two, and it leaves a server in `mcp.json` that cannot connect yet, with a boot warning on every start until it does.
- **Ship the presets on the host, in the policy payload.** They would be reachable from a second surface later, at the cost of a wire field and a host-side table for what is a panel affordance today.
- **A generic "add from npm" field.** It is the form, with the knowledge left to the person — the thing this change removes.
- **Also create the credentials from the server form on save.** Two places that create credentials, and the preset's references would still name nothing until a save happened.

## Consequences

Two servers are two clicks and a filled-in credential set. Adding a third is a row in `mcpPresets` and its label keys.

The preset's credential names are new entries, not the names an existing configuration may already use; the form is editable, so a person with their own names changes the references rather than duplicating credentials.
