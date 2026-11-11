# Subject architecture

PocketChem is one application with several subject branches, not several applications. The shell, themes, design tokens,
learning-mode switch, diagram frame, chart, saved-analysis library and persistence are shared. A subject contributes tools.

## Registry (`src/navigation/subjects.ts`)

| Piece | Purpose |
| --- | --- |
| `SUBJECTS` | The five subjects (organic, general, physics, biology, biochemistry): label, product `mode`, `status` (`available` or `planned`), URL `slug`, tagline, and the *planned* areas shown on the preview. |
| `SUBJECT_TOOLS` | Tools per subject (`id`, URL `slug`, label, summary, group, icon). Planned subjects have an empty list: they cannot render a tool until implemented. |
| `routeHash` / `parseRoute` | `#/<subject>/<tool>` deep links. Unknown, malformed or planned routes parse to `null` and are ignored. |
| `isAvailable(id)` | `status === "available"` **and** at least one tool. |

## Two product patterns

- **Scientific Workbench** (Organic, General, Physics): inputs, numerical parameters, diagrams and graphs, results, interpretation.
  Reuse `ToolHeader`, `Panel`, `DiagramFrame`, `LineChart`, `KeyFigures`, `Explanation`, `Callout`, `Disclosure`, `Segmented`.
- **Interactive Learning** (Biology, Biochemistry): labelled explorable diagrams, Explore / Practice / Challenge, progressive
  explanations. Reuse `LearningModeSwitch` (a page declares only the modes it actually supports) and `DiagramFrame`.
  General Chemistry already uses Explore + Practice (predict-then-observe) and Conformations uses Explore + Practice.

These are shared vocabularies, not templates; a tool may use whichever parts it needs.

## Adding a subject (checklist)

1. Mark it `available` in `SUBJECTS`; add its tools to `SUBJECT_TOOLS` (ids stable, slugs unique within the subject).
2. Render its panels in `App.tsx` under the same shell (see the `activeSubject === "general"` branch). Lazy-load tool pages.
3. Evidence level: show an `EvidenceBadge` (`estimate`, `rule`, `model`, `saved`) so uncertainty is visible.
4. Persistence: add a `PersistedPage` in `utils/persistence/workspaceStore.ts`, its subject in `PAGE_SUBJECT`, a workspace
   module with `validateInputs` / `validateResults` and an engine version, and register it in `analysisLibraryApp.ts`
   (`OPENABLE_ANALYSIS_PAGES`, `ANALYSIS_APP_PAGE`, validators) and the labels in `SavedAnalysesPage.tsx`.
5. Tests: numerical references derived independently of the implementation; subject/route tests; a saved-record round trip;
   a live-browser check (copy `scripts/browser/stage11LiveCheck.mjs`).
6. Do not show calculators or buttons for things that do not exist; list them as *Planned* only.

## Saved records and subjects

Saved-analysis records carry an explicit `subject`. Records written before Stage 11 have no `subject` field and are read as
`PAGE_SUBJECT[page]` (all Organic Chemistry). A record whose `subject` contradicts its page is reported as damaged and is
never opened. The record schema version is unchanged (the field is additive and optional on read).

## Shared scientific components

- `ui/LineChart.tsx`: dependency-free SVG chart in real pixels (labelled axes with units, nice ticks, shaded bands,
  labelled markers, a draggable/keyboard-operable "current" marker that is a `role=slider`). Callers pass numbers from
  their model so the plot and readouts cannot disagree. Put it in a `DiagramFrame` (paper surface).
- `utils/chartTicks.ts`: tick generation.
- `utils/generalChem/format.ts`: significant-figure and pH formatting.
