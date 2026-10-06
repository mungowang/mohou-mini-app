# Agent Note: Nothing turns white under the pointer

Status: implemented

## Problem

Three reports in a row, each one a white surface that appeared under the pointer in the workbench: the chip row's background, the tab that had just been clicked, and — the one that named the family — a white band that appeared on plain hover, with nothing clicked at all.

Reading the compiled sheet the app actually gets (275 KB) found no rule that paints any of those elements white on focus or hover. Each cause was somewhere else:

1. The chips are raw `<button>` elements. Preflight gives buttons `appearance: button`, so the system draws a button face on interaction that no `background-color` removes, and Tailwind's reset leaves them with no background of their own.
2. The kit's `TabsTrigger` carries `data-active:bg-background`, which is a white pill on the workbench's glass tab list.
3. `.mma-glass:hover` — the library card — replaced the card's background with 88% `--card`. `:hover` reaches an ancestor whenever anything inside it is hovered, so hovering a workbench slot that holds a running app painted a white surface *behind that app*.

## Decision

**Chips reset the native appearance and state a background in every branch.** `appearance-none` plus `bg-primary` when selected and `bg-transparent` when not. The branches are mutually exclusive on purpose: two `bg-*` classes are decided by the order of the rules in the stylesheet, not the order in the attribute.

**The active tab states its own look inline.** The kit's `data-active:bg-background` cannot be beaten reliably by another `data-active:bg-*` class for the same reason, and an inline style beats both.

**A card lifts on hover and does not change its background.** The lift and the shadow are the affordance; the background swap only ever read as a flash of white behind whatever the card contained. The card CSS is the one place every card variant shares, so the fix is there and not in the panel that draws them.

**The app's own interactive surfaces stay opaque.** The workbench's stations were glass wells over the app's translucent sky, so an unpainted backdrop made them read as white. The shell station is a soft card now (`WORK`), which is what the app's own stylesheet already said the working set is.

## Alternatives considered

- **Chase the rendering, since the symptom looked like one.** The first two reports did look like compositing artifacts. They were not; the third was the design of the card.
- **Give the chips `bg-transparent` in one shared class with the background utilities.** Two background utilities in one class list are settled by stylesheet order, which is how the first attempt at this fix silently failed.
- **Keep the hover background and make it hue-preserving.** Better than white, and it still puts a different surface behind content that was designed against the card's own tint.
- **Scope the card hover to preview cards only.** CSS cannot tell a card being hovered from a card containing the hovered element, which is the whole mechanism.

## The fix would not have reached anyone

The card rule lives in the host's sheet, and an app's compiled sheet is cached under a stamp taken
over the app's own files. Tailwind scans the kit and the view sources as well, so a sheet built
before this change stayed valid forever: the stamp could not see that the kit had changed. Deleting
the app's `.autogen` directory proved it — the same request then returned the fixed rule — and it
means a styling fix shipped in the product never reached an app that had already compiled once.

The stamp now covers the directories the compiler actually scans, so a kit or view change retires
every app's sheet once. `sourceStamp` takes that material as a parameter, and a test pins the two
halves: a different revision is a different key, and a file written under one is invisible under the
other.

## Consequences

Hovering anything in the workbench changes nothing behind it. A card still lifts, a chip still takes its selected colour, and a tab still marks itself active.

The general rule this leaves behind: a translucent surface in app UI is a bet that the surface under it stays what it is. When the layer below belongs to the panel, that bet is the panel's to keep — and a container that reacts to hover cannot know it is hosting content.
