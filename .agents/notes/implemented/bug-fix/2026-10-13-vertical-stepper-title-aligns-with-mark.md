# Agent Note: Vertical stepper title shares the mark's row

Status: implemented

## Problem

A vertical `StepperItem` title sat in a column with `pt-1` and `leading-tight` beside a `size-8` mark. That 4px pad does not centre 14px type in a 32px circle, so the heading sat high against the number.

## Decision

The title row is `min-h-8 items-center leading-none`, matching the mark. A description and step body still stack below that row.

## Alternatives considered

- Keep `pt-1` and raise it to `pt-2`. Lost: the pad still tracks font metrics by hand, and a wrapped title would clip or drift.
- `items-center` on the whole step row. Lost: the connector would no longer start under the mark.

## Consequences

A one-line title shares a midline with the circle. A description starts after the 32px row, not 2px under the glyphs.
