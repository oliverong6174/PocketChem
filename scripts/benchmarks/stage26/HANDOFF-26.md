# Stage 26 handoff — Organelles & protein trafficking, Cell cycle & checkpoints, Apoptosis & autophagy

Branch `stage10-ui-overhaul`. Nothing was pushed. Stage 27 was not started.

## 1. Starting Git checkpoint
HEAD `75e12bf` (Stage 25 final), branch `stage10-ui-overhaul`. Untracked and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`,
`scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. `stash@{0}` (phase1-synthesis-reliability) was never touched. Explicit-file staging throughout. Unrestricted `npm test` was not run.

## 2. Organelle laboratory
`bioOrganelles` (`#/biology/organelles-trafficking`, group `cellOrg` "Cell organization & regulation"). `CellMap26` is a schematic animal cell drawn on the same layout coordinates as the transport graph:
plasma membrane, cytosol, nucleus, envelope, pores, rough/smooth ER, Golgi (cis/medial/trans), mitochondrion, lysosome, endosomes, peroxisome, ribosomes, microtubules. 14 organelles selectable (map or list); the
processes through an organelle are **derived from the cargo routes** (e.g. Golgi → secreted, membrane, lysosomal; peroxisome → none, stated). Geometry is labelled schematic, not measured.

## 3. Protein localization
Six curated cargo classes (cytosolic, secreted, integral membrane, lysosomal hydrolase, nuclear, mitochondrial matrix), each with translation site, signal, recognition machinery, route, destination, per-step processing state and direction.
No prediction for arbitrary sequences. Routes are validated against the transport graph (`validateRoutes`: unknown transitions, missing transition ids, wrong destination all rejected; a corrupted route is tested).

## 4. Vesicular trafficking
COPII, COPI, clathrin/AP-2 and clathrin/AP-1 routes with the six distinct stages (selection, budding, transport, tethering, docking, fusion), Rab and SNARE roles, and a per-route caveat that a coat does not fix a cargo's final destination.

## 5. Protein quality control
A regulatory graph: folding/chaperones, ER retention, ERAD (retrotranslocation), proteasome, lysosomal route; proteasomal and lysosomal degradation are distinct. Qualitative states only; accumulation is stated to trigger an unmodelled stress response.
Endosome/lysosome section: transferrin (recycled), LDL (receptor recycles, ligand degraded), EGF–EGFR (context-dependent), IgA (transcytosis, undegraded), V-ATPase and M6P perturbations, M6P sorting as a curated example.

## 6. Cell-cycle regulation
`bioCellCycle`. Circular diagram (G0, G1, S, G2, M with verdict markers), cyclin–CDK four-condition model (cyclin alone does not decide activity), G1/S (mitogen → cyclin D–CDK4/6 → RB/E2F → cyclin E–CDK2, restriction point as a user-set condition), G2/M (Wee1/Cdc25/CDK1).
Each transition is "proceeds", "pauses" or "unresolved" (permitted although a checkpoint signal is present); the components that decide it are listed from the graph. Phase-contradictory conditions are disabled with the reason and rejected on restore.

## 7. Replication licensing
ORC/Cdc6/Cdt1/MCM licensing versus firing (CDK + DDK), phases mitotic exit/G1/S/G2/M, three brakes on re-licensing (geminin, Cdt1 destruction, CDK phosphorylation of Cdc6/ORC). One or two brakes lost is still "blocked" and flagged as uncertain (real cells can show re-replication); all three lost shows the re-licensing hazard.

## 8. DNA-damage checkpoint
ATM–CHK2 (double-strand breaks), ATR–CHK1 (stalled forks/unreplicated DNA), p53 → p21, Cdc25 inhibition. p53 loss alone does **not** release G1/S in the model (the CHK–Cdc25 arm still holds) and no malignancy is claimed; only p53 + ATM + CHK1 defects together give "unresolved". Repair/senescence/apoptosis are stated as not determined.

## 9. Spindle assembly checkpoint
Kinetochore attachment → MAD/BUB → MCC → APC/C–Cdc20 (also needs CDK1) → securin → separase → cohesin → anaphase. Invariant tested across every one- and two-perturbation set: **whenever the checkpoint signal is ON, anaphase never occurs**. The single yes/no for attachment/tension is stated as a simplification.

## 10. Intrinsic apoptosis
Stepwise mitochondrial diagram (8 selectable events): stress/BH3-only (PUMA/NOXA need p53; BIM for growth-factor loss/ER stress), BCL-2 excess neutralises, BAX/BAK redundancy (one suffices, both lost blocks), MOMP (explicitly not "any membrane-potential change"), cytochrome c, APAF1 apoptosome, caspase-9, caspase-3/7. MOMP without caspases is flagged as possibly caspase-independent, not as survival or death.

## 11. Extrinsic apoptosis
Fas → FADD → DISC → caspase-8 (c-FLIP blocks), direct caspase-3/7 in type I cells, BID → tBID → mitochondria required in type II cells (BCL-2 excess blocks type II only). Other death receptors are stated to differ.

## 12. Autophagy and lysosomal recycling
Separate macroautophagy graph (mTORC1/AMPK → ULK1 → Beclin 1–VPS34 → LC3 lipidation → cargo → autophagosome → fusion → degradation → recycling). Fusion defects leave autophagosomes accumulating; V-ATPase inhibition stops degradation after fusion. The graph has no caspase/MOMP node (tested) and the page says it is not apoptosis and does not by itself cause death. Fate map: six stressors, 14 nodes, every link labelled established or context-dependent, every scenario states no survival probability/clinical/cancer/treatment prediction.

## 13. Shared mechanism infrastructure
`utils/biology/mechanism26.ts` only: `RegGraph` (all/any/not, validated for duplicates, unknown references, cycles, input-with-rule), perturbations that force a node, clash/limit validation, `rootCauses`, `exprText`. Diagram arrows come from the rules (`graphEdges`); `layout26.ts` is a pure layered layout. No general whole-cell engine, no new dependencies. `GraphDiagram` gained an optional bar-headed "inhibits" arrow (backward compatible).

## 14. Interactive diagrams and learning modes
Explore (inspect, step, perturb), Practice (questions computed from the engines, including all nine questions the milestone names), Challenge (predict first, reveal applies the state). Step player on the tracker, intrinsic, extrinsic and autophagy views. Wide diagrams scroll inside their frame at full text size on phones.

## 15. Cross-subject connections
17 typed relations, all marked conceptual with a caution: Translation → Protein targeting; Protein folding → ER quality control; Membrane transport → Endocytosis; Cell signaling → G1/S control and → Apoptosis regulation; DNA replication → Replication licensing; Mitosis → Spindle checkpoint; Electron transport/Metabolism → Intrinsic apoptosis; Organelles → Autophagy (and reverses). 19 new concepts in global search. No values are handed off. Four older pages (Replication, Mitosis, Protein structure, Electron transport) did not render related learning at all, so the panel was added (limit 5) — found by the browser check, not by the unit tests.

## 16. Navigation and persistence
Three tools registered; Biology overview, subject registry (tagline, "Cell structure explorer" removed from planned), Saved Analyses labels and openers. Strict versioned records (`biologyTools26.ts`): selected tool section, organelle/cargo, step (must lie inside the possibly truncated route), perturbations, checkpoint conditions, stimuli, selections, learning mode. Derived outcomes rebuilt on open; contradictions rejected (tested). Other subjects' records coexist (tested).

## 17. Scientific assumptions and references
Provenance in `provenance26.ts`, shown on each page. **Verified** (OpenStax Biology 2e pages 4.3, 10.3 opened and read): double-membrane nuclear envelope; membrane-bound organelles; cyclins/CDKs as positive regulators; RB–E2F; p53/p21 and apoptosis when damage is unrepairable; G2 checkpoint; spindle checkpoint (attachment before anaphase).
**Not independently checked** (12 claim groups, written from standard textbook knowledge, stated as such): SRP/Sec61, COPII/COPI/Rab/SNARE, M6P sorting, nuclear and mitochondrial import, endosome pH values, ERAD, licensing, ATM/ATR/Wee1/Cdc25/CKI details, MCC/APC/C/separase, BCL-2/BAX/BAK/APAF1, Fas/DISC/BID/c-FLIP, autophagy proteins and the context-dependent fate-map links. No quotations or page numbers. Stage 25's ten biochemical claims remain "not independently checked"; nothing was relabelled.

## 18. Unsupported biological conclusions (stated in the UI)
Localisation of arbitrary sequences; trafficking rates or kinetics; clinical phenotypes of any perturbation; the fate of a stalled or mislocalised protein; cell-cycle durations or CDK activities; cancer or malignancy from p53/RB loss; the fate (repair, senescence, apoptosis) after a checkpoint is bypassed; irreversibility of caspase activation; whether autophagy protects or kills; other death receptors, necroptosis, pyroptosis, ferroptosis; mitochondrial protein classes other than presequence matrix proteins; peroxisomal import; survival probabilities, treatment responses.

## 19. Scientific test results (hand-typed biological expectations)
New: `biologyTrafficking26` **45/45**, `biologyCycle26` **41/41**, `biologyDeath26` **39/39**, `biologyPlatform26` **27/27** (152 tests). Combined sequential run of all `biology*`, `biochem*`, `analysisLibrary*`, `concept*`, `generalChemPlatform11/12`, `physicsPlatform14`: **969/969** after updating stale registry expectations
(Biology tool lists/groups, saved-page maps, tool-group list). Two of those suites (`generalChemPlatform11/12`) and `biologyPlatform23` were already stale from Stage 25 (biochemistry tool/page lists) and were corrected too. The full `npm test` was not run.

## 20. Browser verification and visual inspection
`scripts/browser/stage26LiveCheck.mjs` (headless Chrome, production build, one session, run sequentially with no build overlap): **192/192** on the final build; 60 screenshots in `node_modules/.cache/pc-live26`. Covers all 27 items of the brief (navigation, organelle selection, each cargo route and perturbation, vesicle/endosome/QC, every cell-cycle module, intrinsic/extrinsic/caspase/autophagy, fate map, Explore/Practice/Challenge, save/reopen/autosave, search, links, light/dark × 1440/820/375).
**Defects found by looking (not by assertions) and fixed:** cytosol→ER arrow running through the smooth-ER label; clipped "Plasma membrane" label; COPII label under an arrow; cycle-ring checkpoint labels colliding with arcs and the re-entry arrow; clipped vesicle/endosome box text (own `slice` truncation); clipped text in the mitochondrial boxes; MOMP box not tied to the membrane and hiding the mitochondrion title; legend run together; fate-map arrows crossing boxes; long regulatory arrows running behind unrelated boxes (inputs with one consumer now sit next to it; arrows that skip a row run along the gutter). Four first-run failures were my own script errors (card count, organelle name location, two regexes); four were real (related-learning panels missing, see 15).
Not visually inspected: every diagram in every theme/width (about 20 of 60 captures were opened; 375 px dark/light samples for two pages); 820 px captures were overflow-checked only; the cell map at 375 px shows a horizontal scroll by design and was not legibility-tested on a real device.

## 21. Stage 18 regression status
The three stale assertions (check 22: exact tab lists of Physics, General Chemistry, Biology) were replaced by "the Stage 18-era tools are all still present in the same order, Overview first, Saved last" (behavioural intent kept). `stage18LiveCheck.mjs`: **108/108** (was 105/108).
Other regressions run: Stage 23 **152/152**; Stage 16 **120/124** and Stage 15 **57/60** — all failures are exact-list assertions that predate Stage 26 (Biology tab list and "7 working tools", Physics and General Chemistry tab lists, stale since Stages 21–23). They were not edited (outside the authorised Stage 18 fix) and are listed as known stale.

## 22. TypeScript, build and lint
`npx tsc -b` clean; `npm run build` succeeds (existing >500 kB chunk warning only); ESLint clean on all changed and new files (repository-wide lint not run).

## 23. Resource and performance observations
All test runs and browsers were sequential; one headless Chrome at a time; builds never overlapped a browser. `tsc -b` 41 s warm; build 5–45 s; Stage 26 browser check about 13 minutes. No task-owned processes left running.

## 24. Known defects and limitations
- Only part of the screenshots were inspected (section 20). Cell map and regulatory diagrams are dense on phones and scroll sideways by design.
- Mitochondrial diagram uses a rectangle band for the mitochondrion, not an organelle drawing.
- Fate-map arrows still cross in places (stressor → intrinsic/autophagy); readable at desktop width.
- The restriction point, ER/Golgi cisternal-maturation mechanism and several tissue/cell-type distinctions are coarse curated statements.
- Provenance: most mechanisms are unverified (section 17); Stage 25 gaps unchanged. The href composition in the provenance panel was changed after the last browser run (trivial; unit-tested for shape).
- Four-condition CDK model and the licensing brakes are qualitative; no kinetics.
- Stage 15/16 live checks have stale exact-list assertions (section 21).

## 25. Local commits (not pushed)
- `4f235ed` shared mechanism graph and organelle/trafficking model with tests
- `b8e0a9a` cell-cycle, checkpoint, CDK and licensing model with tests
- `3f825bb` apoptosis, autophagy and fate-map model with tests
- `17123ac` interactive laboratories, learning, summaries, persistence modules
- `5e7138a` navigation, Saved Analyses, concept search, relations, platform tests and registry updates
- the commit(s) containing this file (see `git log -2`): visual fixes, provenance, related-learning panels, Stage 26 browser check, Stage 18 assertion fix, docs and handoff

## 26. Final Git status
Only the five long-standing untracked files remain; `stash@{0}` is preserved.

## 27. Recommended Stage 27 scope
1. Open the primary sources for the 12 unchecked claim groups (and Stage 25's ten) and upgrade provenance statuses.
2. A phone-first vertical layout for the cell map and the larger regulatory diagrams; a full visual pass over all themes/widths.
3. Refresh the Stage 15/16 live checks' exact-list assertions (same fix as Stage 18) and add a single-process browser runner.
4. Extensions that fit the same graph model: peroxisomal import, necroptosis as a contrasting regulated death, mitophagy (PINK1–Parkin), or the unfolded protein response as its own graph.
