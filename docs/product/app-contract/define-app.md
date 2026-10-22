---
status: shape-locked
progress: open
updated: 2026-10-22
---

# defineApp and call

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract.
- Input: `defineApp({ name, description, api, state?, onHostEvents?, website? })`. Each `api` value is `(ctx, args) => unknown | Promise<unknown>`. The author names the object `args` reads, and `defineApp` keeps that type. The UI calls `useApp().call(method, args?)` where `method` is a key of `api` and `args` is a plain object. The host still passes that object unchecked. `onHostEvents(ctx, event)` is optional and is not an `api` method. The host calls it only when this app has a [view session](../host/view-session.md). [Events](../host/events.md) owns that notice. `useApp().on` does not receive it. The hook may `ctx.push` a name this app owns. `website` is the [website](website.md) driver; required when the manifest kind is `website`, with `ensure` required on that object.
- Output: `call` resolves to the method's return value. Author `mini_app_call` also returns `session` of `view` or `ephemeral` ([View session](../host/view-session.md)). `state` is the same object reference as `ctx.state` for the life of the loaded module in that session.
- Failure: missing `name` or `description`, a non-object `api`, an `onHostEvents` that is not a function, or an invalid `website` driver, emits `define-app-invalid`. An unknown method emits `unknown-method`. A thrown method fails the call with that error as `cause`. A thrown `onHostEvents` is logged, and later instances still run. The write that published the notice still stands. `useApp()` outside the host wrapper throws on `call`. Callers match the code. Codes: [implementation.md](../implementation.md).
- Non-goals: the UI importing the backend to type-check method names; the UI calling the model, the shell, or the network itself.

`args` is untrusted. The method validates it.

## Implementation


Role: definition. `defineApp` validates and returns the same object. It does not load files. Host calls it when the backend module evaluates. The loader keeps `onHostEvents` on the loaded instance. A notice calls that function with a fresh `ctx`. An instance that is not loaded is skipped. The runner installs `useApp`. `call` outside that wrapper throws `call-outside-wrapper`. Inside the wrapper, `call` rejects `call-unmounted` until the iframe call route is mounted. A parent-posted author event reaches `on` and `onAny`. A gap reaches `onAny` only. Ping and the retry hint stay off those hooks. Unknown methods and thrown methods stay on the call path. Plan: [implementation.md](../implementation.md).
