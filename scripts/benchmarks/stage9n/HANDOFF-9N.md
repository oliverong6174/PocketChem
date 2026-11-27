# Stage 9N handoff — Conformations (chair, Newman, sawhorse)

Branch `stage9l-scientific-correctness`. Local commits only; nothing pushed.

## Commits
| Hash | Content |
|---|---|
| 82d6006 | Core engines: graph, chair, torsion/energy, substituents, geometry + 70 core tests (made before the interrupted session) |
| e263a72 | Learning guide, conformations workspace persistence, substituent labels, Saved-Analyses registration |
| 0c279bc | `ConformationsPage`, SVG views, App navigation, Saved page label, CSS |
| 7acc16b | Workspace/persistence tests, live browser check, updated page-inventory assertions |
| (this file's commit) | Handoff |

## Implemented capabilities
- **Input**: Ketcher editor (own instance, `globalKey="conformationsKetcher"`), name/SMILES field of the drawer, a SMILES field, example buttons, and "Use the Properties molecule" (hand-off from the Properties page's SMILES/molfile). All paths build one shared `ConformationGraph`; SMILES stereo is used exactly as written.
- **Chair**: eligible cyclohexane rings are picked from a structure map; Chair A/B drawn from a 3D model; axial/equatorial are measured, not asserted; flip toggles shared `chair.flipped`; hydrogens, 1,3-diaxial contacts and atom numbers are toggles. Unspecified ring stereo is never guessed: the user chooses up/down per atom. Aromatic, unsaturated, heteroatom, fused, bridged and spiro rings are refused with a reason.
- **Newman / sawhorse**: one `rotation` and one bond selection drive both views (each shows the other as a companion). Drag on the Newman circle, drag on the energy graph, slider, ±60°, snap to staggered/eclipsed, view from the other end, click a substituent to make it the dihedral reference. Conversion is `newmanToSawhorse` / `sawhorseToNewman`, tested round-trip.
- **Stability**: chair preference from additive A-values; torsional strain from textbook increments; qualitative text when no parameters exist.
- **Energy visualisation**: strain-vs-dihedral curve with labelled minima/maxima and a live cursor; no curve is drawn when the model has no parameters.
- **Learning**: collapsible explanations and practice mode, both computed from the live model; practice hides names, energies and A/E colouring.
- **Persistence**: `conformations` page in the workspace store and Saved Analyses (validators, engine version 1, restore after reload, open from Saved with replace prompt, engine-mismatch notice, "live model differs" notice).

## Visualisation architecture
`src/utils/conformations/{graph,geometry,chair,torsion,substituents,guide}.ts` are pure and DOM-free. `src/components/conformations/views.tsx` holds the SVG drawings (`ChairDrawing`, `NewmanDrawing`, `SawhorseDrawing`, `EnergyGraph`, `StructureMap`); `ConformationsPage.tsx` owns a single `ConformationsWorkspaceInputs` state (source, mode, chair, torsion) with undo history. Every control mutates that state; every view and the saved summary are derived from it. Styles: `.conf-*` block at the end of `src/App.css`.

## Stability-model assumptions
- Chair: ΔE = Σ A-values of axial groups in each chair (documented table, shown in the page; groups without an A-value are reported as unassessed, never borrowed). tert-Butyl and similar are lower bounds. Substituent–substituent interactions, polar and solvent effects, twist-boat/half-chair and the interconversion barrier are not modelled. The population percentage shown is arithmetic from the gap, labelled as not a measurement.
- Torsion: per eclipsed pair increments (H/H 4.0, H/CH3 6.0, CH3/CH3 11 kJ/mol) with a smooth torsional term, plus a gauche CH3/CH3 term; reproduces textbook ethane 12, propane 14, butane 3.8/16/19 kJ/mol. Only H and CH3 substituents are parameterised; any other group gives qualitative text only. Values are a teaching model, not a force field or QM result.

## Ketcher integration status
Own editor instance on this page; "Analyse drawn structure" reads the editor's molfile/SMILES (drawing coordinates retained when from the editor); the Enter key in the name field loads the structure via the same path. The cross-frame protocol, origin validation and the other pages' editors are untouched. Live check confirmed `setMolecule` then "Analyse drawn structure" yields the drawn molecule (isopentane). Not tested: wedge-bond stereo drawn by hand in Ketcher on this page (stereo from SMILES is tested; the molfile path is covered by core tests).

## Test results
- `scripts/tests/conformations*.test.mjs`: 80/80 pass (chair 3D vs RDKit, torsion vs independent formula, workspace/persistence/guide).
- Affected existing suites (analysisLibrary*, persistence*, multicatalyticPersistence, reactionWorkspace, uiPolish): all pass. Five page-inventory assertions (pages that use persistence / openable pages) were updated deliberately to include `conformations`.
- `tsc -b`: clean. `vite build`: succeeds (existing chunk-size warning). ESLint on all Stage 9N and touched files: clean. Repo-wide `npm run lint` still reports pre-existing `no-useless-assignment` errors in reactions/stereochemistry engine files (not touched here).
- Live browser (`node scripts/browser/stage9nLiveCheck.mjs`, headless Chrome + production build): 35/35 checks — navigation, chair A/B and flip (trans-1,4: 0 axial → 2 axial → back), cis-1,3, unspecified stereo prompt, benzene refusal, Newman/sawhorse sharing rotation, 180°/0°/60° classifications, no invented energy for Br, practice mode, reload restore, save → Saved → open, Ketcher hand-off, no page exceptions. Screenshots inspected by eye.
- **Not rerun**: the full `npm test` suite (chemistry engines untouched). The earlier full run's two known search-deadline failures are therefore neither confirmed nor refuted in this session; they are unrelated to Stage 9N files.
- Offline: no network calls added; the page uses only local RDKit/Ketcher assets. Offline mode was not separately exercised.

## Bugs found and fixed while finishing
- Dihedral readout was a placeholder that always rendered empty; now shows the measured angle between the reference groups.
- No `.conf-*` CSS existed; added.
- `useDrawnStructure` was a plain function named like a hook (lint error); renamed `analyseDrawnStructure`.
- Chair-flip note read "it is no groups that are axial"; reworded.

## Known scientific limitations
See assumptions above. Additionally: only six-membered carbocyclic chairs; Newman only for sp3–sp3 acyclic single bonds (sp2 ends flagged); no ring-flip barrier, boat/twist forms, gauche/syn-pentane among larger groups, hydrogen bonding, or solvent. Heuristic outputs are not experimentally validated. A-value table is recalled from the literature (Eliel & Wilen; Jensen & Bushweller; Hirsch), not re-read in this build.

## Remaining issues
- Energy-graph feature labels can overlap the y-axis tick near 0°/360° (cosmetic).
- Phone-width layout has CSS breakpoints but was not browser-tested at narrow widths.
- Newman drag uses pointer events; only synthetic slider/button interaction was exercised in the headless check, not real pointer drags.
- Untracked, intentionally untouched: `CLAUDE.md`, `stage5-*`, `scripts/browser/stage9fLiveCheck.mjs`, `scripts/benchmarks/stage9m/rd-probe.mjs`.

## Requirements for Stage 10 (UI/UX redesign)
- Keep the shared-state contract: one workspace state object drives every view and the saved summary; no view-local copies of rotation, flip or bond.
- Preserve a11y semantics already present (tablist, slider with aria-valuetext, live readouts, role=status verdicts) and add keyboard rotation for the Newman circle.
- Keep the honesty text: model labels, "not a calculation", unassessed/never-guessed states, practice-mode hiding.
- Move `.conf-*` styles out of the monolithic `App.css` if the redesign introduces a styling system; the colour roles (axial pink, equatorial blue, diaxial amber, selection yellow) should keep a legend.
- Test at phone width and with real pointer drags; re-run `stage9nLiveCheck.mjs` and the `conformations*` tests as the regression gate.
