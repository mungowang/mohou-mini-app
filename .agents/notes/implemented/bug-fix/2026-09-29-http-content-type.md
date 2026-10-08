# Agent Note: Keep a caller content-type

Status: implemented

## Problem

`ctx.http` always wrote `content-type: application/json` for an object body, but only when the key was already lowercase. `Content-Type` was left in place and a second header was added. Some servers reject the pair.

## Decision

An object body gets `application/json` only when no header key matches `content-type`, ignoring letter case. A caller value is sent as given.

## Alternatives considered

- Lowercase every header key before send. Lost: a caller that depends on the original spelling loses it.
- Never set a default. Lost: an object body with no type is no longer declared as JSON.

## Consequences

A string body still does not gain a content type. An empty caller value counts as set and is not replaced.
