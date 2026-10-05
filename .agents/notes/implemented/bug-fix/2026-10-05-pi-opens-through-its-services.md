# Agent Note: Pi opens through its services, not a bare runtime

Status: implemented

## Problem

Settings showed Pi's built-in providers and nothing else. The user's Pi has an extension that registers a provider — a Kiro proxy — and it never appeared, which is also why selecting it was never possible: the agent path resolves a model against the same runtime the list came from.

The list was built as `ModelRuntime.create({ refreshOnCreate: false })` and then `getModels()`. That is Pi's model runtime *without* the step that loads the user's extensions, and loading them is what runs `pi.registerProvider` and `pi.registerVirtualModel`. A bare runtime lists the built-ins, so an extension's provider is invisible to us while `pi` in a terminal knows it.

The agent path was closer: it built a runtime and a `DefaultResourceLoader`, and handed both to `createAgentSession`, which is where the wiring happens. So the same configuration could list a provider it could not select, depending on which path asked.

## Decision

**One way to open Pi.** `openPiServices(cwd, loader?)` calls `createAgentSessionServices({ cwd, agentDir, resourceLoaderOptions })` and returns its services: a model runtime with the extensions' registrations already applied, plus the settings manager and resource loader. The model list reads `services.modelRuntime.getModels()`; `llm` resolves and completes on the same runtime; the agent path builds its session with `createAgentSessionFromServices({ services, sessionManager, model })`. The appended system prompt a call passes rides in as `resourceLoaderOptions.appendSystemPrompt`, which is the same loader the session uses.

**Evidence, because this is a third-party API.** A probe on a Pi installed for the purpose, with a synthetic extension under its agent directory calling `pi.registerProvider('fake-kiro', …)`:

- a bare `ModelRuntime`: 42 providers, 1539 models, no `fake-kiro`;
- `createAgentSessionServices`: 43 providers, 1540 models, `fake-kiro` with `kiro-sonnet`.

The manual route was also tried and is why the services entry was chosen: `discoverAndLoadExtensions` + `new ExtensionRunner(...)` + `bindCore(actions, contextActions, providerActions)` loaded the extension (1 of 1) and its registration still did not reach the runtime, because the factories run on the session path rather than at bind time.

## Alternatives considered

- **`discoverAndLoadExtensions` + `ExtensionRunner` by hand.** Fewer vendor calls, more vendor knowledge: the probe above shows it is not sufficient on its own, and the missing step is exactly the kind of thing that changes between Pi releases.
- **Ask the user's `pi` (CLI or RPC) for its model list.** Guarantees the same answer the terminal gives, and makes a listing spawn a process, with a second place that has to know where Pi is installed — the question the previous three changes were about.
- **Keep the bare runtime and merge the extension providers ourselves.** We would be reimplementing provider composition, including virtual models, which is the part of Pi that is not public API.
- **Cache the services.** They are heavier than a bare runtime — the step loads resources and extensions — and model data changes when the user installs or removes an extension. Correctness first; a cache needs an invalidation story.

## Consequences

Settings now offers what Pi can actually run, including providers from extensions, and a name saved in a policy resolves on both the listing and the running path.

The cost is that listing models does the resource and extension load the agent path already did, and it happens on each call. Tests cover the wiring through the mocked vendor module, where the services' runtime is the only one that carries the extension's provider — so the regression this note describes fails the suite if the bare runtime comes back.
