# Agent Note: The market install reload test opens a view

Status: implemented

## Problem

`author market tools` claimed to cover the live-backend swap that an install performs over an open tab. It did not. Every `mini_app_call` in that test ran without a view, so the call was ephemeral, and `oneCall` ended it through `teardownAppSession`, which deletes the live entry. `invalidateLiveBackend` returned at `previous === undefined` on both installs, and the branch gate sat at 84.99% against its 85% threshold.

## Decision

The test calls `enterView` first, writes a changed `main.api.ts`, installs again, and asserts the next call answers from the new module. An install over a view now proves the re-import, not only the `app:reload` notice.

## Alternatives considered

Cover any other uncovered branch to clear the threshold by one. Rejected: it would leave the release's headline behaviour — panel reload and market install swapping the API module without a Host restart — untested.

## Consequences

The swap path has a covered test, and the branch total clears the gate with little headroom. A website-tagged driver swap inside `invalidateLiveBackend` stays untested at this level; the website-session tests cover the session side of that swap.
