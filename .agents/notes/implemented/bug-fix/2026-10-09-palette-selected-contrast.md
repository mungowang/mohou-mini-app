# Agent Note: Selected palette row stays on the accent pair

Status: implemented

## Problem

The selected command-palette row fills with `accent`. Its mark used an 8% foreground wash, and its caption used `muted-foreground`. Both assume the card. A dark palette whose accent is light, such as 紫穗, hides the mark and the caption.

## Decision

On the selected row, the mark fills with `accent-foreground` and draws in `accent`. The caption, match reason, and side label use `accent-foreground` at 80%. An unselected row keeps the card colours.

## Alternatives considered

- A darker wash of `foreground` on the selected row. Lost: `foreground` is light in dark mode, so the wash still disappears on a light accent.
- Stop using `accent` for the selected fill. Lost: the row would no longer follow the palette the user picked.

## Consequences

A theme whose `accent` and `accent-foreground` contrast keeps a readable selected row. A theme that breaks that pair still fails, and that pair is the theme contract.
