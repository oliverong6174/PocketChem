# Stage 29B-1A handoff — Properties humanization, concept layout, stereochemical identity

Starting checkpoint: `1b9fa36`. Nothing pushed. Stage 29B-2 not started.

## Redundant interface elements removed
- Acid/Base "Detailed reasoning" disclosure and its repeated "model estimates" note. The per-site factor rows (Atom, Resonance, Induction, Orbital, plus engine factors such as aromaticity; up to five) now carry the single explanation. Confidence appears once, in the table. The "drawing indices start at 0" caption was dropped. The reasoning engine is unchanged.
- Identity provenance, "Loaded as", identity confidence and recognized-names lists. The header now shows only the structure-derived name when it differs from the loaded name, plus the ChEBI id (attribution kept).
- "How this name was decided, and its limits" and "Calculation notes and limitations".
- Calculated/Estimate/Detected badges and the "Kind" column. Only tendencies state "estimated, not measured".
- Kept as short notices beside the affected result: generic structure (no MW/exact mass/DBE), stereochemistry unspecified, estimated pKa ranges, unavailable properties, antiaromatic planar-singlet assumption.

## Concept layout
Concepts now uses a split container (`.pr-concept-split`): the highlighted molecule (sticky) beside the selected-concept card at widths above 1280 px; below that the molecule is pinned (compact, max 240/200 px high) above the card. Concept selectors are a compact 4-column grid (2 on phones). Carousel arrows are slimmer. Verified: at 1920, 1440, 1280, 820 and 375 px the molecule and card are visible together without scrolling, and changing concept changes the highlighting.

## Bond Orbitals
The card used to show "Sigma overlap", "Orbital info" and an explanation ending "Sigma component …". Now: bond title, one `σ bond` line (e.g. Csp–Csp overlap), a `π bond` line only for double/triple/aromatic, and one geometry sentence (rotation / linearity). No additional orbital detail was invented.

## Root cause: amino-acid chirality
Not a wedge-dash or Ketcher defect. Tracing name → database → Ketcher → RDKit → chirality → UI:
1. `leucine`/`lysine` resolve to the ChEBI generic entries (CHEBI:25017 and the lysine equivalent), whose SMILES carry no stereo. Their stereocenter is genuinely unspecified; that was correct but was presented as "possible chiral center".
2. `L-leucine`, `D-leucine`, `L-lysine`, `L-alanine`… failed outright ("not found"). ChEBI preferred names carry inline markup (`<small>L</small>-leucine`, 27,087 records), so the preferred-name tie-break never matched, and the "residue" entries (e.g. CHEBI:30006 `*N[C@@H](CC(C)C)C(*)=O`) borrow the free amino acid's synonym, making `L-leucine` ambiguous.
3. The database does hold specific L (CHEBI:15603) and D (CHEBI:28225) leucine with isomeric SMILES; Ketcher import/export, RDKit and `analyzeChirality` preserve them (live check: wedge bond in the molfile, `@` in the SMILES, S assigned).

Fix: `normalizeChemicalName` strips ChEBI markup; generic (`*`) records are dropped when a concrete record shares the alias; ambiguous aliases now return their candidates. For an unqualified name whose structure has unspecified stereo, the Properties identity says so and offers L/D variants found by exact name in the same database (connectivity match, no silent L).

## Root cause: glucose
Same markup/ambiguity problem plus a data fact: ChEBI has no plain `L-glucose` alias at all, and `glucose`/`D-glucose` are shared by D-glucopyranose (CHEBI:4167) and aldehydo-D-glucose (CHEBI:42758), so the unique-match rule rejected them (invalid). α/β anomer records exist but their aliases carried markup. Now: `glucose`, `D-glucose`, `L-glucose` (and bare fructose, galactose, mannose, ribose, D-ribose) never load silently; a compact variant selector lists only forms present in the database (open chain, pyranose, furanose, α/β, D/L). Fully qualified names (alpha-D-glucopyranose, aldehydo-D-glucose, …) resolve directly. `deoxyribose` / `2-deoxy-D-ribose` still resolve to CHEBI:28816. Previous silent behaviour such as `fructose` → β-D-fructofuranose is replaced by the selector.

## Supported identities
- Amino acids by name: any with a concrete L/D record (tested: Gly, L/D-Ala, L-Val, L/D-Leu, L/D-Lys, L-Cys, L-Thr, L-Ile). Unspecified leucine/lysine/alanine offer L and D.
- Chirality status: assigned R/S; potential stereocenter with unspecified configuration (shown as "N potential stereocenters with unspecified configuration" and in the card); none. An "unsupported/ambiguous" fourth state is not separately modelled.
- Carbohydrates: D/L series of glucose, galactose, mannose, ribose, fructose, and other sugars named `-ose`/`-pyranose`/`-furanose` in ChEBI. Not claimed: universal coverage, anomeric equilibrium distributions, disaccharides.

## Limitations
- Variant discovery for sugars is pattern-based on ChEBI alias names (`[aldehydo|keto]-[α|β]-[D|L]-stem(ose|opyranose|ofuranose)`); sugars named otherwise are not grouped. Limit 16 variants.
- Stereo-variant discovery tries `L-` and `D-` plus the entry's title only.
- Chirality uses RDKit stereo tags with the existing simplified-CIP fallback for unassigned centers.
- Pre-existing lint error `MoleculeDrawer.tsx:224` (`setNameQuery` in an effect) remains.

## Tests
- New: `scripts/tests/stereoIdentity29b1a.test.mjs` — 15/15 (CIP labels for amino acids, D/L, mirror-image checks for L-glucose anomers, ambiguity handling, markup normalization, bond-orbital consolidation, presentation absence and retained notices).
- Regression, all passing: moleculeInput 38, moleculeNameResolver 6, identity29b 11, acidBasePresentation29b 2, propertiesSections20 11, analysisLibraryAllPages 25, analysisLibrary 35, analysisLibraryPages 28, persistence 39, persistenceRankingSpectroscopy 27, aromaticity29b 19, counterparts29b 12, nomenclature9f 48, ranking9f 5, ranking9g 9, conformationsRanking10b 30.
- `tsc -b` clean; `npm run build` succeeds (chunk-size warning only). ESLint on changed files: only the pre-existing error above. Unrestricted `npm test` not run.

## Browser (production build, real pointer/keyboard)
`scripts/browser/stage29b1aLiveCheck.mjs`: see Final results below. Covers L-leucine, unspecified leucine → D-leucine, L-lysine, glucose/D-/L- selectors, α-D, β-D, α-L, aldehydo-D-glucose Ketcher loads (stereocenter counts), fructose/galactose/mannose/ribose selectors, save and reopen of L-leucine, vitamin E, a double/triple-bond molecule, and four viewports (1920×1080, 1280×720 dark, 820×1000, 375×812 dark).
Screenshots: `node_modules/.cache/stage29b-1a/after/`

```powershell
explorer .\node_modules\.cache\stage29b-1a
```

## Commits (local)
The assignment asked for five; resolver changes (stereo identity and carbohydrates) share the same files, so they are one commit.
- `3596a8c` refactor(properties): remove redundant reasoning, provenance sections and per-value badges
- `6dcad77` feat(concepts): keep molecule beside concept info and consolidate bond orbitals
- `679ebad` style(concepts): side-by-side concept layout, pinned molecule when stacked, variant chooser
- `8460733` fix(identity): resolve L/D amino acids and carbohydrate forms; preserve stereo identity
- Final polish, tests, live check and this handoff: see `git log` (last commit).

## Final results and Git status
See the end of this file (appended after the last run).

### Final results
- `stage29b1aLiveCheck.mjs`: 49/49 on the production build (log: `node_modules/.cache/stage29b-1a/live.log`). Screenshots inspected visually: summary, Acid/Base, Concepts (chirality, functional groups, bond orbitals incl. triple bond), unspecified-leucine notice with L/D, glucose variant selector (compact grid, no clipping), α-D-glucopyranose in Ketcher with wedge/dash, and 1920/1280/820/375 px layouts.
- Final polish after the first browser pass: 4-column concept grid, slimmer carousel arrows, variant chooser as a grid, stereocenter text "atom N: R/S" (no duplicated label), source shown as the ChEBI id only.
- The unit suite and regression list above were run before the last CSS/text polish; the focused suite (15/15), `tsc -b` and build were re-run after it.

### Final Git status
Only the pre-existing untracked files remain (`CLAUDE.md`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`). The `phase1-synthesis-reliability` stash is intact. Not pushed.
