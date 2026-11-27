# Stage 29B-1B handoff: visualization, interaction and experimental pKa integration

Starting checkpoint: `0269f62` (branch `stage10-ui-overhaul`). Nothing pushed. Stage 29B-2 not started.

## 1. Clipping root cause and correction
The sticky app header (`.shell`, z-index 40, 61 px on phones, 106 px at 1280 px and above because of the second tab row) sat on top of sticky content whose `top` was a guess:
- `.pr-concept-visual` used `top: 16px` on desktop and `top: 0` when stacked, so the molecule slid under the header. Above 1280 px it was clipped by the header; below, it was fully hidden while the concept card scrolled beneath a molecule nobody could see.
- The same guess existed in four other places: `.molecule-card-compact` / `.analysis-dashboard-card`, `.acid-base-drawer-card`, `.ranking-editor-card`, `.spectroscopy-input-card` (all `top: 18px`), plus `.gc-inputs` (96 px) and `.ui-inspector` (76 px).

Fix (not a z-index change):
- `AppShell` measures the header with a `ResizeObserver` and publishes `--shell-h`; `tokens.css` defines `--sticky-top: calc(var(--shell-h) + 12px)` (61 px fallback before measurement). Every sticky offset above now uses it, as does `scroll-padding-top`.
- Concept molecule: sticky only where it fits. Above 1280 px wide and 700 px high it is pinned side by side and its SVG is bounded by `100dvh - sticky-top`; at or below 1280 px it is pinned compactly (max 240/200 px) only when the viewport is at least 760 px high, with an opaque background and a divider. On shorter viewports it flows in the document. Sticky is always bounded by `.pr-concept-split`.
- Tall editor cards become static below 760 to 820 px of height (they cannot fit under the header, so their lower controls were unreachable). The spectroscopy card's max height now accounts for the header.
- No z-index was raised; pinned content stays below the header (z-index 2 against 40).

## 2. Molecular highlighting
`getHighlightedMoleculeSvg` (shared by Hybridization, Bond Orbitals, Resonance, Functional Groups, Aromaticity bonds, Lone Pairs) now adds both endpoint atoms of every highlighted bond, read from the RDKit molecule JSON (`bondEndpointMap`). Selected bonds mark their endpoints in the selected colour; soft bonds in the soft colour. Single, double, triple and aromatic bonds all behave the same. Only the bond's own endpoints are added (test: a bond in a decane chain marks exactly two atoms). `MolecularDepiction` (Aromaticity, Counterparts, Acid/Base) uses the same endpoint rule. Highlights are drawn beneath RDKit's labels, so symbols, bond orders, wedges and charges remain readable (checked in screenshots).

## 3. Decorative punctuation
Removed separator dots in 54 component files (122 lines): identity line, status strip, aromaticity/counterpart rows, concept and result labels, Synthesis and Reactions status and selectivity strings, Saved, Spectroscopy, Multi-Catalytic, name-input messages, Badge asides on General Chemistry/Physics/Biology pages. Replaced by a comma, colon, "and", a separate flex item or a plain sentence boundary (`.pr-confidence` and `.pr-status-meta` now use spacing).
Kept on purpose: radical/hydrogen-bond notation (`O···H`), multiplication and units (`J/(mol·K)`, `R·C`, `P = V · I`, `e^(...)`, `Gαs·GTP`), and the dots in source data/utils (not decorative). Not swept: `src/utils/**` strings, which carry chemical notation (adduct and hydrate formulas); a separate review is recommended if any of those are shown as prose.

## 4. Acid/base interaction
A selected-site workspace: structure with the highlighted atom, site name, group, atom number, acid/base classification, experimental value (when assigned), representative estimate, range, pKb (bases) and the factor reasoning.
- Wide container (at least 780 px of panel width, measured with a container query): table on the left, detail pane on the right, sticky below the header with internal scroll bounded by the viewport.
- Narrow: a compact pinned head (structure and values, from 640 px viewport height) above the table, reasoning after it. Selecting a row updates all of it immediately without scrolling.
- All sites and ranks are retained; the default selection is still rank 1.

## 5. Estimated pKa presentation
The engine already had a central estimate (`estimatedPkaNumber`, `conjugateAcidPkaNumber`); it is now exposed as `SiteRow.center`. `representativePka` keeps it inside the engine's range and rounds to whole numbers for ranges at least 4 units wide, halves otherwise (so no false precision). Shown as "Estimated pKa ≈ 5, Range 3.5–5.5". Bases show "Estimated conjugate-acid pKa (pKaH)" and a derived "Estimated pKb ≈ 14 − pKaH (25 °C, water)". Scale note: aqueous-scale estimates, extrapolated outside 0 to 14, not comparable across solvents. The previous "Physicochemical tendencies · estimated, not measured" is now "Estimated physicochemical tendencies" (headings, boilerplate and the duplicate note removed).

## 6. Experimental pKa data
**Source used:** IUPAC Digitized pKa Dataset v2.4a (GitHub IUPAC/Dissociation-Constants, Zenodo 22878440). Downloaded `iupac_high-confidence_v2_4.csv`: 24,211 records, 10,703 distinct SMILES; the README says "high-confidence" (small organic molecules from Serjeant and Perrin). Inorganic compounds such as ammonia and phosphoric acid are not in it, so they correctly have no experimental value.

**Importer:** `scripts/buildPkaReferenceIndex.mjs` (deterministic; downloads into `node_modules/.cache/pka-raw/`, records the CSV SHA-256). Canonicalises each SMILES with the project's local RDKit (`pkaKeys`, shared with the runtime), keeps only `pKa{n}`, `pKaH{n}`, `pKb{n}` types with numeric values and without `*`/R atoms, and writes `public/data/pka-reference.index.json`.
Output of the run: see "Results" below. Skipped: excited-state, isomer-labelled and other non-standard types (counted in the importer output), 194 non-numeric values, unparsable structures.

**Runtime:** `src/utils/pkaReference.ts`; the index is fetched lazily by `AcidBasePanel` (never imported into the bundle) and every caller works when it is absent. Works offline once the file is present.

## 7. Licenses and attribution
- IUPAC dataset: CC BY-NC 4.0, "Reproduced by permission of the International Union of Pure and Applied Chemistry" (README and Zenodo metadata, verified). **Non-commercial.** The compact index is a derivative; it is therefore git-ignored (`.gitignore`) and not committed. Regenerate with `node scripts/buildPkaReferenceIndex.mjs`.
- A production build copies `public/` into `dist/`, so a build made while the index exists ships it. **Delete `public/data/pka-reference.index.json` before any commercial build**; the interface then silently falls back to model estimates. Attribution (name, version, CC BY-NC 4.0, permission statement, DOI link) is shown under the Acid/Base panel whenever the data are used; the full citation lives in the index `source` block.
- **pKahub was not integrated.** Its MIT license covers only the application code; its README states the datasets are subject to their original sources' terms. The distributed database is a 96 MB SQLite file merging several public sources with mixed licenses, so redistribution terms are not established. An importer for it would need a per-source license audit first.
- Decision recorded: no restricted data is committed, and no experimental value is hard-coded anywhere in source or tests (tests read the index and check textbook windows).

## 8. Matching and site assignment
Matching is by canonical structure, never by name (`matchReference`):
1. Generic structures (`*`, R groups) never match.
2. Exact canonical isomeric SMILES. Charge state, protonation state, tautomer, salts/mixtures and stereochemistry are all part of the key, so zwitterions, anions, salts and different tautomers do not match the neutral record.
3. One relaxation: a reference record without stereochemistry applies to a query with exactly one tetrahedral centre and no double-bond stereo (enantiomers have identical acid-base constants in an achiral medium). With two or more stereocentres there is no match.
4. A query without stereochemistry never inherits a stereo-specific record, and the D enantiomer of a stereo-specific L record is not matched.

Aggregation (`summarizeConstants`): per dissociation step, use only plain-water records (no cosolvent, no pressure) within 5 °C of 25 °C, taking the temperature closest to 25 °C and the best assessment tier present (Reliable, then Approximate, then Uncertain). Values within 0.5 pK units are summarised by their median (shown with count and tier); wider disagreement is reported as a range with no single value (lysine's pKaH1 is shown as 8.95 to 9.53). Nothing incompatible is averaged and the raw records stay in the index.

Macroscopic versus microscopic: dataset steps are relative to the neutral structure: `pKaH{n}` are protonation steps (conjugate acids), `pKa{n}` are deprotonation steps, `pKb{n}` are base dissociation. They are shown separately and never merged. A constant is assigned to an atom only if the model finds exactly one site of that behaviour whose estimate reaches the aqueous window (-2 to 16), the reference has exactly one single-valued constant of the matching kind in that window, and it lies within 4 pK units of the model estimate. Otherwise it appears under "Molecular reference pKa" and the sites keep their model estimates. Acetic acid and methylamine are site-assigned; glycine and other polyprotic or multi-site molecules show molecular reference values only. pKb is never site-assigned.

Limitations: the dataset is aqueous and mostly 25 °C, so there are no non-aqueous scales; coverage is about 10.5 thousand structures; ionic-strength and method differences are not modelled; an oxoacid or amino acid drawn as a zwitterion or salt finds no record (by design); site assignment is deliberately conservative, so many multi-site molecules show only molecular reference values; step numbering follows the source (for example glutamic acid lists pKa1 4.19 and pKa2 9.76 beside pKaH1 2.12) and is displayed as given.

Importer run: 24,211 rows; 23,435 kept; 188 non-numeric and 588 non-standard types skipped; 0 unparsable; 10,492 molecules; index 1.3 MB (uncompressed JSON, lazily fetched). The README's 188 vs my earlier 194 count differs because 6 non-numeric rows also had non-standard types.

## 9. Discretionary improvements
- Other sticky cards with the same hard-coded offset (Ranking, Spectroscopy, Acid/Base drawer, General Chemistry inputs, inspector) now use the measured header height.
- Short-viewport rule: tall sticky editor cards flow normally.
- Table caption on Acid/Base made an accessible hidden caption (it collapsed into a narrow column on phones, found in screenshots).
- Redundant section note under All Properties tendencies removed; "Aqueous-scale estimates" note replaces two sentences.
- Identity line items are separate spans instead of dot-joined text.

## 10. Scientific tests
`scripts/tests/pka29b1b.test.mjs`, 15/15: matching policy (generic, salt, anion, zwitterion, unspecified or opposite stereo, one versus two stereocentres), aggregation (cosolvent, temperature, tier, disagreement is a range, unknown types ignored), real-data windows for acetic, formic, benzoic, phenol, methylamine, ethylamine, aniline, pyridine, oxalic and citric (ordered steps), glycine/alanine/lysine (separate pKa and pKaH, lysine conflict as a range), unsupported cases (ammonia, generic, zwitterion, salt), site assignment (acetic and methylamine assigned; ambiguity, multiple constants, far-off values and pKb not assigned), estimate rounding and pKb relation, endpoint highlighting (including exactly two atoms in a chain), static checks for sticky offsets, punctuation, optional-index loading. Index-dependent tests skip if the index is absent.
Regressions all passing (counts as before plus): moleculeInput 38, resolver 6, identity29b 11, acidBasePresentation29b 2, propertiesSections20 11, analysisLibrary* 35/25/28, persistence 39, persistenceRankingSpectroscopy 27, aromaticity29b 19, counterparts29b 12, nomenclature9f 48, ranking9f 5, ranking9g 9, conformationsRanking10b 30, stereoIdentity29b1a 15 (two assertions updated for the new heading and note), generalChemAcidBase11 64, multicatalyticPersistence 30, atomic28 64, bonding28 40, biologySignaling23 46, generalChemStoich22 58.
`tsc -b` clean; `npm run build` succeeds (chunk-size warning only). ESLint on changed files: only pre-existing errors (MoleculeDrawer:224, SpectroscopyPage 1465/1569/1597/1671, identical at HEAD). Unrestricted `npm test` not run.

## 11. Browser verification
`scripts/browser/stage29b1bLiveCheck.mjs`: 94/94 on the production build at 1920x1080 (light), 1440x900 (dark), 1280x720 (light), 820x1000 (dark), 375x812 (light). Real pointer clicks; concept molecule checked at six scroll offsets per viewport (not clipped by the header, inside its container, not covering the card when side by side); each of the first three acid/base sites selected with the structure and values visible immediately; acetic acid experimental 4.7x with estimate and range; glycine molecular reference only; ethylamine pKaH and pKb; no-reference molecule; save still works. Screenshots were also inspected by eye (this found the mobile caption defect). Screenshots: `node_modules/.cache/stage29b-1b/` (`explorer .\node_modules\.cache\stage29b-1b`).

## 12. Remaining limitations
- Dark-theme coverage of the concept scroll checks is at 1440 and 820 only; light elsewhere.
- Non-aqueous pKa scales are not modelled; reference data is aqueous only.
- Site assignment is conservative by design.
- `src/utils/**` prose strings were not swept for decorative dots.
- Saved Analyses are unchanged in format (persistence suites pass); experimental data is recomputed on open, never saved.
- The index must be rebuilt locally (`node scripts/buildPkaReferenceIndex.mjs`) on a fresh clone; without it the app shows model estimates only.

## 13. Commits (local, not pushed)
- `fefa46e` feat(highlight): highlight both endpoint atoms of every highlighted bond
- `eb9906b` fix(layout): offset sticky content from the measured header height
- `c592590` feat(acid-base): selected-site workspace, estimated pKa and optional IUPAC experimental reference
- `4dbbecd` style: remove decorative bullet-like separators; compact tendencies heading
- `b7a2af7` test(29b-1b): pKa reference tests, live check and handoff
- Final: `.gitignore` repair (the pKa entry had been appended to the ChEBI line; both entries now work), see `git log`.

## 14. Final Git status
Untracked only: the pre-existing files (`CLAUDE.md`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`). `public/data/pka-reference.index.json` exists locally and is git-ignored. The `phase1-synthesis-reliability` stash is intact.
