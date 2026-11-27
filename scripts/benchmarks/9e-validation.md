# Stage 9E: mechanistic reliability, search correctness and independent validation

Generated tables: `independent/evaluation-9e-tables.md` (from `report9e.mjs`), `independent/provenance-audit.md`. Earlier stages: `9d-validation.md`, `9c-validation.md`.
Everything below was measured in this stage; limits of what was and was not validated are in §9. Nothing was pushed.

## 0. What this stage did, in one paragraph

Found and fixed three causes of search false negatives, made the engine return sourced-ranked or explicitly unranked alternatives instead of one silently chosen product (E2/E1, aromatic substitution, carbocation rearrangements), fixed an inverted-versus-retained stereochemical error in epoxide opening and a geometry-agnostic stereo completion that gave (E)- and (Z)-alkenes the same product, audited the benchmark's provenance (the headline held-out set shrank from 35 to **15**), and added an untouched evaluation set that found one real defect. **The 15 strictly independent frozen cases did not change verdict, so no improvement is claimed from them**; improvements are visible only in cases that this stage targeted, and those are labelled development evidence.

## 1. Verified starting checkpoint

Branch `phase4-convergent-synthesis`, HEAD `33603af` ("independent benchmark results, report generator, and Stage 9D validation document"), Node v24.21.0. Untracked `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt` were present and are unchanged. The Stage 9D facts were re-checked rather than assumed: the frozen results (run 2b pre-fix, run 4 final) load and reproduce the 9D tables, 57 cases, 19 multi-catalytic scenarios, lint baseline 18.

## 2. Phase A: benchmark provenance audit

`auditSources.mjs` fetches every cited URL and measures how much of the claim's vocabulary appears in readable text; `provenanceAudit.mjs` overlays the result on the frozen cases (ground truth and recorded predictions are untouched).

| source result | n |
|---|---|
| supported | 18 |
| partial (claim vocabulary only partly present) | 5 |
| scanned PDF, no extractable text | 5 (Suzuki 1979, Heck 1979, UBC notes, Vanderbilt chapter, Imperial notes) |
| unreachable (HTTP 403, bot wall, timeout) | 4 (Sonogashira 1975, PMC DIBAL, IUPAC Birch, RSC) |
| failed automated check | 1 (`reusch-e2`, behind a WAF) — verified by hand at a mirror: methoxide 80:20, tert-butoxide 25:75 |

* **No primary paper was inspected.** The four `verified-primary` cases (OM-04 Suzuki, OM-05 Sonogashira, OR-01 Corey–Suggs, US-03 Katsuki–Sharpless) were confirmed bibliographically only. OR-01 and US-03 are re-labelled verified-secondary (a readable secondary page supports them); OM-04 and OM-05 become *source-not-inspected*.
* The 9D headline set of **35** splits into: **15 strictly independent held-out**, 5 development-guided (SE-02, SE-03, AR-01, AR-05, OM-02 — see below), 10 whose sources were not confirmed this session, 2 verified-but-development-informed (AL-09, AL-10; their rules were changed in 9D before the freeze), 3 deliberately-unsupported probes.
* SE-02, SE-03, AR-01, AR-05 and AL-05 are exactly the gaps Phase C was built to close (the 9D report lists them as known limitations). They are **development-guided in 9E**; a verdict change there is not validation.

## 3. Phase B: search false negatives

Reproduced `[13CH3]CO → [13CH3]C=O` and traced it through candidate generation, canonicalisation, identity, pruning, replay and termination. Three independent causes:

1. **Identity.** `canonicalizeStereoStructure` built its "connectivity" key with RDKit `doIsomericSmiles:false`, which also removes isotopes. `[13CH3]CO` and `C[13CH2]O` shared a key, so the planner bridged to an isotopologue route that replay then (correctly) rejected. Fix: strip only stereo tokens from the isomeric SMILES and re-canonicalise, keeping isotopes and charges.
2. **Pruning.** `diversePathwaySample` cut equal-cost pathways **alphabetically by rule id**. From ethanol, `primary-alcohol-mild-oxidation` sorted after ten `alcohol-*` rules and a pathway landing exactly on the target was discarded. Fix: a pathway whose product is on the other search front is never cut. This is a generalizable correction, not a special case: it changed four other one-step transformations from a multi-step detour or a 15 s timeout to the one-step route.
3. **Termination.** The linear lane ended when every first-pass candidate failed replay. Fix: one bounded widened pass (same abort signal, only untried routes).

Measured on the same inputs (15 s budget): `CCO→CC=O` 3-step pinacol detour → 1 step; `OCc1ccccc1→O=Cc1ccccc1` **no route in 15 s** → 1 step (1.4 s); `CCBr→CCO` E2 then hydration → SN2; `[13CH3]CO→[13CH3]C=O` 14 s → 1.2 s. No deadline, budget or scheduler was changed. Tests: `searchCorrectness9e` (24), including equivalent spellings, isotopes, charges, disconnected components, and the resume pass through injected hooks.

A fourth defect appeared *because* of Phase C and was fixed in the same place: with nitration returning ortho and para, the sampler kept one outcome per rule by input order, kept ortho, and the route to 4-nitrobenzoic acid timed out. The sampler now counts rules and keeps up to four sibling outcomes each (`MAX_SIBLING_OUTCOMES`).

## 4. Phase C: product selectivity and mechanisms

| area | before | now | evidence |
|---|---|---|---|
| aromatic substitution | para only (a 0.45 "steric" bonus removed ortho) | ortho and para both returned, **unranked** | toluene nitration ≈58% ortho / 4% meta / 38% para (LibreTexts/UIS CHE 269) |
| E2/E1 | only the preferred alkene survived | Zaitsev and Hofmann alkenes both returned. Small base: more substituted = **major**, other = minor. Bulky base on a *tertiary* halide: less substituted = major, other = competitive. Other substrates competitive. Rings (anti-periplanar) and conjugated alternatives unranked | LibreTexts E2 page; UCLA glossary; Reusch/MSU 80:20 and 25:75 |
| acid hydration, HX addition | unrearranged only | direct plus 1,2-hydride/methyl-shifted product (only downhill shifts), **unranked** | LibreTexts/NC State: HCl + 3,3-dimethylbutene ≈ equal mixture |
| Friedel–Crafts alkylation | direct attachment only | direct plus rearranged alkylarene, unranked | NC State neopentyl/benzene |
| epoxide + HX | always the more substituted carbon | tertiary carbon if present, otherwise the **less** substituted | LibreTexts Wade 15.08 and Nassau 8.14 (found by the untouched set, §6) |

Nothing is called the major product without a cited basis, and `null` assessment is rendered as "unranked: PocketChem does not know, not that it is minor". The Reactions page now carries each outcome's label and quoted evidence (it previously printed "unresolved chemical tie" for every multi-product card). New tests: `mechanism9e` (39).

Not done, on purpose: AR-05. The frozen case expects only 2-methyl-2-phenylbutane and forbids neopentylbenzene. The engine offers both, unranked, because I hold only one secondary source and it notes that other pages disagreed. Dropping the direct product for neopentyl halides would be a case-specific exception.

## 5. Phase D: stereochemistry

* **Epoxide opening was wrong, not merely incomplete.** RDKit carries the reactant's chirality tag through the template, which is retention; backside attack must invert the attacked carbon. trans-2,3-Epoxybutane ((R,R)) gave the (R,R) diol instead of the meso diol; the cis (meso) epoxide gave meso instead of the racemic (R,R)/(S,S) pair. Fixed with paired-chirality templates; an unspecified epoxide stays unspecified (checked).
* Cyclopentene/cyclohexene/cycloheptene oxide drawn without stereo now gives the trans racemate (parity found on trans-cyclohexane-1,2-diol); eight-membered, bridged and aryl-fused rings are deliberately not completed.
* **Halohydrin formation gave (E)- and (Z)-2-butene the identical diastereomer.** Fixed with geometry-conditional templates.
* **Acyclic tri/tetrasubstituted alkenes: (E) and (Z) gave identical epoxides, diols, dibromides and halohydrins.** The templates cannot see geometry there and the page layer completed with a drawing convention. Now reported as *not assigned*, with the reason on the card. A geometry-based builder is the top recommendation (§12).
* Chiral products of achiral additions to stereo-free reactants are racemates (halohydrin, Diels–Alder with one new centre); meso products are left alone; undetermined-geometry additions keep every stereoisomer instead of one drawing representative.
* **Audits** (scripts kept): `inventedStereoAudit` runs 53 stereo-free substrates through every applicable rule. Defined stereocentres presented without a mixture label: 11 on the first corpus, 13 after I added Diels–Alder and carbonyl probes, **0 now** (69 stereo-defined pathways checked; meso products are correctly exempt). `geometryAudit` compares (E)/(Z) pairs across all rules: 8 product groups returned identical stereoisomers for both geometries (1 for 2-butene, 2 for 2-pentene, 5 for the trisubstituted pair), **0 now**. Carbonyl addition, reduction and aldol rules assign no stereochemistry at all (so none is invented); they predict nothing either.
* 1-Methylcyclohexene (trisubstituted ring): syn, anti, Br₂ and halohydrin products checked against ground truth built from the validated cyclohexane relative configurations — all correct as racemic pairs.
* Tests compare CIP descriptors and mixture membership, never SMILES spelling: `stereo9e` (36), including isotope, charge and E/Z identity.

## 6. Phase E: independent evaluation

**Frozen benchmark (57 cases, `evaluation-9e-tables.md` §2–3).** Pre-fix accuracy (frozen original predictions) and post-development performance are reported side by side, never merged.

| set | pre-fix | Stage 9D | Stage 9E |
|---|---|---|---|
| strictly independent (15) connectivity | correct 13 | correct 13 | correct 13 |
| strictly independent (15) regiochemistry | correct 4 | correct 4 | correct 4 |
| strictly independent (15) stereochemistry | correct 3 | correct 3 | correct 3 |
| original 35, connectivity | 27 ok, 2 wrong, 1 abstained | 28 ok, 2 wrong | 29 ok, 1 wrong |
| original 35, classification | abstained 6 | abstained 6 | correct 1, abstained 6 |

5 of 57 frozen cases changed output: SE-02 (classification abstained → correct), SE-03 (Hofmann alkene major; Zaitsev alkene competitive, so the minor-role check abstains), AL-05 (provisional; methyl-shifted alcohol now offered), AR-01 (ortho now offered; engine no longer calls para major, so regiochemistry abstains), AR-05 (still wrong against the frozen expectation, see §4). All five are development-guided or provisional. **RT-03 regressed to a timeout mid-stage and was fixed (§3); it is found in 4.1 s.**

**Untouched evaluation set (`cases9e.mjs`, HX-01…HX-11).** Written after the engine work and committed (`8150887`) before it was run; classes whose rules were not modified (epoxide *regiochemistry*, Williamson, Wittig, aldol, hydroboration, Diels–Alder). Sources were fetched and checked this session.

| id | what | 9D engine | 9E engine | note |
|---|---|---|---|---|
| HX-01/02 | propylene oxide + MeO⁻ / MeOH,H⁺ regiochemistry | correct | correct | HX-02 classification abstained (no regioisomer ranking) |
| **HX-03** | propylene oxide + HBr → 1-bromopropan-2-ol | **wrong** | **wrong, then fixed** | genuine defect: the HX rule used "more substituted" for every epoxide; both cited pages say otherwise. Development-guided afterwards |
| HX-04 | 2,2-dimethyloxirane + HBr → tertiary bromide | correct | correct | |
| HX-05 | EtO⁻ + 1-bromopropane | correct | correct | |
| HX-06 | EtO⁻ + t-BuBr | abstained | abstained | **my authoring error**: the E2 base is a reagent supplied by the rule, so ethoxide as a second molecule is an invalid selection. Not edited. Restated as HX-06R (correct), reported outside the figures |
| HX-07…10 | Wittig, aldol addition/condensation, hydroboration | correct | correct | |
| HX-11 | butadiene + maleic anhydride, cis-fused | stereo incomplete | stereo incomplete | engine leaves the relative configuration unspecified |

Genuinely untouched and independent (HX-03 and HX-06 excluded): **9 cases, identical verdicts on the 9D and 9E engines** (as intended: it shows the 9E work did not disturb those classes). Its value was the HX-03 finding. Ten evaluation cases is a small set; no accuracy percentage is quoted. Ozonolysis was dropped for lack of a reachable source.

## 7. Phase F: multi-catalytic regression

`multicatalyticBenchmark.mjs`: **19/19** scenarios, including INT-1 and INT-2 (independent branches, convergent coupling, several catalytic steps, product selection, inventory consumption, intermediate provenance, structure replay "connectivity-only"). Persistence suites (`multicatalyticPersistence` 30, `persistenceReactions` 50) and the live restore checks pass. One real behaviour change, disclosed: INT-2's epoxide opening used to offer two enantiomers as separate outcomes needing a choice, with the 9D relative configuration (R,R)/(S,S) that came from retention; it now offers one grouped **racemic** outcome with the mechanistically correct (R,S)/(S,R) configuration, and the workspace records the racemate on that step. Downstream lots hold the representative enantiomer. Structural replay verifies that steps follow from PocketChem's rules; **it is not experimental validation**, and INT-2 remains a provisional, not literature, sequence.

## 8. Testing

* `tsc -b` clean; `npm run build` succeeds (both `index.html` and `ketcher-frame.html`, RDKit and data assets present); `eslint` **18 problems, the unchanged baseline**; `git diff --check` clean apart from CRLF notices.
* Focused suites, all passing: stereo9d 28, stereo9e 36, mechanism9e 39, searchCorrectness9e 24, selectivity9c 38, synthesisSelectivity 27, existingRegression 4 (+2 documented todo), reactionWorkspace 36, persistenceReactions 50, integrated9c 7, retroGoalSearch 20, convergentSearch 24, searchScheduler 39, synthesisSearchRun 26, routeVerification 14, convergentFixtures 55, speciesPool 33, routeInventory 24, branches 16 (+1 todo), sequential 33 (+3 todo), sequentialSafety 11, multicatalyticPersistence 30, conditionModel 17, catalystRoles 21, uiPolish 14, synthesisUi 16, moleculeInput 38, compatibility 19.
* Two `sequentialSafety` tests had **never run** (they built rules before the `before` hook); fixed, and both pass. Test strings compared as spellings in `synthesisReliability` and `sequentialSafety` now compare canonical structures.
* **Full suite, sequential (`--test-concurrency=1`): 951 tests, 944 pass, 1 fail, 6 todo.** The failure is the Deep-budget estragole ordering test hitting the 45 s deadline. A first, parallel run showed the same failure (870/877). See §9.
* Live browser (headless Chrome, live Ketcher, production build): `multicatalyticLiveCheck` 33/33, `reactionsStereoLiveCheck` 9/9, new `mechanismLiveCheck` 14/14 (nitration, rearranged products, E2 labels, epoxide regiochemistry and stereo, halohydrin E/Z, trisubstituted "not assigned").

## 9. Incomplete validation, stated plainly

* **The full suite is not clean.** The estragole Deep-budget test failed (45 s deadline) in both full runs of 9E. It passes standalone in 26.9–28.1 s, and the 9D baseline passes it at 26.0 s standalone. Three interleaved timings of the search itself gave **9E 27.0–29.8 s vs 9D 26.0–29.5 s**, peak RSS 312–324 vs 206–313 MB, so I cannot attribute the failure to the change; but I also did not prove it is environmental. The 9D baseline's own full sequential run failed other tests (a 108 s convergent "two copies" test that 9E finishes in 5.9 s, the estragole spelling assertion fixed here, and the dead `sequentialSafety` suite). The suite is load-sensitive near its 45 s cliff in both.
* The Deep-budget estragole search was not run repeatedly under memory pressure, as instructed.
* No primary paper was read; independence rests on secondary pages (and one hand-verified mirror).
* The untouched set is 9 independent cases. It cannot support an accuracy claim.
* Shifts in hydration/HX/Friedel–Crafts products do not carry stereochemistry at the new centre (left unspecified); remote stereocentres in rearranging substrates were not tested beyond the epoxide cases.
* The browser checks assert text and mixture labels; they do not compare drawn wedge orientation pixel by pixel.

## 10. Performance and memory

Whole independent benchmark: 20.3 s for 57 cases (9D reported 17.8 s on a quieter machine), slowest case 4.1 s, **peak RSS 311 MB (unchanged)**. Route searches measured against the 9D engine **on the same machine in the same session**: RT-01 3.4–4.0 s (9D) vs 3.5 s (9E), RT-02 2.3–2.5 vs 2.3 s, RT-03 4.6–4.9 vs 3.9–4.1 s. The faster 9D figures in its own report came from a quieter machine; there is no measurable slowdown from the sampler change. Multicatalytic overhead (median of 7): sequential 21 ms, workspace 21 ms, replay+assessment 29 ms.

## 11. Remaining unsupported or unmodeled chemistry

* Ortho:para, steric and electrophile effects; direct-versus-rearranged ratios; polyalkylation. AR-05's neopentyl case offers an unlikely direct product.
* E/Z geometry inside a Zaitsev constitution; ring E2 (anti-periplanar access); conjugated alkenes; Hofmann elimination of amines unchanged.
* Relative configuration of acyclic tri/tetrasubstituted alkene additions, acyclic epoxides of unknown geometry, 8-membered and bridged ring epoxides, "epoxidation then opening" sequences' own handlers; stereochemistry of carbonyl additions and aldols (Felkin–Anh, Zimmerman–Traxler) is not predicted at all.
* Not modeled: Wacker, RCM, Mitsunobu, Sharpless AE; catalyst roles for most rules; yields, solvent and ligand effects.
* Pre-existing naming defects seen in the new cards (identical in 9D): cyclohexene oxide is named "2,3-di5-hexoxypentyloxirane", propylene oxide "3-methyloxirane", 2-bromo-2,3-dimethylbutane "3-bromo-2,3-dimethylbutane".

## 12. Commits (local only, none pushed) and recommendations

`22a8a7b` search + provenance audit · `c8d6772` selectivity and rearrangements · `e180261` epoxide inversion and racemate reporting · `af3a68a` geometry · `a391024` sampler · `8150887` frozen untouched cases · `46ec41a` epoxide-HX fix · `d8e787b` Reactions-page ranking/evidence + live check · `a40592a` development-guided reclassification and tables, plus the final documentation commit.

Ranked next milestones:
1. **Geometry-based stereo builder**: place the new groups using the alkene's 2-D geometry (face of attack) so tri/tetrasubstituted and ring-fused alkenes are completed instead of "not assigned". It would replace tag-parity templates for every syn/anti addition.
2. Read the primary papers (or reachable open copies) for the named reactions and replace the secondary/unconfirmed labels; grow the untouched set to the point a rate can be quoted.
3. Make the search cliff robust: report time-to-route percentiles on idle and loaded machines, and decide whether the Deep estragole tests need a looser deadline or a run-to-completion mode in the suite.
4. Fix nomenclature for fused epoxides and locant choice.
5. Add direct-versus-rearranged ratios only if a reliable condition-dependent source exists; otherwise keep them unranked.
