---
status: shape-locked
progress: settled
updated: 2026-10-08
---

# UI kit

Layer: [App contract](README.md). Index: [features.md](../features.md).

- Owner: App contract. The kit is the author UI package. Host serves one shared copy to every iframe.
- Input: imports from the UI kit, plus `className` and token-based colour. Components accept standard element props (`className`, `style`, `onClick`, `aria-*`) without restating them. Compound components expose named parts. Authors take part names from the generated contract, not from memory.
- Output: a view that fills the iframe. The host wrapper provides theme and `useApp`. Authors do not mount their own theme provider.
- Failure: a wrong part name or a wrong prop fails at render and is reported through runtime diagnostics. A missing kit file fails the iframe load and is a `module` error.
- The kit is a shortcut for SaaS-shaped screens: lists, settings, boards, dashboards. A beautiful app may be native elements and Tailwind, kit parts, or both. Using no kit component is valid.
- Non-goals: a mandate to use a kit component when native elements fit; `Stack`, `Text`, or `Box`; fetching, storage, or routing inside a layout preset.

Kit capabilities an author can call:

- Page skeleton: `AppShell`, `PageHeader`, `FilterBar`, `DetailPanel`.
- Layout presets: `ListDetail` (`list`, `detail`, `empty?`, `toolbar?`), `TablePage` (`toolbar`, `grid`, `pagination?`, `bulk?`, `empty?`), `DashboardShell` (`header`, `kpis?`, `main`, `aside?`), `SettingsSplit` (`nav`, `sections`, `footer?`), `WizardShell` (`stepper`, `body`, `footer`), `FormSheet` (`header`, `body`, `footer`). Each encodes independent scroll, sticky chrome, and responsive collapse. Slots are nodes. `className` is accepted. Semantic HTML is the output.
- Data and status: `StatCard`, `TrendCard`, `StatusBadge`, `SeverityChip`, `DataGrid`.
- `AppCard` draws one app in `glass`, `stamp`, `etch`, `hero`, `pulse`, or `list`. The props are `type`, `app`, `open?`, `openLabel?`, `extra?`, and `onOpen`. `extra.featured` spans two columns on `glass` and is ignored by the other styles. The card calls `onOpen` and does not open the app. `app` is the owner list item. The component lives in `@mohou/app-view`. This package re-exports it. A card lifts and takes a shadow on hover and does not change its background: `:hover` reaches an ancestor whenever anything inside the card is hovered, so a background swap would paint behind a running app in a workbench slot or behind content inside a preview.
- Date and time: `DatePicker`, `DateRangePicker`, `DateTimePicker`, `TimePicker`, `DurationInput`, `RelativeDatePicker`. Dates use the active locale, not a hard-coded locale string.
- Boards and plans: `Kanban`, `EventCalendar`, `Gantt`, `Timeline`, `Stepper`.
- Trees and lists: `TreeView`, `SortableList`, `FileTree`.
- Editors: `CodeEditor`, `MarkdownEditor`, `RichTextEditor`, `CodeBlock`, `Markdown`, `DiffViewer`, `JsonViewer`, `LogViewer`, `RequestInspector`, `Terminal`, `RunTimeline`. `Markdown` owns the reading styles for headings, lists, tables, quotes, rules, and code. `className` overrides. A normal document does not restyle those elements.
- Forms: `SearchInput`, `NumberField`, `TagInput`, `ConfirmDialog`, `FileDropzone`, `Copyable`, `UserPicker`.
- Live refresh: `LiveRefresh` (`onTick`, optional `persistState`, `intervals`, `labels`). App-owned soft timer chrome inside the iframe. Not a panel host control.
- Charts: `DonutChart`, `StackedBarChart`, `Sparkline`, `Gauge`, `RadarChart`, and the base `Chart`.
- Primitives: `Button`, `Input`, `Select`, `Dialog`, `Sheet`, `Tabs`, `Card`, `Badge`, `Toast`, `Empty`, and the rest of the primitive set published in the generated catalog.
- `cn` for class names.
- `Reveal` for a staggered entrance. It honours reduced motion.
- Icons: `import { Icon } from` the UI kit, then `<Icon.HelpCircle />`. Any name in the icon set works. The skill publishes a curated subset.
- Illustrations: `IlluEmpty`, `IlluNoData`, `IlluSearch`, `IlluLoading`, `IlluServerStatus`, `IlluAccessDenied`, `IlluPageNotFound`, `IlluDataProcessing`, `IlluBugFixing`, `IlluCodeReview`. Accent follows `--primary-svg-color`. Assets contain no hex.

`CodeEditor` loads its editor engine on demand. Find uses Mod-f / Ctrl-f when that engine loads (next, previous, match case, regexp). `CodeBlock` and `DiffViewer` load their highlighter on demand. `DiffViewer` keeps a ruler on the right. Each mark is one run of changed lines. The header names how many runs there are. Up and down step to the previous and next run. A click on the ruler scrolls that run into view. `RichTextEditor` is local content-editable and loads nothing. When the on-demand fetch fails, `CodeEditor` becomes a text area and the highlighter renders plain text. The view does not crash. Authors do not import those engines and do not add them as app dependencies.

Kit chrome strings (toolbar labels, empty states, aria labels, relative time) go through the kit label function. Keys exist in `en` and `zh`. A new string lands in both. Technical tokens (log abbreviations, environment keys, commit hashes) stay English. The host runner wraps `UiProvider` from host `locale` (`zh-CN` → `zh`, otherwise `en`). Authors do not wrap a second provider for the default kit language.

Colour in app UI uses the theme tokens (`var(--background)`, `var(--foreground)`, `var(--card)`, `var(--primary)`, and the rest of that list). The author does not define a second class name for a token. Token translucency uses `color-mix` against the token variable. A panel width is user-dragged, so layout uses explicit spans rather than viewport breakpoints as a substitute for the panel width.

Custom `@keyframes` are allowed under a name the app owns. Names already defined by the kit stylesheet or the runner boot stylesheet are reserved. A collision or a duplicate declaration in one app is a reload notice, not a failure.

## Implementation


Role: definition of the author UI package `@mohou/ui`. Host vendor-builds that package into `/mma/sdk.js` the same way it builds lodash. Tailwind `@source` includes the kit source so kit classes appear in the app sheet. Host does not write components. Overlay and chart classes use the existing theme tokens, not extra names. On-demand engines are not app dependencies. A failed fetch degrades that widget. The component catalog is generated. This page does not freeze a second catalog. Plan: [implementation.md](../implementation.md).
