# Stage 12 handoff: General Chemistry core expansion

Branch `stage10-ui-overhaul`. Local commits only; nothing pushed. Stage 13 not started.

## 1. Starting checkpoint
`6e43f49 docs: Stage 11 handoff`. Working tree then: only the long-standing untracked files (`CLAUDE.md`, `stage5-*`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`), left untouched.

## 2. Chemical Equilibrium (`utils/generalChem/equilibrium.ts`, `EquilibriumPage.tsx`)
One reaction, 1–2 reactants + 1–2 products, integer coefficients 1–6, ideal gas or ideal solute, constant T. Q₀ vs K and direction; unique equilibrium extent; ICE table; composition graph and log Q–vs–K graph with a draggable progress marker; Le Châtelier disturbances (add/remove a species, volume change ×0.1–10, inert gas) with immediate Q, shift, old/right-after/new table; Kc→Kp for gases (Kp = Kc(RT)^Δν, R in L·bar/(mol·K), 1 bar standard); worked ICE solution; five example reactions. Temperature effect on K is deliberately not modelled (needs ΔH°; see Thermodynamics K from ΔG°).

## 3. Reaction Kinetics (`kinetics.ts`, `KineticsPage.tsx`)
Single reactant, order 0/1/2 (order is an input or fitted, never inferred from coefficients). Integrated laws, half-lives, successive half-lives, units per order and time unit (s/min/h/day), synchronized [A]–t and linearized plots sharing one time marker. Fit tab: paste t,c rows, linear fit of each linearization, comparison on a common concentration-RMSE yardstick, verdict `supported / ambiguous / insufficient / poor` (insufficient below 30 % conversion; poor if best error > 10 % of range). Arrhenius tab: given Ea, two measurements, or a table (regression of ln k on 1/T with R² and SE); Arrhenius plot and k–T plot.

## 4. Thermodynamics (`thermo.ts`, `ThermodynamicsPage.tsx`)
Gibbs: ΔG° = ΔH° − TΔS° with optional constant ΔCp (Kirchhoff), K from ΔG°, nonstandard ΔG with Q, crossover temperatures (numerical sign changes), four-sign-case table, graph of ΔG°, ΔH°, TΔS° with favourable shading and amber "far from T₀" bands when ΔCp = 0. Hess: parses balanced equations (formulas with parentheses, states, fractions), solves signed multipliers by Gauss–Jordan, refuses unbalanced/unreachable/dependent sets, state-mismatch hint, ledger and species-cancellation table. Calorimetry: reaction ΔH (with calorimeter heat capacity), two-sample mixing, specific heat of a metal, each with energy-balance steps.

## 5. Algorithms and assumptions
- Equilibrium: G(ξ) = ln Q − ln K is strictly increasing in ξ on the physical interval, so exactly one root; bisection in log ξ (or log of the distance to ξmax) keeps relative precision for extreme K; concentrations are sums of non-negative terms. Handles absent species (Q = 0 / ∞ / 0⁄0), limiting reactants, K 1e-15…1e15.
- Kinetics: closed forms; fit uses OLS on linearizations, drawn back on the concentration axis.
- Thermo: closed forms plus bisection for roots; Hess via exact elimination with rational snapping.
- Limits are shown on each page ("Assumptions and limits") and in the overview.

## 6. Interactive visualization
Shared `LineChart` gained per-series colour/dash, data dots, gap-safe paths, and warning bands. All charts drag/keyboard/slider-driven where they have a selected point.

## 7. Educational interactions
Explore: lessons whose text quotes the live numbers. Practice (all three tools): predict higher/lower/same (kinetics, Gibbs, calorimetry; shared `GcPredictPanel` + `predict.ts`), predict the shift and "which way does it go?" (equilibrium), do-the-accounting answer check (Hess). Answers hidden until the learner commits.

## 8. Navigation
`GENERAL_TOOLS` now Overview, Acid–base & titration, Chemical equilibrium, Reaction kinetics, Thermodynamics, Saved (routes `#/general/equilibrium|kinetics|thermodynamics`). Overview lists the four working tools and keeps Stoichiometry, Gas laws, Solubility equilibria, Periodic trends as non-interactive "Planned" (Thermochemistry removed from planned). Three icons added.

## 9. Persistence
New pages `equilibrium`, `kinetics`, `thermo` (subject `general`), strict validators in `persistence/generalChemTools.ts` (new objects from known fields, bounds enforced, no coercion), engine version 1 each, `check` number to detect model drift on open, autosave + Saved Analyses via the shared `useGcWorkspace` hook. Existing `genchem` and Organic records unchanged (tested). Schema version unchanged (additive). Note: autosave restores the last view of a tool (e.g. thermo reopens in calorimetry).

## 10. Scientific tests (all green)
- `generalChemEquilibrium12` 19: closed-form quadratics/perfect squares, first-order K extremes 1e-12…1e12, reverse side, mass balance, 300 random systems (Q = K to 1e-9), limiting reactant, zero species, disturbances, Kp, validation.
- `generalChemKinetics12` 25: integrated laws, t½, successive half-lives, finite-difference rates, linearized slopes, units, fits (exact, noisy, insufficient, poor, unusable log), parsing, Arrhenius (91.9 kJ/mol worked example, round trips), validation.
- `generalChemThermo12` 24: Haber/CaCO₃/boiling values, Kirchhoff and Gibbs–Helmholtz by finite differences, crossovers vs brute-force grid, Hess (CO, NO₂, scaling, fractions, state/balance/redundancy refusals), calorimetry (hand values, energy conservation), invalid input.
- `generalChemPlatform12` 24: registry, routes, wiring, strict validators, round trips for every tool/view, legacy and tamper records.
- Hand values in these tests were derived independently; two thermo expected constants were corrected from my own arithmetic slips before any change to the implementation.
- Older tests updated only where facts changed: tool list/ids, library page lists (`generalChemPlatform11`, `analysisLibraryPages`, `analysisLibraryAllPages`).
- Focused run: generalChem*, analysisLibrary*, persistence*, ui10*, uiPolish*, multicatalyticPersistence, reactionWorkspace: all pass (466 tests after the last fix; 202 in the final targeted re-run).

## 11. Live browser (headless Chrome, production build)
`scripts/browser/stage12LiveCheck.mjs`: **142/142**. Real numeric inputs against closed forms (N₂O₄ extent 0.0102, H₂+I₂ [HI], half-lives 13.9/10/25 s, Ea 91.9 kJ/mol, ΔG° −12.7 kJ/mol, Hess −110.5/−221 kJ, calorimetry −54.4/−73.9 kJ/mol, mix 50 °C, c 0.558), sliders/charts moving together, errors for bad input, Explore/Practice, save → change → open → restore, cross-subject open from the Organic Saved tab, reload autosave, every view and mode at 375 px, 3 tools × 5 viewport/theme combinations for overflow and light chart paper, no page exceptions. `stage11LiveCheck.mjs` (acid–base regression; two stale assertions updated for the new tab list) **54/54**. Screenshots inspected (`node_modules/.cache/pc-live12`, git-ignored). Defects found and fixed during this: 375 px horizontal overflow on the equilibrium page (long axis label, unwrapped key figure), "Q₀ undefined" shown when Q₀ is simply 0, uppercase CSS turning "ξ" into "Ξ".

## 12. Build, TypeScript, lint
`tsc -b` clean; `vite build` succeeds (existing chunk-size warning). `eslint .`: 18 problems (16 errors, 2 warnings), identical to the pre-existing baseline; none in Stage 12 files (two I introduced were fixed, no suppressions).

## 13. Memory and performance
System had ~2 GB free of 16 GB. No full `npm test`. Tests ran one process at a time (`--test-concurrency=1`), build with `NODE_OPTIONS=--max-old-space-size=2048`, one Chrome at a time; nothing task-owned left running. New tools are lazy chunks (Equilibrium 30 kB, Kinetics 28 kB, Thermo 35 kB). Solver cost is negligible (300 random systems in ~15 ms).

## 14. Not supported / not tested
Equilibrium: >2 species per side, solids/liquids/solvents, coupled equilibria, non-ideal behaviour, temperature dependence of K. Kinetics: multi-reactant or fractional/mixed orders, reversible or multi-step mechanisms, confidence beyond the stated criterion. Thermo: phase changes inside a range, heat capacities that vary with T, ΔS/ΔG from tables of formation data, bomb-calorimeter corrections. Not run: the full `npm test` and the Organic result pages' visual re-inspection (no Organic code changed). Gotcha for future scripts: Git Bash rewrites arguments like `#/general/...`; use `MSYS_NO_PATHCONV=1`.

## 15. Commits
- `12fb1a9` feat(general-chem): equilibrium, kinetics and thermodynamics numerical models with independent-reference tests
- `2692b49` feat(general-chem): equilibrium, kinetics and thermodynamics workbenches with explore/practice, persistence and navigation
- fix/test/handoff commit (see `git log`)

## 16. Final Git status
Clean apart from the long-standing untracked files in §1.

## 17. Recommended Stage 13
Stoichiometry and limiting reagents plus gas laws (they reuse the equilibrium species table and Thermo unit handling), then a shared units-aware input component. Also: temperature-dependent K via van 't Hoff inside the equilibrium tool (ΔH° link), the Stage 10B results-layout debt, and a full `npm test` run when memory allows.
