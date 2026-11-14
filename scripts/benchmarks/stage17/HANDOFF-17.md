# Stage 17 handoff — Biochemistry

## 1. Recovered implementation
Interrupted session had already produced and committed (not lost): engines (`src/utils/biochem/{aminoAcids,ionization,peptide,protein,enzyme,aaStructure,learning}.ts`), persisted pages and registry, three tool UIs (`src/components/biochem/*`), Translation→peptide hand-off, subject docs, tests and a live-browser check. Recovery found only three small uncommitted UI/check-script edits, which are now committed.

## 2. Scientific engines
Amino acids (20, RDKit-verified structures/stereo), ionization (Henderson–Hasselbalch, pI), peptide (formula/mass/connectivity), protein structure (helix/sheet H-bond counts, Ramachandran regions, mutation scenarios), enzyme kinetics. Focused tests: `biochemData17`, `biochemModels17`, `biochemPlatform17`, new `biochemInhibition17`.

## 3–5. Interfaces
Amino Acids & Peptides (20-residue inspection, comparison, ionization/titration chart with draggable pH, peptide builder with bond highlighting); Protein Structure & Folding (four levels, helix/sheet, Ramachandran, forces, disulfides, mutations); Enzyme Laboratory (kinetics MM + Lineweaver–Burk, species bars, binding models, six-step catalytic mechanism, energy diagram).

## 6. Scientific corrections
- The suspected uncompetitive/noncompetitive confusion was investigated in the code, not just the comment. The implementation is **correct**: `alphas()` gives competitive (α>1, α′=1), uncompetitive (α=1, α′>1), pure noncompetitive (α=α′ from single Ki), mixed (independent α, α′). The "α = α′" text in enzyme.ts is attached to noncompetitive, not uncompetitive. No change to the model was needed.
- Added `scripts/tests/biochemInhibition17.test.mjs`: hand-derived α, α′, Vmax,app, Km,app and v for every model (7 tests) plus classification signatures.
- Live-check expectations were realigned to the actual default inputs ([I]=5, Ki=2, Ki′=4); small diagram label-width/duplicate-text fixes (EnzymeDiagrams, ProteinsPage label capitalisation).

## 7. Learning modes
Explore / Practice / Challenge in each module, driven by the shared learning-question engine; Challenge uses predict-then-reveal on live model state.

## 8–9. Integration and persistence
Biochemistry is active in the five-subject nav; reuses Biology learning components, RDKit rendering, General Chemistry graphs, themes. Pages autosave and restore via Saved Analyses with strict validators (verified by reload in the browser).

## 10. Test and browser results
- `node --test --test-concurrency=1 scripts/tests/biochem*17.test.mjs`: 56/56 pass.
- `node scripts/browser/stage17LiveCheck.mjs`: 90/90 checks, no page exceptions (desktop 1440, tablet 820, mobile 375, light and dark).
- Not run: the full repository test suite (memory constraint); screenshots were written to `node_modules/.cache/pc-live17` but responsive checks were programmatic (no overflow, diagram visible), not human visual review.

## 11. Build and lint
`tsc -b` clean; `npm run build` succeeds (existing >500 kB chunk warning only); eslint on `src/components/biochem` and `src/utils/biochem` clean. Offline behaviour: no new runtime network dependencies; local RDKit used.

## 12. Limitations
Ideal steady-state Michaelis–Menten kinetics only (no tight-binding, irreversible, slow-binding or substrate inhibition). Ionization uses curated approximate pKa values with no microstate or ionic-strength effects. Protein diagrams are schematic/qualitative; no folding prediction. Mutation notes are curated examples, not predictions.

## 13. Commits
233ec32 engines · 453962b model tests · 50d4327 platform/persistence/learning · c00bb23 tools UI + hand-off + docs · bb1ecde platform tests + live check · plus the Stage 17 finalisation commit (inhibition regression tests, UI polish, this handoff).

## 14. Final Git status
Unrelated untracked files left alone: CLAUDE.md, stage5-changes.patch, stage5-status.txt, scripts/benchmarks/stage9m/rd-probe.mjs, scripts/tests/.probe-names.mjs. Nothing pushed.

## 15. Stage 18 recommendations
Add mixed-inhibition Ki/Ki′ estimation from Lineweaver–Burk data entry; allosteric/cooperative (Hill) kinetics; metabolism/glycolysis pathway tool linking enzyme module; human visual review of the screenshots; wire biochem tests into a CI-sized subset.
