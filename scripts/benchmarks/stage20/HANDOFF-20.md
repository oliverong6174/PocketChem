# Stage 20 handoff: Organic Chemistry workspace completion

## 1. Starting checkpoint
Branch `stage10-ui-overhaul`, HEAD `eddf174` (Stage 19 final). Untracked and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. The pre-existing stash `phase1-synthesis-reliability` was not touched (verified still present). `git stash` was not used. All staging was by explicit file name. Node v24.21.0.

## 2. Reactions redesign (mandatory deliverable 1)
`ReactionResultsExplorer` replaces the flat list of cards.
- **Overview** (from the engine's own data): outcomes, distinct products (by complete product SMILES, so regio- and stereoisomers stay distinct), reaction families, reagent sets; total rule matches versus displayed outcomes (rule-level variants such as the halogen series are combined into one row, each keeping its details); product status counts (computed vs representative vs generic vs conceptual); counts with selectivity notes and stated limitations; competition only when another outcome shares the competition group; related catalog reactions predicted not to occur.
- **Groups** by reaction type, in order of first appearance; rows keep the engine's order and object identity; nothing is merged.
- **Progressive disclosure:** first group open, other groups collapsed; each row shows title, reagent to product, status tag, and visible text tags "Selectivity" and "Limitations"; the full card (unchanged JSX) mounts only when the row is opened. Filter by text and product status ("Showing x of y", "Clear filters", an explicit "hidden by it, not removed" message). Expand all / collapse all. The old "Show 12 more" batching of forward results is gone, so every outcome is reachable.
- **Performance:** diagrams were rebuilt for all visible pathways on every change; they are now built only for open rows and cached per analysis (cache reset when the analysis or editor snapshot changes).

## 3. Multi-Catalytic redesign (mandatory deliverable 2)
Both operating modes, derived only from engine records (`workspaceRoute.ts`, `sequenceOverview.ts`, `RouteViews.tsx`).
- **Workspace mode:** "Synthesis objective" (supplied materials with structures, current end products, coproducts on the shelf, unused material, conditions applied, progress; it states that this mode has no automatic search and no target, and no target, yield or feasibility is invented); "Route overview" ladder (inputs, step reagent, products and coproducts with structures; a step that consumes lots from separate branches is labelled "Step n joins k separate inputs"); a branch table (connected lineage groups, joins); "Attempts without a product"; step details as disclosures (latest and unresolved attempts open). Existing inventory, selection and assessment are unchanged.
- **Ordered-sequence mode:** objective (starting material, conditions in order, result counts, ranking basis as the engine states it), "Sequence outcomes" as selectable rows (engine order kept; text status chips per step; "Stops at step n"), a route strip for the selected outcome (start, step arrows with reagents, products with structures; a failed step is shown as a dashed "no new product" node), and only the selected outcome's detail card is mounted.
- Fixture: the real convergent route (1-bromobutane Grignard + butanal from butan-1-ol, join to octan-4-ol, oxidation to octan-4-one).

## 4. Properties redesign (mandatory deliverable 3)
Identity card (structure, name, confidence, common name when different, formula, mass, charge, SMILES) stays above all tabs. Tabs: Summary, Acid/Base, Concepts, All properties. Summary: key results, functional groups and stereocenters, structural descriptors, qualitative tendencies. All properties: three captioned tables (composition, descriptors, tendencies) with row headers, definitions, the evidence kind, a "Why this level?" disclosure for estimates, naming and limits, and a "Not available for this structure" list (no N/A tiles). Calculated values and estimates are visibly labelled; the estimates section states they are heuristic, not measured. On phones the tables stack. The old Overview/Properties tab bodies and `PropertyTile` were removed; saved-state panel ids are unchanged.

## 5. Remaining workspace improvements
- **Multi-Step:** route at a glance (Stage 19) plus a selectable list of alternative routes when more than one exists. **Not exercised with real multiple routes:** every start/target pair I tried (about 13, including multi-material ones) returned one route, so the selector is type-checked, linted and inert for one route, but never seen populated.
- **Ranking:** unchanged from Stage 19 (ordering basis, "Not ranked" dash with screen-reader text); verified at four viewport configurations with a card-fit check.
- **Spectroscopy:** verified that the input and action row do not overlap at four configurations, that plots render on all four tabs, and that results are labelled predicted. No code change this stage.
- Multi-Step's long evidence/advisory text still sits above the step cards (kept visible, not collapsed, so no warning is hidden).

## 6. Shared design approach
No second design system: reuse of existing tokens, `Badge`-style tags, disclosures (`<details>`), buttons and the `rxe-tag` chips; one new stylesheet `src/styles/organic.css` imported after `App.css`, `ui.css`, `concepts.css` (order matters). Pure, tested helpers hold the logic (`resultsExplorer`, `workspaceRoute`, `sequenceOverview`, `propertiesSections`); components only render. Reading order per tool: inputs, controls, primary findings, structures, evidence, limitations, save.

## 7. Accessibility
Group and row toggles are real buttons with `aria-expanded`/`aria-controls` (checked in the browser); opened bodies are labelled `region`s; headings run h3 (sections) / h4 (property blocks); selected outcome/route buttons use `aria-pressed`; tables have captions and `scope` headers; structures have an accessible name plus a text alternative (name, formula, mass, SMILES) and are `aria-hidden` to avoid double reading; warnings and statuses are text tags ("Limitations", "Not ranked", "Stops at step n"), not colour only; 44-48 px targets on phones; no new animation. Not done: an audit of the older Ketcher and spectrum plot internals.

## 8. Responsive behaviour
Checked populated at 1440 light, 820 dark, 375 light and 375 dark for Reactions, Multi-Catalytic (both modes), Properties, Multi-Step, Ranking and Spectroscopy: zero page-level horizontal overflow, cards fit, structures stay legible (Properties structure 188 px wide on desktop/tablet, 279 px on phone). Wide route content: the sequence strip scrolls horizontally inside its own box on desktop and stacks vertically on phones; the workspace ladder stacks on phones; tables become stacked rows.

## 9. Results rendering and performance (measured, one real run: 2-butene)
| Measure | Value |
|---|---|
| Outcomes (rule matches 28, displayed outcomes 26) | 26 in 7 groups, 15 distinct products, 7 families |
| Initial visible rows | 2 (first group only); outcome bodies mounted: 0 |
| Page height at 820 px, first view | 2,263 px (Stage 19 reported about 13,187 px for the same analysis, which also showed only 12 of the outcomes) |
| Initial DOM nodes (whole page, incl. Ketcher) | 1,175; one row opened +46 nodes and +2 diagrams (+971 px); expand all (26 bodies) 2,807 nodes, 29,486 px |
| Accessible results | 26 of 26 (expand all mounts 26 rows and 26 bodies; test with 500+ synthetic outcomes (25 copies of the real result set): all reachable, first view mounts only the first group) |
| Logic cost | summarize + group + filter of the 500+ outcome stress set under 1 s in Node (assertion), typically milliseconds |
I did not build the pre-change commit to measure its node count, so there is no "before" DOM figure. No list virtualization was added: collapsed rows made it unnecessary on this evidence.

## 10. Scientific behaviour preservation
Engines untouched (`git diff eddf174 -- src/utils` shows only new files: `resultsExplorer.ts`, `propertiesSections.ts`, `engine/workspaceRoute.ts`, `engine/sequenceOverview.ts`). Tests assert identity and order preservation (same object references, engine order inside groups), unchanged engine values in Properties, and that route overviews equal the engine's own history. A saved Reactions analysis reopens with the same 26 outcomes without re-running.

## 11. Automated tests (sequential, `--test-concurrency=1`)
New (real engine output): `reactionsExplorer20` (20), `multicatalyticRoute20` (11), `propertiesSections20` (11). Regression group (persistence, Saved Analyses, multicatalytic persistence, ranking 9F/9G, reactionWorkspace, ui10, uiPolish, conformations, all subject platform suites, metabolism, Stage 19 suites, sequentialSafety, branches, massSpec9g, nomenclature9f, selectivity9c, plus the three new files): 871/871 after one fix. One existing assertion in `analysisLibraryAllPages` checked the source text of the diagram effect's dependency list (`[visiblePathways, ...]`); it now checks the new list (`[expandedPathways, pathways, ...]`), with the same intent (drawings are rebuilt from structures and never stored). Not run: full `npm test`, the slow synthesis search-budget suites, and the remaining engine suites outside the groups above.

## 12. Real-browser verification (production build, headless Chrome, one at a time)
Real engine execution: Reactions (2-butene), Multi-Catalytic workspace (the convergent route, four real steps through the UI) and ordered sequence (propene with HBr then a non-reacting condition), Properties (acetic acid, aspirin), Multi-Step (real convergent search), Ranking (acetic acid, phenol, ethanol), Spectroscopy (acetone). No stored result fixtures were needed, so there are none to disclose; the exception is that multiple *alternative routes* in Multi-Step could not be produced.
- `stage20ReactionsCheck` 26/26 (overview, groups, aria, lazy diagrams, filters, reachability of all 26, expand/collapse all, save, reopen, 4 layouts).
- `stage20McCheck` 20/20 (both modes; join reported; one detail card mounted; 4 layouts each).
- `stage20PropertiesCheck` 26/26 (identity, structure accessible name, tabs, evidence labels, tables, disclosure, aspirin, save/reopen, 4 layouts, stacked tables at 375).
- `stage20ConsistencyCheck` 35/35 (Multi-Step, Ranking, Spectroscopy, search and related concepts, five subjects' navigation).
- Regression: `stage19LiveCheck` 56/56, `stage10bLiveCheck` 27/27 on the final build (`stage18LiveCheck` 108/108 earlier this stage on an earlier build, before the Multi-Step/Properties edits; not re-run on the final build).
Screenshots in `node_modules/.cache/pc-live20` were opened and inspected (Reactions initial, Multi-Catalytic workspace and sequence phone, Properties summary and phone detail, Spectroscopy phone dark, Multi-Step tablet dark).

## 13. Before/after
Reactions first screen at 820 px: about 13,187 px (Stage 19) to 2,263 px. Multi-Catalytic: a flat history of cards to objective, route ladder with join, branch table and collapsible details. Properties: four equal tiles, an Overview with three small sections and a 14-tile "Properties" tab to an identity card with structure, a categorized summary and a referenced table with definitions and evidence kinds.

## 14. TypeScript, build, lint
`tsc -b` clean; `npm run build` succeeds (existing chunk-size warning). ESLint clean on all files I changed or created. Repository-wide lint not run; the baseline engine errors in `src/utils/reactions` and `SpectroscopyPage.tsx` are unchanged.

## 15. Memory and resources
Everything sequential; one headless Chrome at a time; no memory problems. Bash heredocs of long files failed twice in this shell, so large files were written with the file tool. Temporary scripts (`_wire20*.cjs`, a route probe) were removed.

## 16. Remaining limitations
- Multi-Step alternative-routes selector never seen with real multiple routes (see section 5).
- Ordered-sequence outcomes above the branch limit are still reported by the page's existing exclusion note, not by the new panel.
- The Reactions explorer groups by reaction type only; there is no group by product identity, and the per-card hierarchy inside an opened row is the existing card (reactants/product first, then text), not redesigned.
- Properties tendencies show a level and reasoning but no numeric scale (none is exposed by the engine).
- Spectroscopy and Ranking were verified, not restructured, this stage; Spectroscopy's internal plot markup was not audited for text alternatives.
- Both Multi-Catalytic panels remain mounted (one hidden), as before; browser checks scope their selectors accordingly.
- Offline behaviour was not separately exercised (no network calls were added).

## 17. Local commits (nothing pushed)
- `d1fb444` Reactions results explorer
- `a59e7da` Multi-Catalytic objective, route ladder, branch summary, outcome selection (both modes)
- `39e29c7` Properties identity, summary and all-properties reference
- `a4b7e26` Multi-Step alternatives selector, consistency check, test updates
- the commit containing this handoff and the docs follows (see `git log`)

## 18. Final Git status
Branch `stage10-ui-overhaul`; only the five long-standing unrelated untracked files remain; the `phase1-synthesis-reliability` stash is intact.

## 19. Recommended Stage 21 scope
1. Reactions: a stronger per-card hierarchy (primary transformation first, mechanism and selectivity behind disclosures) and an optional group-by-product view.
2. Produce a real multi-route Multi-Step case (or a saved-record fixture) and verify the alternatives selector.
3. Spectroscopy: text alternatives and an assignment-first layout for peaks.
4. Extend the concept index and Continue-learning panels to the new Organic result views.
5. Offline-mode verification pass for name lookup and the new views.
