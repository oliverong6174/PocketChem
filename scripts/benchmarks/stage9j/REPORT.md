# Stage 9J report: selectivity and prediction reliability (development validation only)

Branch `stage9h-fresh-evaluation`, from `7763b44` (verified clean apart from four unrelated untracked files). Nothing here is blind or independent generalisation: every case set was authored by the engine author, and the 9F/9H/9I cases are exposed. Corrections to earlier methodology are in `ERRATA-9J.md`; no earlier result file was edited.

## Phase A: audit of Stage 9I behaviour
| Behaviour | Status |
|---|---|
| Structural replay vs chemical-quality split | independently checkable by construction (replay is deterministic) |
| Atom-sourcing, over-halogenation, free-arylamine nitration, beta-keto-acid intermediates | mechanistically plausible, rule-based; 6 of 7 seeded positives on structurally valid routes caught (below) |
| Friedel-Crafts / EAS ring-position ranking | heuristic; **demonstrably wrong for bulky electrophiles** (called ortho "competitive") |
| McLafferty ion m/z and eligibility | mechanism-derived, audited here: correct on 8 eligible and 9 ineligible structures, mass bookkeeping holds |
| McLafferty and fragment *intensities* | heuristic class values; not experimentally calibrated |
| Base-peak certainty labels | `supported` separates; `heuristic` vs `unreliable` does not (below) |
| Nomenclature synonym equivalence (9I errata-aware) | **demonstrably incorrect**: dropped stereodescriptors |
| Diels-Alder depiction "pre-existing failure" | **demonstrably incorrect engine output** (exo adduct for an activated dienophile) |
| Propylene oxide + ROH/H+ as a single product | over-claim |

## Phase B: selectivity (implemented, qualitative only, no ratios)
* SN2 vs E2 by substrate class and reagent class (`selectivityProfile.substitutionElimination` declared on 8 haloalkane rules). Primary + hydroxide/alkoxide: SN2 major, E2 minor. Secondary + hydroxide: both competitive. Secondary + alkoxide: E2 major, SN2 minor. Weakly basic nucleophile: SN2 major. Bulky base: E2 major. Methyl, tertiary, allylic, benzylic, alpha-carbonyl, beta-branched primary and polyhalo substrates are left unranked; a lone product is never called major (a 9C test pins that and still passes). Alkene-level Zaitsev/Hofmann ranking is kept; the pathway verdict can only demote it.
* EAS: ortho attack on a monosubstituted benzene by a bulky electrophile (acylium, tert-alkyl) is now "disfavored (steric)"; before, ortho was "competitive". Para stays favored. Thermodynamic tert-butyl isomerisation is disclosed as not modelled.
* Friedel-Crafts alkylation with a primary alkyl halide that can hydride-shift: direct and rearranged products are both kept and labelled condition-dependent; neither is major.
* Aldol: when an aldehyde is present beside a ketone, the ketone-electrophile adduct is minor. The aldehyde adduct is deliberately NOT promoted to major (self-aldol competes).
* Epoxide + alcohol/H+: tertiary, benzylic or allylic carbon is attacked; otherwise both regioisomers are kept (was a single product).
* Not done: product-specific numeric ratios (none invented); crossed-aldol product enumeration beyond the existing rule; E1/SN1 competition; solvent and temperature dependence.
* Tests: `selectivity9j` (19), updated `mechanism9e` assertion; all older selectivity suites pass.
* UI caveat (browser-confirmed): the SN2 and E2 are separate cards on the Reactions page, so the "competitive/minor pathway" label is visible in route selectivity summaries, not on those cards. The EAS steric label and the epoxide "2 alternatives, unranked" are visible.

## Phase C: route-quality validation (`route-quality/`)
Cases frozen before the assessor ran (27: 12 flag, 2 not-supported, 13 clear, plus 2 ambiguous reported only). Author = assessor author, so this is **not independent**. First run kept as-is; its harness dropped selectivity data (harness v2 fixes it); see errata.
* Flag set (n=12): 11 caught. Six were caught by the quality checks on routes whose structural replay passed (free-aniline and phenol bromination, aniline nitration, n-propyl Friedel-Crafts, beta-halo ketone with hydroxide, keto-ester LiAlH4); five were caught only because the engine will not generate them or replay fails (fabricated atoms, deactivated-ring acylation, aniline alkylation, halo-alcohol Grignard). One missed: a beta-keto acid as the *final* target (the check targets intermediates by design). Sensitivity 11/12 (95% Wilson 62-98%); on structurally valid routes only, quality checks caught 6 of 7.
* The F06 miss (beta-halo ketone + hydroxide) was found by this set and fixed generically (strong-base haloalkane rules now get the check) : development-guided.
* Clear set (n=13): 0 false rejections (95% upper bound 23%). Harness v1 showed 1 (a target-construction defect). Six routes reach `chemically-supported`; seven stay `plausible-incomplete` because conditions are undeclared: the tier is conservative, which costs coverage, not safety.
* Not-supported: the toluene nitration (unranked regioisomers) is a known-concern as intended. N01 was my labelling error (errata 4).
* Where no reliable verdict exists the tier is `plausible-incomplete`, not forced.

## Phase D: mass spectrometry
* McLafferty audit (`massSpec9j`, 27 tests): hand-derived m/z for acids, esters, nitrile, aldehyde, ketones, amide, aryl ketone; none for propanal, acetone, pentan-3-one, isobutanal, benzaldehyde, acetophenone, cyclohexanone, acetic acid, tert-butyl acetate; M minus ion is always a neutral alkene mass. No defect found; no engine change.
* New set B (frozen before running; 8 NIST EI spectra, only 8 survived the exclusion of every 9F/9H/9I compound): molecular ion 6/6, base peak 5/8, strict key fragments 0/7. Ionization: 70 eV EI, NIST WebBook JCAMP-DX.
* Calibration (pooled 9I-dev tuned-on 15 + set B 8, `calibration.json`): `supported` 5/5 correct (Wilson 57-100%); `heuristic` 2/9; `unreliable` 2/9. So the label separates reliable from unreliable predictions only at the `supported` level; `heuristic` and `unreliable` perform alike and should not be read as graded confidence. Coverage: 5 of 23 cases (22%) get `supported`; the rest are abstentions or weak. Fragment-existence accuracy is poor (strict 3/23) irrespective of label, and intensities remain heuristic: nothing was tuned on set B.
* Known miss classes in set B: long-chain acid/ester/nitrile where the McLafferty ion should dominate the acylium or M-OH ion (octanoic acid, ethyl hexanoate, octanenitrile). Not changed: any intensity retune on these would be fitting to the set.

## Phase E: nomenclature
* New `nameEquivalence.mjs` (descriptor-sensitive; 28 tests incl. 12 different-molecule negatives). Re-scoring the exposed 52 cases, current engine: strict 43 correct / 8 abstained / 1 wrong-flagged (NM-14, a meso `(1R,2S)` vs `(1S,2R)` string mismatch of the same compound: comparator limit, conservative direction) / 0 confident-wrong. Frozen 9H rule: 33 correct (9I: 34).
* Root cause fixed: nicotine and its N-H analogue were named "3-1,4-diaminobutylpyridine" with High confidence (the ring guard let "diamino" count as a ring multiplier and ignored heterocycle stems); both now abstain. `nomenclature9j` tests.
* Still unsupported (abstain): biphenyl, diphenylamine, camphor/bicyclo, spiro, phthalic anhydride, quaternary ammonium, phenylhydrazine, nicotine-type biaryl heterocycles.

## Phase F: new evidence
Created: route-quality set (27), MS set B (8), strict nomenclature re-scoring, endo/exo and McLafferty parity checks. **No blind-generalisation claim**: independent authoring and a held-back final set were not available (same author for engine and cases), so no final holdout was frozen or run. Stage 9F/9H cases were not reused as untouched data.

## Phase G: verification
* Diels-Alder: the former "documented pre-existing failure" was a real stereo error; the endo rule now applies for activated dienophiles with an (E,E)-type diene, verified independently by SMILES parity (`dielsAlder9j`, 4 tests); the in-source stereo suite passes completely and its pin-the-failure assertion was tightened to `[]`.
* Real browser (headless Chrome, production build): `mechanismLiveCheck` 14/14, `reactionsStereoLiveCheck` 9/9, plus discovery probes of the new labels.
* Full suite: 1253 tests, 1247 pass, 0 fail, 6 todo (the 6 todos are the pre-existing known-gap markers; the Diels-Alder one now passes). `tsc -b` and production build succeed. Lint: 18 problems, the same count as Stage 9I, none in new code (files unchanged by this stage or pre-existing lines).
* Runtime/memory: selectivity battery of 7 reactions = 131-164 ms per pass (steady ~135), RSS 303 to 314 MB over 5 passes. No comparison run on the 9I commit was made, so overhead versus 9I is unmeasured; the added work is a few SMARTS matches per pathway plus one elimination enumeration per E2 pathway (cached).

## Remaining unsupported
Numeric selectivity ratios; E1/SN1 competition; solvent/temperature effects; crossed-aldol product sets; Friedel-Crafts thermodynamic isomerisation; MS intensities and long-chain McLafferty dominance; the nomenclature classes above; independent validation of any of this.
