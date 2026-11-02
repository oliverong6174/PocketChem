# Stage 9D: stereochemical reliability and independent organic-chemistry validation

Data and scripts: `scripts/benchmarks/stereoAudit.mjs` (Phase A audit), `scripts/benchmarks/independent/` (held-out benchmark: `cases.mjs`
frozen before scoring, `screen.mjs`, `run.mjs`, `report.mjs`, `results/`), `scripts/benchmarks/multicatalyticBenchmark.mjs` (INT-1, INT-2),
`scripts/browser/*LiveCheck.mjs`. Generated tables: `independent/independent-validation-tables.md`. Earlier stages: `9c-validation.md`.

## 1. Phase A: where stereochemistry was lost or invented (measured, before any change)

`stereoAudit.mjs` runs the same probes through the **base engine** (workspace and planner) and the **Reactions-page layer**.

| Reaction | Probe | Base engine (before) | Reactions page (before) | Defect |
|---|---|---|---|---|
| epoxidation | E-2-butene / Z-2-butene | trans racemate / meso (9C fix) | same | none after 9C |
| epoxidation | 2-butene, no geometry | constitution only | **meso diastereomer** | stereo invented |
| epoxidation | 1-butene | constitution only | **one arbitrary enantiomer, no mixture** | arbitrary R/S for a racemate |
| Br2 addition (anti) | E / Z / unspecified 2-butene | constitution only (all three) | **the same meso product for E, Z and unspecified** | E/Z lost; Z wrong |
| Br2 addition (anti) | cyclohexene | constitution only | one enantiomer, unlabelled | trans/racemate not stated |
| Simmons–Smith, CCl2/CBr2 cyclopropanation | E / Z 2-butene, cyclohexene | constitution only | constitution only | cis/trans relationship lost |
| OsO4 syn / epoxide-opening anti dihydroxylation | cyclohexene | **three diastereomers including relationships the mechanism forbids** | one member labelled "diastereomeric/1" | impossible stereoisomers listed |
| oxidation of a stereo-defined alcohol | (S)-butan-2-ol, any chiral secondary alcohol | **no product at all** | same | product silently dropped (found later by INT-2) |

**Root causes.** (1) Reaction SMARTS cannot see alkene geometry (RDKit ignores double-bond stereo in reactant templates), so rules that are
stereospecific in the alkene geometry had no way to express it. (2) The Reactions-page layer completed stereochemistry on every
syn/anti-addition product regardless of whether the chemistry determines it. (3) The dihydroxylation handler's unspecified-geometry
fallback enumerated every tag combination, including trans for ring alkenes under a syn mechanism. (4) A template that turns a
stereogenic carbon into a carbonyl left the product atom with the reactant's bracket state (`[C@H]` = chirality tag + fixed H count), giving the hypervalent,
unparsable `CC[C@H](C)=O`; the engine then dropped the product, so a stereo-defined alcohol could not be oxidised in any interface or route.

Ketcher itself assigns E to a double bond loaded as `CC=CC` (trans layout), so an undefined-geometry alkene cannot be created in the editor; the
undefined case is reachable through SMILES/programmatic input and is covered at engine level.

## 2. Phase B: corrections

| Rule / module | Change | Evidence |
|---|---|---|
| `alkene-halogenation-bromine` | geometry-conditional forward templates: E → (R,S) (meso if symmetric), Z → (R,R)/(S,S) racemate, 5–7-membered ring alkene → trans racemate; `mixture: "expected"` | OpenStax/NC State: anti addition via bromonium ion; cyclopentene gives only trans, racemic (NC State 5.4) |
| `alkene-simmons-smith`, `alkene-dichloro/dibromocyclopropanation` | same mechanism: E → trans racemate, Z → cis, ring → cis | stereospecific carbene addition (textbook; **not individually re-verified this session**) |
| `alkene-epoxidation` (9C) | consistent with the page layer | JoVE/LibreTexts concerted syn addition |
| `alkene-syn/anti-dihydroxylation` (handler) | ring alkenes: syn → cis diol only, anti → trans racemate only | LibreTexts vicinal syn dihydroxylation (cyclohexene → cis) |
| Reactions-page layer (`reactionUtils.ts`) | a stereospecific addition is completed only if the alkene geometry is defined or the alkene is in a 5–7 ring; a lone new stereocentre from a **terminal** alkene is shown as a racemate (both enantiomers as members); anything else stays unspecified with a note | audit rows above; live browser check |
| `rdkitReaction.ts` (shared SMARTS runner) | repairs only invalid products whose stereocentre was destroyed (replaces the smallest set of chiral bracket atoms by plain atoms); valid products and surviving stereocentres untouched | (S)-butan-2-ol and a two-stereocentre diol now oxidise with the second centre preserved |
| `epoxide-grignard-opening` (ring handler) | organometallic carbon may be aryl/vinyl/alkynyl (`[#6:4]`), not only aliphatic | held-out OM-02: PhMgBr + ethylene oxide gave nothing |
| `organocuprate-conjugate-addition` | structural trigger only (the classifier names cyclohexenone "Crotonaldehyde/Acryloyl", so the name-based trigger made the rule unreachable for cyclic enones); carboxylic acids excluded | held-out OM-03 |
| `heck-coupling` (9C+9D) | generalization checked on acrylonitrile, acrylamide, vinyl sulfone, 4-methylstyrene, ethyl acrylate; 1,1- and 1,2-disubstituted alkenes keep every site, unranked | Heck 1979 (syn insertion/β-H elimination), see §3 |
| `aromatic-friedel-crafts-*` | positions flanked on both sides by substituents are strongly disfavoured (steric); model parameter, not a measurement | m-xylene acylation: the 4-position is favoured, the position between the methyls disfavoured |
| `pinacol-rearrangement` (9C) | leaving OH chosen by carbocation stability; hydride-versus-aryl order remains a documented simplification | PNNL (propanal from 1,2-propanediol) |

Where no generalizable correction exists the uncertainty is kept explicit: acyclic alkenes of undefined geometry, multi-centre products
(for example the geraniol 2,3-epoxide, where the depiction completer previously marked only one of two centres and the page called the result "racemic"),
hydroboration and syn-dihydroxylation of trisubstituted ring alkenes (the H1=H1 stereo templates do not apply), and Heck on non-terminal alkenes.

## 3. Phase C: the independent benchmark

57 cases (`independent/cases.mjs`): substitution/elimination 5, alkenes 11, alkynes 5, carbonyl 7, aromatic substitution 5, organometallic/coupling 6,
oxidation/reduction 6, competing pathways/ambiguity 2, deliberately unsupported 5, multistep routes 3, multi-catalytic workspaces 2.

**Independence.** Expected answers were written from chemistry knowledge before any PocketChem run and frozen in commit `e4f2c2f` (a later commit
only supplied the stated "2 equivalents" as two molecules for CB-02). Reactant SMILES were checked for parseability and CIP labels only. The reaction rule a
case exercises is an *input* chosen by reading the reagent text. Stereochemical expectations are written as CIP descriptors or E/Z, not as engine output.

**Provenance** (`independent/cases.mjs`, with URLs and the statement each source supports): verified-primary **4**, verified-secondary **35**,
provisional **18**. "Verified" means a search this session returned a reliable source whose retrieved text supports the specific claim. Primary-literature items
(Suzuki–Miyaura 1979/1995, Sonogashira 1975, Corey–Suggs 1975, Katsuki–Sharpless 1980) were confirmed **bibliographically** through secondary pages, not by reading the
papers. Provisional cases are excluded from every reference-validated figure. Where search results contradicted a claim (for example one answer site giving
the unrearranged alcohol for acid hydration of 3,3-dimethylbut-1-ene) the case is provisional and says so.

**Overlap screening** (`screen.mjs`): a case overlaps an existing fixture when all its reactants occur in one test file that also names its rule or its expected
products. 7 cases overlap (AL-07, AL-08, CB-07, AR-03, CP-02, US-01, US-02) and are excluded from held-out figures. **Reference-validated held-out set: 35 cases.**

**Disclosed corrections after the first run** (run 1 is kept unchanged in `results/`): a scorer defect (an unlisted coproduct counted as a stray product),
a too-loose Wacker pattern, two authoring errors on my side (the Mitsunobu ester configuration was written as retention; Cannizzaro's sourced product is the benzoate, not the
acid), an incomplete route allow-list (RT-01), and a later scorer refinement (an unsupported case that is only reproduced by an unrelated rule is "other-rule-match", not
"supported-correct"). None changed a literature-based answer to suit PocketChem; each is listed in `CORRECTIONS`.

**Benchmark-driven engine fixes contaminate held-out status.** Held-out cases OM-02, OM-03 (and, through INT-2, stereo-defined alcohol oxidation) exposed real defects that were then
fixed. The headline below is therefore the **pre-fix engine** (run 2b: the engine as it stood after the Phase B fixes and before any benchmark-driven fix, scored with the final scorer); the post-fix
column is reported separately and for those cases is no longer held-out.

## 4. Phase D: scores by dimension (no combined accuracy)

Reference-validated, held-out, **35 cases**. Each dimension counts only cases that have an expectation for it.

| Dimension | Pre-fix engine | Post-fix engine |
|---|---|---|
| Structural validity (products parse) | correct 29 / 29 | correct 30 / 30 |
| Product connectivity | correct 27, wrong 2, **abstained 1** (of 30) | correct 28, wrong 2 (of 30) |
| Regiochemistry (engine's own "major") | correct 11, wrong 1 (of 12) | same |
| Stereochemistry | correct 4, incomplete 2, wrong 1, not-scored 1 | correct 4, incomplete 3, wrong 1 |
| Major/minor classification | **abstained 6 of 6** | same |
| Reaction-condition adequacy (catalytic or not) | correct 4, unassessed 1 | same |
| Ambiguity handling | correct 1 / 1 | same |
| Unsupported cases (3 in the validated set) | other-rule-match 2, supported-correct 1 | same |
| Route discovery / verification / plausibility (1 case) | found, verified, plausible | same |
| Workspace (multi-step, 1 case) | correct 1 | same |

How to read these. The two wrong connectivity results are **known, documented limitations, not random errors**: AR-01 (toluene nitration: literature
about 58:38:4 ortho:para:meta, the engine's directing-effect selector returns para only, so ortho is missing) and AR-05 (Friedel–Crafts with a neopentyl halide: the engine attaches the
alkyl group directly and does not model the methyl shift; the rule says so). The single wrong stereochemistry result is US-05 (Mitsunobu): no rule claims Mitsunobu,
and the ester that the engine does produce for alcohol + acid (Fischer) retains configuration, so claiming the inverted ester would be wrong; the case counts as
an **other-rule-match**, never as support. "Abstained" classification means the engine did not rank anything as major or minor: for E2, DIBAL, ester-Grignard and
aromatic substitution it returns a single outcome and no estimate, which is honest but means **PocketChem established no validated major/minor classification on this set**.
Stereochemistry "incomplete" cases (AL-03, AL-09, US-03) are products whose constitution is right but whose relative configuration the engine leaves unspecified.

Provisional cases (18, excluded above): connectivity 13/14 correct (AL-05, acid hydration with methyl shift, is wrong: no rearrangement is modeled), regiochemistry 6 correct 1 wrong,
routes RT-01/RT-03 found, verified and plausible. **None of these numbers may be quoted as validated accuracy.**

Route and runtime: three route searches under a 15 s budget each finished in 1.6–2.9 s; no timeouts occurred, so no "no route" result here is a timeout. Whole benchmark: 17.8 s for 57 cases,
peak process RSS 311 MB. The search had **no case where an impossible synthesis was reported as found**; one known false negative remains (isotope-labelled [13CH3]CO to [13CH3]C=O, below).

## 5. Phase E: integrated multi-catalytic regression (real rules)

- **INT-1** (4-bromobenzoic acid + methanol, methyl propiolate: Fischer, Lindlar, Heck join with explicit outcome choice, Pd/C hydrogenation): unchanged, 4 catalytic systems, replay verified.
- **INT-2** (new): (Z)-hex-3-yne → Lindlar → (Z)-hex-3-ene → stereospecific epoxidation → cis (meso, (R,S)) 3,4-epoxyhexane [branch A];
  1-bromobutane → butylmagnesium bromide [branch B]; epoxide opening (explicit outcome choice, the two ring carbons are equivalent) → the alcohol `CCCCC(CC)C(O)CC`; PCC → ketone `CCCCC(CC)C(=O)CC`.
  Two transformed branches, convergence, post-convergence modification, intermediate provenance and inventory consumption correct, structure replay verified.
  Writing INT-2 exposed two things: my own hand-written meso SMILES was the trans compound (corrected using CIP labels), and the PCC step **failed on the stereo-defined alcohol** (the defect fixed in §2). The configuration of the new carbinol centre produced by epoxide opening is **not asserted**
  (PocketChem offers two outcomes and does not model the relative configuration); the sequence is provisional, not a literature route.
- All 19 multicatalytic scenarios match. Replay "verified" means the steps follow from PocketChem's own rules; it is **not** experimental verification.

## 6. Phase F: testing and performance

Focused suites (all passing unless stated): `stereo9d` 27 (+1 known-gap todo), `selectivity9c` 38, `reactionWorkspace` 36, `conditionModel` 17, `catalystRoles` 21, `multicatalyticPersistence` 30,
`integrated9c` 7, `sequential` 33/36 (3 todo, as before), `branches` 16/17, `sequentialSafety` 9, `synthesisSelectivity` 27, `convergentFixtures` 55, `routeInventory` 24, `routeVerification` 14,
`speciesPool` 33, `persistenceReactions` 50, `retroGoalSearch` 20, `convergentSearch` 24, `searchScheduler` 39, `synthesisUi` 16, `existingRegression` 4 (the in-source reaction and mechanistic-stereo regression suites).
`tsc -b` clean, `vite build` succeeds, lint at the baseline of 18 problems.

Live browser (headless Chrome 156, live Ketcher, production build): `multicatalyticLiveCheck` 33/33; `reactionsStereoLiveCheck` 9/9: 1-butene epoxide and bromide are racemates
("one enantiomer shown; + mirror-image enantiomer"); (E)/(Z) epoxides and dibromides show the trans racemate / meso cis and meso / racemate pairs; cyclohexene + Br2 is the trans racemate.

Performance. Workspace versus ordered-sequence executor on the same 3-step chain, medians of 7 runs per invocation: Stage 9C **147 / 130 ms** (workspace / sequential), first 9D run
73 / 78 ms, later runs 65 / 86, 48 / 47, 18 / 18, 39 / 39 ms. The absolute times fall because the machine was busier earlier; the ratio stays near 1.0, so **no overhead was added by Stage 9D**
(the shared-runner repair only does work when a product is already invalid). INT-1 end to end: 1084 ms (9C run) versus 96–106 ms (idle machine); not comparable, load-dependent.
No search budget, scheduler or deadline was changed.

**Not run:** the full `npm test` and the estragole Deep-budget tests (resource constraint, as agreed). Full-suite coverage is therefore incomplete.

## 7. Remaining unsupported or unmodeled chemistry

- Carbocation rearrangements in acid hydration and Friedel–Crafts alkylation; ortho/para ratios (toluene nitration returns para only); Heck on alkyl, electron-rich and non-terminal alkenes.
- Relative configuration of epoxide-opening, aldol and most additions to prochiral carbonyls; stereo for trisubstituted ring alkenes (hydroboration, syn dihydroxylation).
- Wacker, RCM, Mitsunobu and Sharpless AE are not modeled (Mitsunobu and Sharpless are only reproduced, without the right stereochemistry, by unrelated rules); Baeyer–Villiger is claimed by a rule.
- Classification: almost no rule ranks its outcomes. 33 of 35 validated cases that expect a ranking abstained or had a single outcome.
- Isotope-labelled routes: the linear search accepts its first candidate before end-to-end replay; for [13CH3]CO → [13CH3]C=O the first candidate is an isotopologue route that fails replay and the search is not resumed, although the one-step route exists (registered as a known-gap todo).
- Catalyst roles for 312 of 342 rules, ligands, loading, poisoning, yields, solvent effects.

## 8. Recommended next scientific milestone

1. Give E2/E1 and EAS rules a shared ranked-outcome interface (Zaitsev/Hofmann ratios from the MSU data, ortho/para from the toluene-nitration distributions) so validated classification can be non-empty.
2. Add carbocation-rearrangement modeling (hydride and methyl shifts) to acid hydration, SN1/E1 and Friedel–Crafts, with the neopentyl and 3,3-dimethylbutene cases as regression tests.
3. Resume the linear search after a candidate fails end-to-end replay (bounded second pass), fixing the isotope false negative without changing deadlines.
4. Extend geometry-conditional templates to trisubstituted and 1,1-disubstituted alkenes and to epoxide-opening relative configuration.
5. Grow the verified-primary set by reading the primary papers for the named reactions, and replace provisional cases with sourced ones.
