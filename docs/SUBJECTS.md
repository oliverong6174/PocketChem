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

## Physics (Stage 13)

Physics is an implemented Scientific Workbench subject with tools `phOverview`, `phMechanics`, `phCircuits`, `phRc` and `phSaved`
(`PHYSICS_TOOLS`, routes `#/physics/overview|mechanics|circuits|rc-transient|saved`). `App.tsx` keeps one non-Organic tool state
(`SubjectToolId`); `switchSubject` selects the open tool when it belongs to the target subject and otherwise that subject's Overview.

- Pure models (no React) live in `src/utils/physics/`: `mechanics.ts` (analytic constant-acceleration kinematics, landing event, summaries),
  `circuits.ts` (series/parallel resistor trees, KCL/KVL checks, editing helpers), `circuitLayout.ts` (the drawing derived from the same tree),
  `rc.ts` (first-order RC transient), `simClock.ts` (frame-rate-independent clock arithmetic), `format.ts` (SI formatting).
- Simulation UI helpers are in `src/components/physics/sim.tsx` (`useSimClock` with requestAnimationFrame only while playing, `SimControls`,
  `ParamSlider`, arrows) and `useSimTime.ts` (shared time kept local and committed to saved inputs when the user stops).
  Charts reuse `ui/LineChart`; autosave and Saved Analyses reuse `generalChem/useGcWorkspace`.
- Persistence pages `mechanics`, `circuits`, `rc` (subject `physics`) are validated in `utils/persistence/physicsTools.ts`, which also rejects
  contradictory records (a time beyond the end of the motion, a selected component that is not in the circuit).
- Not supported, stated in the tools: air resistance, forces, non-series/parallel circuit topologies, AC, inductors, multi-capacitor circuits.

### Physics, Stage 14 additions

Three more Physics tools share the Stage 13 simulation infrastructure (`useSimClock`, `useSimTime`, `SimControls`, arrows, `LineChart` via
`TimeChart`, `useGcWorkspace`, `GcPredictPanel`): `phForces`, `phEnergy`, `phCollisions` (routes `#/physics/forces|energy|collisions`, pages
`forces`, `energy`, `collisions`). Tool groups are now `analyze`, `mechanics`, `electricity`, `synthesize`, `library` (`TOOL_GROUPS`); the shell
shows a group label only when a subject has tools in it, so Organic and General are unchanged.

- `utils/physics/forces.ts`: static/kinetic friction engine (piecewise analytic motion), normal force N = mg cosθ − F sinφ with contact loss, inclines,
  and a block + hanging mass on one friction engine. `energy.ts`: four time-based scenarios with one ledger KE + PE + Q = E(0) + W_applied.
  `collisions.ts`: momentum + restitution, collision only when the bodies are closing, impulse always, average force only with a given duration.
- Learning content (`mechanicsLearning.ts`) includes a free-body-diagram quiz whose correct answer is computed from the physics.
