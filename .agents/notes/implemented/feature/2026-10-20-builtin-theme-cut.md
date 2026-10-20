# Agent Note: Builtin theme set is five palettes

Status: implemented

## Problem

The shipped host theme folder held eight palettes. Several names were noise (Pill Yellow) or franchise references (Three Swords / 三刀流), and the list was long for a first-run picker.

## Decision

Builtin themes are Default, Strawberry Matcha, Graphite, Hokage Dawn, and Verdant (青锋). Tundra, Tokyo Night, and Pill Yellow are removed. The former zoro file is `theme-verdant.css` with display names Verdant / 青锋.

## Alternatives considered

- Keep Pill Yellow and only rename it. Lost: the user preferred Hokage Dawn in that slot.
- Keep the `zoro` file id and only change labels. Lost: the id still named the old joke after the labels moved.

## Consequences

A host pin or policy that still names `zoro`, `yellow`, `forest`, or `tokyo` no longer finds a builtin file and falls back like any missing palette. Market theme packages are unchanged.
