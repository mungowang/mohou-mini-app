# Agent Note: Lab image probe

Status: implemented

## Problem

`ctx.llm` can take an image, but the lab only sent text. There was no place to try a pasted image and a file path against the live model.

## Decision

The lab has a 图片识别 station. Paste and the file picker send `{ mimeType, data }`. A path box sends `{ path }` and leaves the read to the host. The run is stored as `vision`. The image bytes are not written into the history row.

## Alternatives considered

- Add the controls to the existing LLM box. Lost: a text prompt and an image probe are different tests, and the text box would have to explain two paths.
- Read the path in the view. Lost: that is the copy the host read exists to avoid, and a browser file input has no path.

## Consequences

A reload of `com.mohou.lab` picks up the station. The model still has to accept images; a text-only model fails with `image-unsupported`.
