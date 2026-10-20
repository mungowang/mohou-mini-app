# Agent Note: Theme preview card is shared

Status: implemented

## Problem

The market theme row used a strip plus workbench dummy. Settings palette chips used a short dual strip. Authors compared the two and expected the same card in Settings.

## Decision

`ThemePreviewCard` owns the shared shell: title row, color strip, workbench (or fallback bars), optional footer and overlay. Market theme rows and the Settings palette grid both render it. Selection and delete stay Settings-only props; install meta stays Market-only footer content.

## Alternatives considered

- Only enlarge the Settings chip size. Lost: two layouts to keep in sync whenever the workbench dummy changes.
- Force every Settings card through the market row type. Lost: Settings has no catalog version, install action, or pack fields.

## Consequences

A theme file with both modes paints the same workbench in both places. A one-mode file still falls back to bars in Settings.
