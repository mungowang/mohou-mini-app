# Agent Note: Diff overview ruler

Status: implemented

## Problem

`DiffViewer` highlights changed lines, but a long file hides where those lines sit. The counts in the header do not say how many sites there are, or where.

## Decision

A fixed ruler on the right maps the file onto the viewport. Consecutive changed lines are one mark. Green is added, red is removed, and a mix is both. A click scrolls that row into view. A translucent band shows the current viewport. The header names the mark count. Up and down step to the previous and next mark, from the first row still in view.

## Alternatives considered

- One mark per changed line. Lost: a ten-line edit looks like ten sites.
- Rely on the native scrollbar. Lost: a thin bar does not name the sites, and a click does not jump to a chosen site.

## Consequences

An unchanged file draws no ruler and no step controls. Split mode shares one ruler and one step pair with the unified view, because both columns scroll together.
