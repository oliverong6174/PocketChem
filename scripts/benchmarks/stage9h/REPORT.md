# Stage 9H report: fresh independent evaluation of the Stage 9G engine

## 1. Git checkpoint
Branch `stage9h-fresh-evaluation`, from `1c307fd` (Stage 9G). Engine `src/` tree `767acf31bf8b20bd1b3ae26b8e301fa5d8e55e28` was identical at freeze, at the run and at report time (`git status -- src` empty). Freeze commit `b31356c`; freeze record `03460be`. Unrelated untracked files (`CLAUDE.md`, `scripts/browser/stage9fLiveCheck.mjs`, `stage5-changes.patch`, `stage5-status.txt`) were not touched.

## 2. Methodology
`PROTOCOL.md` (frozen). Cases built by tools in `tools/` from saved sources; hashes in `manifest.json`; one run (`run.mjs --final`), raw JSONL kept; analysis (`analyze.mjs`) reads saved results only. 95% Wilson intervals in brackets. No retries, no deadline extension (production 45 s). No production code was changed.

## 3. Reference provenance
PubChem PUG REST records (nomenclature, properties, bp/pKa/logKow ranking), NIST WebBook JCAMP EI and gas-phase IR spectra, a Wikipedia Hammett table and IR correlation table (secondary), OpenStax Organic Chemistry modules (reactions, synthesis). Every source file is saved with SHA-256; every textbook quote was located programmatically in the saved file; 64/64 name-to-structure pairs matched PubChem. "Directly inspected" means fetched, saved and machine-checked, not read in a primary paper: **no primary literature was opened**, and OpenStax is a textbook.

## 4. Frozen inventory (scored / provisional)
Nomenclature 52, properties 52, ranking 30 (16 bp, 5 acidity, 1 basicity, 2 logKow, 3 ewg, 3 edg; 180 pairs), MS 48, IR 44 (41 present / 171 absent bands), reactions 36 / 8, synthesis 6 / 4. NMR not evaluated (no independent fetchable reference).

## 5. Holdout integrity
Frozen files verified byte-identical after the run (486 files). The run happened once (`results/final-lock.json`). Caveats: a pre-freeze smoke shakedown touched six molecules that also occur in frozen cases (outputs seen, not scored; disclosed in PROTOCOL.md); the author is also the evaluator; selection saw Stage 9F reports.

## 6. Results (scored cases only)
| Capability | Dimension | Result |
|---|---|---|
| Nomenclature | displayed name | 26/52 = 50% [37-63]; 6 confident-wrong, 13 flagged-wrong, 7 abstained |
| | constitution-only name | 26/52 = 50% |
| | systematic name | 23/52 = 44% [32-58] |
| | stereo-specified subset | 1/9 = 11% [2-44] |
| Properties | formula | 48/52 = 92% [82-97] |
| | MW / exact mass / charge | 52/52 each = 100% [93-100] |
| | logP within 1.0 | 34/38 = 89% [76-96] |
| Ranking | case order | 22/30 = 73% [56-86]; 6 wrong, 2 abstained |
| | pairwise | 165/180 = 92% [87-95]; 9 wrong, 6 unranked |
| | by mode | bp 14/16; acidity 1/5; basicity 0/1; logKow 2/2; ewg 3/3; edg 2/3 |
| Mass spec | molecular ion | 30/30 = 100% |
| | base peak | 16/48 = 33% [22-47] |
| | strict key fragments | 5/44 = 11%; non-strict recall 44/124 = 35% |
| | M+2 (Cl/Br) | 5/5 |
| Infrared | present, per case | 19/34 = 56% [39-71]; per band 26/41 = 63% |
| | absent | 41/41 cases, 171/171 bands |
| Reactions | connectivity | 30/36 = 83% [68-92]; 4 wrong, 2 abstained |
| | regiochemistry | 7/13 = 54% [29-77]; 3 abstained, 2 unclaimed, 1 wrong |
| | major/minor ranking | 0/5; all abstained |
| | ambiguity (must not name a winner) | 3/3 |
| | stereochemistry | 1/3; 2 incomplete (no stereo marks) |
| | provisional rule-derived (not in headlines) | connectivity 8/8, regiochemistry 2/2 |
| Synthesis | route found within 45 s | 6/6, none timed out (0.5-17.6 s); all structurally verified |
| | length vs documented | 4 within range, 1 longer, 1 shorter |
| | chemically sound? (post hoc judgment) | SY-02, SY-03, SY-04 plausible; SY-01, SY-05, SY-06 questionable (see 9) |

## 7. Confidence and sample size
Dimensions have 5-52 cases; intervals are wide (a 1-2 case swing is within noise for anything under about 20 cases). Ranking sub-modes with n = 1-5 (acidity, basicity) are anecdotes. Reaction cases are textbook statements about well-known reactions, easier than the literature at large. A post hoc, non-frozen observation: the 4 "wrong" formulas have the correct atoms in a non-Hill order (C2H3OCl, H5NCl, C2H3O2Na, C4H13NCl: the last two also carry salt-notation quirks), so composition accuracy is effectively higher than the frozen string metric shows.

## 8. Comparison with Stage 9F and 9G (different case selection)
Stage 9F holdout (Stage 9E-era engine, exposed) and the Stage 9G development rerun used different molecules, different sources and a 15 s synthesis budget; numbers are not like-for-like.
* Ranking: 9F holdout 7/24; now 22/30 cases, 92% of pairs. Direction supports the 9G ranking fixes, but the new set is dominated by bp homologous series that are easy, and acid/base ranking (the weak area) is 1/6 here. Not proof of generalisation.
* Nomenclature: 17/27 (63%) in 9F holdout; 26/52 (50%) now, with 6 confident-wrong versus 3. No generalised improvement; novelty rule removed easy common compounds.
* MS: molecular ion 100% in both. Base peak 11/25 (44%) then, 16/48 (33%) now; the 9G EI heuristics (aromatic ions, halide loss) did not show up (alkyl halides 3/8, substituted benzenes 4/8). Fragments remain poor.
* IR: present 23/23 then, 19/34 now (new windows are partly harness-sensitive, section 9); absent clean in both.
* Reactions: connectivity 11/15 then, 30/36 now; regiochemistry 4/12 then, 7/13 now; ranking abstained 0/6 then and 0/5 now (9G did not change the abstention pattern on these); stereo 5/7 then, 1/3 now.
* Synthesis: 2/3 found at 15 s then; 6/6 at 45 s with stoichiometric copies now. Route quality, not discovery, is the issue.

## 9. Scientific deficiencies revealed
1. **Nomenclature**: confident wrong names for simple aromatics and acyl compounds (acetophenone -> acetylbenzene, styrene -> (eth-1-en-1-yl)benzene, phenylacetylene, succinic anhydride -> oxolan-2,5-dione, sodium acetate -> ethanoate, anthracene -> a nonsense naphthalene derivative). Stereo-specified names 1/9; stereo descriptors are mostly missing.
2. **MS base peak and fragments**: 33% and 11%. Ethers, nitriles, alcohols 0/4, 0/3, 0/4.
3. **Acid/base and phenol ranking**: 1/5 acidity, 0/1 basicity; chloroacetic acid series ranked wrong. (Partial abstentions: oxalic acid/HCN, Hammett set with F.)
4. **Reaction ranking**: major/minor never declared (0/5), even for textbook cases (epoxide HCl openings, Friedel-Crafts rearrangement, Hofmann).
5. **Reaction connectivity gaps**: aldol (acetaldehyde -> 3-hydroxybutanal not offered; the pathway offered a nonsense `CC(O)O`), mixed aldol misses two products, 1,4-pentadiene + 2 HCl offers only monoadditions, Friedel-Crafts polyalkylation missing, no Wittig ylide or Gilman rules claimed.
6. **Stereochemistry**: trans-hydroboration and Markovnikov hydration carry no stereo marks (incomplete).
7. **Synthesis route quality**: all routes verify structurally, but SY-01 (Wittig of acetaldehyde, no phosphorus reagent in the inventory), SY-05 (Gattermann-Koch benzene -> benzaldehyde -> Wolff-Kishner -> toluene, not Friedel-Crafts), SY-06 (anti-Markovnikov HBr on MVK then enolate alkylation; the enamine route is not used; pyrrolidine unused), provisional SY-07 (Curtius on acetoacetic acid, 4 steps) and SY-10 (one-step aniline bromination to 4-bromoaniline without protection, which would overbrominate) are chemically questionable. "Found" must not be read as "sound".
8. **IR harness sensitivity (not only engine)**: missing O-H windows (3610-3670 gas phase "low concentration") and carbonyl windows (1685-1750; acid chlorides, amides, carbonates sit outside) account for most of the 15 present-band misses. Part of this is my window choice, not an engine defect; carboxylic acid O-H and phenol O-H are still reported at hydrogen-bonded positions.
9. **Properties**: formula strings for salts/Hill order (above).
10. **Harness caveat**: reagent-molecule table in `run.mjs` is a guess; Wittig and Gilman abstentions could reflect missing reagent input forms rather than missing chemistry.

## 10. Highest-priority development targets (for a later stage, not done here)
(1) Nomenclature of monosubstituted benzenes, acyl derivatives and anhydrides, and stereodescriptors; suppress High confidence for these. (2) Acid/base ranking by substituent effects (pKa), phenols. (3) EI base peak for ethers, alcohols, nitriles. (4) Major/minor ranking for epoxide HX opening, Friedel-Crafts rearrangement and Hofmann. (5) Aldol and double hydrohalogenation pathways. (6) Route sanity filter in synthesis (prefer textbook rules, penalise unprotected or reagent-unavailable steps). (7) Stereo marks on hydration/hydroboration products.

## 11. Test and build verification
`npm.cmd run build`: succeeded (chunk-size warning only). `npm test` not rerun: `src/` tree is byte-identical to the one that passed 1058/0 in Stage 9G. Stage 9H scoring self-test: 9/9 pass. Frozen-file integrity: 486 files OK after the run. Offline behaviour not part of this stage (all engine calls local; network used only at authoring time).

## 12. Commits
`b31356c` freeze, `03460be` freeze record, plus the results/report commit listed in `HANDOFF-9H.md`.

## 13. Working tree
Only the four unrelated untracked files remain untracked after the results commit.
