# Stage 11 handoff — multidisciplinary platform and first General Chemistry module

Branch `stage10-ui-overhaul`. Local commits only; nothing pushed. Stage 12 not started.

## 1. Starting checkpoint
`6233c2c docs: Stage 10B handoff`. Working tree then: only the long-standing untracked files (`CLAUDE.md`, `stage5-*`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`), left untouched.

## 2. Shared architecture (see `docs/SUBJECTS.md`)
- `src/navigation/subjects.ts` is the typed registry: five subjects with `mode`, `status`, URL `slug`; `SUBJECT_TOOLS` per subject (planned subjects have none, so they cannot render a tool); `routeHash`/`parseRoute` for `#/<subject>/<tool>` deep links; `isAvailable`.
- `App.tsx` holds `activeSubject` / `generalTool`; switching subject waits for the page being left to save (`runLeaveHooks`), exactly like tab switching. The address bar follows the subject/tool (push/replace) and back/forward work. Planned-subject and malformed deep links are ignored.
- The existing Organic navigation lines (`onSelectTool={(id) => switchPage(id as AppPage)}`, `switchPage(target, { keepOpenRequest: true })`, Properties ready condition) are unchanged; General is a second `AppShell` branch.
- `SubjectPicker`/`AppShell` take `onSelectSubject`; planned subjects still open the informational dialog only.
- Two product patterns documented (Workbench; Interactive Learning). No Physics/Biology/Biochemistry content was built.

## 3. General Chemistry environment
Tabs: Overview, Acid–base & titration, Saved. The Overview lists the one working tool with an Open button and, separately, planned areas as non-interactive "Planned" items (stoichiometry, gas laws, thermochemistry, solubility equilibria, periodic trends). No fake calculators.

## 4. Numerical acid–base model (`src/utils/generalChem/acidBase.ts`)
One exact method for every case: full charge balance (H⁺ + cations + BH⁺ = OH⁻ + anions + A⁻) with mass balance in the species fractions, solved by bisection on pH. The imbalance is strictly monotone in [H⁺], so there is exactly one physical root and no piecewise approximations (hence no discontinuities). Supports strong/weak monoprotic acids and bases, pH/pOH, percent ionization, water autoionization, dilution (C₁V₁ = C₂V₂; dilution only), buffers with a regime check on Henderson–Hasselbalch (ratio 0.1–10 and components ≫ the H⁺/OH⁻ they imply) and a buffer-capacity figure. The textbook √(Ka·C) shortcut is shown beside the exact result and flagged invalid when x ≥ 5 % of C or water matters.

## 5. Titration simulator (`titration.ts`, `AcidBaseTitrationPage.tsx`)
Strong acid/strong base, weak acid/strong base, strong base/strong acid, weak base/strong acid. Editable: analyte concentration and volume, pKa/pKb, titrant concentration, added volume (field, slider, chart drag, chart keyboard). Shows live pH, region, equivalence volume and pH, half-equivalence (deviation from pKa), buffer region (pH = pKa ± 1, solved for volumes), species table with charge/mass-balance check, the relevant equations, and a data table. The curve is sampled from the same `pHAt` the readouts use (adaptively refined so the vertical rise at equivalence is smooth); a test asserts plotted points equal the shown numbers.

## 6. Educational interaction (`learning.ts`)
Explore: a point explanation for every region plus five "why" lessons (strong vs weak start, buffer region, equivalence pH ≠ 7, half-equivalence = pKa, dilution), all quoting numbers from the model. Practice: predict-then-observe (higher / lower / about the same) for four parameter changes; the answer is hidden until the learner commits, and the change can be applied to the tool. No quiz system.

## 7. Reusable scientific UI
`ui/LineChart.tsx` (dependency-free SVG, real-pixel text, nice ticks, bands, markers, slider-role current marker), `utils/chartTicks.ts`, `generalChem/format.ts` (pH to 2 decimals; scientific notation for small values; significant figures). Reused: `ToolHeader`, `Panel`, `DiagramFrame`, `Legend`, `KeyFigures`, `Callout`, `Disclosure`, `Segmented`, `LearningModeSwitch`, `Explanation`, saved-analysis controls.

## 8. Persistence
New persisted page `genchem` (subject `general`): `generalChemWorkspace.ts` has strict validators for inputs (all three views) and a small results summary, plus autosave recovery and Saved Analyses. Records now carry an explicit `subject`; pre-Stage-11 records read as their page's subject (Organic); a subject that contradicts the page marks the record damaged. Schema version unchanged (additive). On open, results are recomputed from inputs, and a notice appears if the model's pH differs from the saved one. The Saved list shows "Subject · Tool", and a General record opened from the Organic Saved tab switches subject.

## 9. Organic Chemistry compatibility
All Organic tool ids/labels/order unchanged (tested); live suites for Organic still pass (Stage 10: 30/30, Stage 10B: 27/27, Stage 9N: 35/35). No engine, rule or Ketcher protocol file was modified. Older source-pattern tests were updated only where the facts changed (two subjects available; `slug` field between `id` and `label`; `genchem` in the saved-page maps).

## 10. Scientific assumptions and limits
25 °C only (Kw = 1.0×10⁻¹⁴); ideal solutions (no activity or ionic-strength correction); one monoprotic acid *or* base at a time; strong titrant of the opposite kind; additive volumes. Not modelled: polyprotic species, mixtures, amphoteric salts, other temperatures, non-aqueous solvents, dissolved CO₂. Domain: 1e-7 to 5 mol/L, pKa/pKb 0.5–13.5, volumes 0.1–5000 mL, titrant up to 2× equivalence; outside it input is refused with a reason (warnings above 0.5 M and below 1e-5 M). pH is shown to two decimals because the ideal-solution assumption limits real accuracy. This is a teaching model, labelled "Teaching model".

## 11. Test results
- `generalChemAcidBase11.test.mjs`: **64/64**. References are independent: closed-form quadratics and a Newton-solved cubic for weak acids, mole-balance arithmetic for titration points (e.g. 0.1 M HCl/NaOH: 1.368 at 10 mL, 7.000, 11.292 at 26 mL; acetic acid: 2.875 start, half-equivalence ≈ pKa, 8.72 equivalence; ammonia: 5.28 equivalence), 1/11 and 10/11 buffer boundaries, 200 random systems for charge/mass balance, extremes of the whole supported domain, curve monotonicity/continuity, invalid input.
- `generalChemPlatform11.test.mjs`: **26/26** (registry, routes, App wiring, saved round trips for all views and analyte types, legacy-record compatibility, subject-mismatch refusal).
- Related existing suites (ui10, uiPolish, reactionWorkspace, conformations*, persistence*, analysisLibrary*, multicatalyticPersistence + the two above): **all pass** in the last combined run before the final button-style tweak; the library/ui10 subset (197 tests) was re-run after updating the old assertions and passes.
- Live browser (headless Chrome, production build), `scripts/browser/stage11LiveCheck.mjs`: **54/54** — navigation and Back/Forward, planned subject dialog, honest overview, 25 mL = pH 8.73, strong/strong 7.00, curve redraw on parameter change, chart keyboard and click-to-position, invalid/non-numeric/out-of-range input, single-solution and buffer views, Explore lessons and Practice predict/reveal, save → change → open → exact restoration, cross-subject open from the Organic Saved tab, reload persistence, no overflow at 375/768/1440 in both themes, no page exceptions. Screenshots inspected (dark/light desktop, phone).

**Not run:** the full `npm test`. It was started once and stopped by the system because memory was critically low; it was not restarted. Prior stages recorded known search-deadline failures there (e.g. the `synthesisUi` two-copy-inventory test fails on the pre-change baseline); this stage touched no engine code, so no new failure there is expected, but that is not verified. Spectroscopy/Reactions/Synthesis result pages were not re-inspected visually.

## 12. Build and lint
`tsc -b` clean; `vite build` succeeds (existing chunk-size warning). `eslint .`: 18 problems (16 errors, 2 warnings), identical to the pre-existing baseline; none in Stage 11 files (five I introduced along the way were fixed, no suppressions).

## 13. Performance
10,000 `pHAt` evaluations < 1.5 s (test-enforced); a curve is ~200–400 points, recomputed on input change only (memoised). General Chemistry code and CSS are lazy chunks (`AcidBaseTitrationPage`, overview), so Organic startup is unchanged apart from the small registry/route code.

## 14. Known UI design debt
- Carried from Stage 10B (not done, not hidden): Reactions, Multi-Step, Multi-Catalytic and Spectroscopy **results areas** were given the shared header and consistent input but not restructured onto `Workspace/Inspector`; Properties dashboard still uses older chip tabs; Conformations keeps its own header.
- The tool-context bar and each page's `ToolHeader` repeat the tool name/summary.
- The intermediate commit `0cd62d7` references `AcidBaseTitrationPage` before the next commit adds it (the branch tip builds; that single intermediate commit does not).
- Chart: the equivalence label can crowd the curve at very small widths (labels are hidden below 520 px and the legend carries the meaning); no zoom.
- Practice mode only has four scenarios; no scoring or history.
- Autosave notice "Restored your values…" shows on every revisit.

## 15. Commits
- `f1b22a1` feat(general-chem): charge-balance acid-base and titration model with explanations and predict scenarios
- `0cd62d7` feat(platform): typed subject registry with routes, subject-aware shell and saved records (genchem page, explicit subject)
- `44984e5` feat(general-chem): acid-base and titration tool, overview page, shared LineChart
- `1216a84` test(general-chem): Stage 11 live browser check; button affordances; subject architecture doc
- (this handoff is committed after these)

## 16. Final Git status
Clean apart from the long-standing untracked files listed in §1.

## 17. Recommended next milestone
Physics as the third Workbench subject: it exercises the registry with no chemistry dependency (unit-aware quantities, a simulation loop on `LineChart`), and forces the next shared pieces — a units/significant-figures input component and a generic "parameter sweep" panel that General Chemistry's titration slider already prefigures. Before it, resolve the Stage 10B results-layout debt on the existing pages, and rerun the full `npm test` when memory allows.
