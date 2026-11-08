# PocketChem Stage 9K: independent scientific evaluation and Stage 9J audit

Evaluation recorded 2026-11-06 UTC. Evaluator: Codex, separate from the Claude Code implementer. Repository: `<repo>`. No production chemistry or UI was changed; no push was attempted. This report consolidates the audit, frozen inventory, actual run, limitations and follow-up work.

## Findings that the evidence supports

The new run contains **52 unique cases**, attempted once each, with zero process errors and zero timeouts. **28 cases have direct database references; 24 are provisional textbook-rule applications.** Those evidence classes remain separate throughout. Naming succeeded on all 17 selected molecules; mass-spectrum molecular-ion m/z succeeded on 7 eligible references, while base peaks succeeded on 6/11 and complete key-fragment sets on 2/10. There is no global accuracy percentage.

Stage 9J's corrected Diels–Alder example has valid all-cis stereochemistry and independent teaching-source support. Its nomenclature comparator still has a demonstrable descriptor-locant defect. The route and MS reports contain count, attribution and confidence-summary discrepancies. The original final commit included an unrelated browser file; the amended commit correctly removed it.

The Stage 9K reaction harness also has limitations: five filters admit off-condition alternatives; one cyclooctene reference is underdetermined; a route annotation fails to isolate chemical findings. Frozen answers, code, scores and predictions have been preserved. These observations are append-only errata, not a replacement or a favorable rerun.

## 1. Verified starting state and scope

* Starting HEAD: `7f4cdc021790f1d047f96ff9f2c89352ba4c58ee`; branch `stage9h-fresh-evaluation`.
* Production `src` tree: `145051126e3c69d4dfd67d4a2cd6ace599cd1f23`.
* Initially there were no tracked changes. Existing untracked files: `CLAUDE.md`, `scripts/browser/stage9fLiveCheck.mjs`, `stage5-changes.patch`, `stage5-status.txt`. Their raw SHA-256 hashes were recorded and all four remain unchanged.
* `starting-state.json` was captured after the evaluator created its Stage 9K plan/scripts, so its porcelain status additionally includes this evaluator-owned directory; the original four-file state was observed before those writes and recorded in the frozen plan.
* Before freezing: read 9J REPORT, ERRATA and HANDOFF, existing 9H/MS protocols, schemas, scorers and adapter interfaces. No detailed reaction prediction logic was read and no PocketChem chemistry prediction was run. Molecular validation used standalone RDKit, without PocketChem imports. Detailed source inspection and deterministic 9J unit checks happened only after freezing.
* All new tracked files are under `scripts/benchmarks/stage9k/`. Existing tests and production files remain untouched. No worktree reset, cleanup, old holdout execution, dependency installation or push occurred.

## 2. Stage 9J audit

The append-only historical correction is [ERRATA-9J-AUDIT.md](ERRATA-9J-AUDIT.md); machine-readable arithmetic and probes are in [audit/records.json](audit/records.json). Original 9J artifacts remain unchanged.

### Route inventory, detection and intervals

`scripts/benchmarks/stage9j/route-quality/cases.json` contains **29**, not an unqualified 27: 12 flag, 2 not-supported, 13 clear, 2 ambiguous. The report's 27 is reconcilable as the non-ambiguous inventory. The handoff omits that qualification. Binary sensitivity and specificity denominators are 12 and 13.

In `scripts/benchmarks/stage9j/route-quality/results/third-run-harness-v2b.json`:

| Positive cases | Replay | Additional evidence | Correct attribution |
|---|---|---|---|
| F01–F04, F06, F12 | Verified | Chemical concern | Six chemical detections on structurally valid routes |
| F05 | Verified | No concern | Missed seeded positive |
| F07 | Failed | No other substantive finding | Replay-only rejection |
| F08, F09 | Failed | Unsourced atoms | Replay plus atom-bookkeeping detection |
| F10 | Failed | Friedel–Crafts concern | Replay plus chemical concern |
| F11 | Failed | Acid/base quench | Replay plus chemical incompatibility |

The report's statement that all five failed-replay cases were caught *only* by replay is therefore inaccurate. End-to-end rejection is 11/12; chemical findings on verified positives are 6/7. Across all 12 positives, ten have a non-replay substantive quality finding, but two are atom sourcing and two coexist with replay failure; do not treat this as an independent mechanistic validation sample.

The correct 95% Wilson interval for 11/12 is **64.6–98.5%**, rather than 62–98%. For 6/7 it is **48.7–97.4%**. False-positive rate 0/13 has Wilson upper bound **22.8%**, agreeing with the report's rounded 23%; specificity is 13/13, **77.2–100%**.

The first and second saved runs each retain a C10 false rejection and only 4/5 detected positives among verified routes; the third run has 6/7. These are different engine/harness states, not three independent repetitions. Target construction, selectivity propagation and the F06 engine correction changed which cases were eligible and detected. `first-run.json`, `second-run-harness-v2.json` and `third-run-harness-v2b.json` are all preserved. N01's propane-bromination label error remains in the frozen file and is disclosed in the original errata. No relabelling was performed here. Bare 9J conditions and seeded textbook judgments further limit interpretation as experimental sensitivity.

### Diels–Alder correction

The source change is `src/utils/stereochemistry/depictionEngine.ts:567`: for the supported activated-dienophile/same-face terminal-diene pattern, the electron-withdrawing branch is moved onto the same face as the diene-derived substituents. The audited (E,E)-hexa-2,4-diene + methyl acrylate product is a valid molecular stereoisomer, distinct from the previous exo diastereomer and its mirror.

This conclusion does not rest on wedge counts alone. [audit/diels-parity.py](audit/diels-parity.py) independently constructs a 2D hexagon, assigns three external dashed bonds and derives chirality with Python RDKit; the resulting graph equals the 9J expected molecule or its mirror and differs from the exo pair. [audit/diels-parity.json](audit/diels-parity.json) and [audit/all-cis-drawn.mol](audit/all-cis-drawn.mol) preserve that check.

Independent exact-example teaching support was located in [University of Shizuoka's Diels–Alder lecture, PDF page 15](https://w3pharm.u-shizuoka-ken.ac.jp/yakka/Japanese/manabeCLASS/yuki_2/2010_11_slides.pdf#page=15). Its top scheme depicts the two methyl groups and ester all on the same face. The PDF was saved and rendered locally; [audit/lecture-page-15.png](audit/lecture-page-15.png) was visually inspected. [OpenStax 14.5](https://openstax.org/books/organic-chemistry/pages/14-5-characteristics-of-the-diels-alder-reaction) supplies general endo-rule context. These support the depicted textbook preference, not a measured yield, exclusive endo product, numeric ratio or universal activated-dienophile rule. Four deterministic 9J Diels–Alder tests passed.

### Nomenclature comparator

`scripts/benchmarks/stage9j/nameEquivalence.mjs:31` removes the locant from each CIP/E/Z descriptor and compares only ordered letters. Ordinary R/S and E/Z opposites are rejected, but `(2R)-hexane-2,4-diol` and `(4R)-hexane-2,4-diol` incorrectly compare equal; `(2E)-hepta-2,4-diene` and `(4E)-hepta-2,4-diene` do too. These names specify different stereogenic units. [IUPAC Blue Book P-9](https://iupac.qmul.ac.uk/BlueBook/P9.html), especially P-91.2/P-93.4, requires descriptor-to-unit association. Nonascending descriptor-order probes are robustness evidence, not preferred IUPAC examples.

When both names have CIP groups, the comparator also ignores contradictory cis/trans prefixes. In the conservative direction, it rejects the equivalent meso `(2R,3S)` and `(2S,3R)` butane-2,3-diol names; the existing negative test incorrectly calls this a different-molecule pair. [PubChem's meso record](https://pubchem.ncbi.nlm.nih.gov/compound/220010) and molecular symmetry support the identity. The suite actually contains 13 positives and 15 negatives (28 total). All pass as written, so passing tests do not establish that every asserted negative is chemically valid. No test was weakened or edited.

### MS confidence arithmetic and denominator audit

Offline recomputation of the saved 9I after-fix and 9J-B baseline rows gives:

| Label | Pooled base peaks correct / N | Wilson 95% | Eligible strict fragments correct / N |
|---|---:|---:|---:|
| supported | 5/5 | 56.6–100% | 0/4 |
| heuristic | 2/9 | 6.3–54.7% | 3/9 |
| unreliable | 2/9 | 6.3–54.7% | 0/9 |

`scripts/benchmarks/stage9j/ms-dev-b/results/calibration.json` has correct categorical counts and rounded intervals. Its pooled eligible fragment denominator is **22**, so the report's strict 3/23 should be **3/22**. Set B's 6/6 parent m/z, 5/8 base peaks and 0/7 fragments are arithmetically correct.

`scripts/benchmarks/stage9j/ms-dev-b/run.mjs:52` still recognizes `predicted` as the committed label; it consequently records 0/0 committed and 8 uncertain despite four supported set-B rows. It reads `candidateBasePeaks`, while `src/utils/spectroscopy/massSpec.ts` exports `basePeakCandidates`; the historical stored nulls cannot validate candidate-set hit rates. These are harness/reporting faults, not experimental failures. All 23 pooled cases emitted a numeric base peak. The 5/23 supported-label coverage is correct, but the other 18 are weaker confidence, not numerical abstentions. The 15 tuned-on 9I rows and small pooled categories cannot establish general calibration; this is stratified accuracy, with no numeric probability calibration measured.

### Git and historical integrity

The reflog preserves original checkpoint 3 `4218536dd9522d81808957af8d01c048b4ba4b9c`. It included the unrelated `scripts/browser/stage9fLiveCheck.mjs` (188 lines). Amendment `7f4cdc021790f1d047f96ff9f2c89352ba4c58ee` removes exactly that file; its remaining four files are three 9J documents and the related stereo assertion update. The current untracked browser file and original committed file have the same Git blob `e06566f2cb7556fbc9301ec896d8465d356e8207`. No unrelated file remains in the amended final commit; the original did inadvertently include one. Other 9J changed paths were inspected and relate to that stage's code, tests or evidence. See [audit/git-history.txt](audit/git-history.txt) and `audit/records.json.git`.

`git diff 7763b44 7f4cdc0 -- scripts/benchmarks/stage9f scripts/benchmarks/stage9h scripts/benchmarks/stage9i` is empty. All **740** pre-9K files under 9F/H/I/J still match their starting SHA-256 hashes. Older frozen ground truth and results were neither modified nor rerun.

## 3. Fresh case inventory, reference quality and freeze

The author knew the previously reported failure categories. Expected answers were derived from external records and explicit textbook chemistry, never PocketChem predictions. The evaluator is independent of the implementer, but selection is purposive and model-authored; it is not blind, random or independent of model error.

66 prospective cases yielded 65 authored candidates after one PubChem R-2-chloropentane lookup failed. A structural screen then excluded 13 exposed primary constitutions, leaving **17 nomenclature + 11 MS + 13 reaction + 11 route cases**. The screen covered 497 JSON files and 629 unique exposed constitutions across 9F/H/I/J, including snapshots but excluding result directories. Stereo was removed before reparsing/canonicalization. Shared reagents do not count as overlap; product overlap is separately recorded. Homologues, paired stereoisomers, shared internal molecules and familiar reaction families remain correlated.

All 52 primary constitutions passed the exclusion rule. [overlap.json](overlap.json), [case-exclusions.json](case-exclusions.json), [source-exclusions.json](source-exclusions.json) and [reference-check.json](reference-check.json) preserve selection and molecular checks. The independent Python validation parsed 85 molecular entries, checked canonical round trips and verified all MS formulas against PubChem. Case identifiers retain gaps rather than hiding exclusions.

**A (28 cases):** exact PubChem name/structure records and NIST EI peak tables. **B (24 cases):** novel-molecule applications of explicit general OpenStax rules; these lack direct exact-case experimental validation and are excluded from A accuracy. RX-06 additionally proved underdetermined. No directly accessed primary experimental paper is claimed for the new set. This is a material limit on the requested breadth of externally validated chemistry, not 52 experimental validations.

Every case's full structures, conditions, expected result, source URL/hash, quality, criteria and uncertainty are in [cases.json](cases.json). [PROTOCOL.md](PROTOCOL.md) and [scoring.mjs](scoring.mjs) define the per-case criteria. Reference files, candidate records, authoring scripts, scoring, adapters and protocol were committed before any prediction.

* Freeze commit: `03e017bdb9992cffbe1706f0f646d07820ef80c0`.
* Engine commit: `7f4cdc021790f1d047f96ff9f2c89352ba4c58ee`; src tree `145051126e3c69d4dfd67d4a2cd6ace599cd1f23`.
* Freeze timestamp: `2026-11-06T17:50:40.465301+00:00`.
* `manifest.json` SHA-256: `bf0318cc2c10def54f542a143438d8ce72521a8f7317fa031bd1bd4cc38f178a`.
* `cases.json` SHA-256: `ae21474e89642f5740a2516252c10989a1248cf802e044e596b65c62a8976378`.
* Raw run `results/raw.jsonl` SHA-256: `2eae939152a1a481578007e51064aa163fec0406f263f743ae6e9233f209895e`.
* Frozen-scoring output SHA-256: `badeb68f4ac9a5cdd509e16682671d7829490a52b43b792176d55fa773bd4285`.
* [manifest.json](manifest.json) covers 118 pre-run files by raw bytes; local `.gitattributes` disables newline conversion. [EVIDENCE-HASHES.json](EVIDENCE-HASHES.json) covers 150 post-run evidence files. The manifest deliberately does not hash itself. No frozen file changed after predictions.

### Complete inventory

The source link on every row identifies the independently checkable record or textbook chapter; the saved source file and its raw hash are recorded in the case. B expectations are explicit evaluator extrapolations, not source claims of an experiment on that exact molecule.

| ID | Kind / evidence | Molecule or assessment | Frozen criterion(s) | Reference |
|---|---|---|---|---|
| NM-01 | nomenclature / A | 2,3-dimethylpentane | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/11260) |
| NM-02 | nomenclature / A | 3-ethylhexane | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/12096) |
| NM-04 | nomenclature / A | 3-methylhexan-2-one | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/102846) |
| NM-05 | nomenclature / A | 4-methylhexan-2-one | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/7754) |
| NM-06 | nomenclature / A | 2,2-dimethylbutanoic acid | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/11684) |
| NM-07 | nomenclature / A | 3,3-dimethylbutanoic acid | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/14057) |
| NM-08 | nomenclature / A | 2-ethylbutanoic acid | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/6915) |
| NM-09 | nomenclature / A | ethyl 2-methylbutanoate | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/24020) |
| NM-10 | nomenclature / A | methyl 3-methylpentanoate | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/519891) |
| NM-11 | nomenclature / A | N-ethylpropanamide | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/521324) |
| NM-12 | nomenclature / A | N,N-dimethylbenzamide | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/11916) |
| NM-13 | nomenclature / A | 3-bromobenzoic acid | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/11456) |
| NM-15 | nomenclature / A | 3-methoxybenzoic acid | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/11461) |
| NM-16 | nomenclature / A | 2-aminobutan-1-ol | molecularIdentity, nomenclature | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/22129) |
| NM-17 | nomenclature / A | (S)-2-chloropentane | molecularIdentity, nomenclature, stereochemistry | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/24884244) |
| NM-18 | nomenclature / A | (E)-hept-3-ene | molecularIdentity, nomenclature, stereochemistry | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/5357259) |
| NM-19 | nomenclature / A | (Z)-hept-3-ene | molecularIdentity, nomenclature, stereochemistry | [PubChem](https://pubchem.ncbi.nlm.nih.gov/compound/5357258) |
| MS-04 | ms / A | pyridazine | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C289805&Index=0&Type=Mass) |
| MS-05 | ms / A | pyrimidine | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C289952&Index=0&Type=Mass) |
| MS-06 | ms / A | pyrazine | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C290379&Index=0&Type=Mass) |
| MS-07 | ms / A | cycloheptanone | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C502421&Index=0&Type=Mass) |
| MS-09 | ms / A | 2-nonanone | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C821556&Index=0&Type=Mass) |
| MS-10 | ms / A | nonanal | basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C124196&Index=0&Type=Mass) |
| MS-11 | ms / A | methyl heptanoate | basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C106730&Index=0&Type=Mass) |
| MS-12 | ms / A | ethyl heptanoate | molecularIon, basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C106309&Index=0&Type=Mass) |
| MS-14 | ms / A | nonanenitrile | basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C2243278&Index=0&Type=Mass) |
| MS-15 | ms / A | 1-decanol | basePeak, keyFragments | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C112301&Index=0&Type=Mass) |
| MS-17 | ms / A | tripropylamine | molecularIon, basePeak | [NIST EI](https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C102692&Index=0&Type=Mass) |
| RX-01 | reaction / B | non-1-ene ionic HBr | connectivity, regiochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/7-8-orientation-of-electrophilic-additions-markovnikovs-rule) |
| RX-02 | reaction / B | dec-1-ene hydroboration | connectivity, regiochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/8-5-hydration-of-alkenes-addition-of-h2o-by-hydroboration) |
| RX-03 | reaction / B | vinylcyclopentane hydroboration | connectivity, regiochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/8-5-hydration-of-alkenes-addition-of-h2o-by-hydroboration) |
| RX-04 | reaction / B | undec-1-ene ionic HBr | connectivity, regiochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/7-8-orientation-of-electrophilic-additions-markovnikovs-rule) |
| RX-06 | reaction / B | cyclooctene anti bromination | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/8-2-halogenation-of-alkenes-addition-of-x2) |
| RX-07 | reaction / B | 1,2-dimethylcycloheptene syn hydrogenation | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation) |
| RX-08 | reaction / B | oct-3-yne Lindlar reduction | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/9-5-reduction-of-alkynes) |
| RX-09 | reaction / B | oct-3-yne dissolving metal reduction | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/9-5-reduction-of-alkynes) |
| RX-10 | reaction / B | chiral 2-bromohexane cyanide inversion | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction) |
| RX-11 | reaction / B | chiral 2-bromoheptane iodide inversion | connectivity, stereochemistry | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction) |
| RX-12 | reaction / B | 2-bromooctane small-base E2 | connectivity, regiochemistry, majorMinorRanking | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-7-elimination-reactions-zaitsevs-rule) |
| RX-13 | reaction / B | 2-bromononane small-base E2 | connectivity, regiochemistry, majorMinorRanking | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-7-elimination-reactions-zaitsevs-rule) |
| RX-14 | reaction / B | 1-bromoheptane cyanide homologation | connectivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction) |
| RQ-01 | route / B | decanal reduction | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction) |
| RQ-02 | route / B | branched ketone reduction | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction) |
| RQ-03 | route / B | methyl nonanoate full reduction | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/21-6-chemistry-of-esters) |
| RQ-04 | route / B | ortho-toluic acid esterification | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/21-6-chemistry-of-esters) |
| RQ-05 | route / B | primary nonyl cyanide substitution | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction) |
| RQ-06 | route / B | ethyl decanoate full reduction | routeSpecificity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/21-6-chemistry-of-esters) |
| RQ-07 | route / B | unprotected bromopropanol Grignard | routeSensitivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-8-protection-of-alcohols) |
| RQ-08 | route / B | unprotected bromobutanol Grignard | routeSensitivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-8-protection-of-alcohols) |
| RQ-09 | route / B | keto ester LAH retains ketone | routeSensitivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction) |
| RQ-10 | route / B | long keto ester LAH retains ketone | routeSensitivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction) |
| RQ-12 | route / B | aminobenzoate Friedel Crafts acylation | routeSensitivity | [OpenStax](https://openstax.org/books/organic-chemistry/pages/16-3-alkylation-and-acylation-of-aromatic-rings-the-friedel-crafts-reaction) |

## 4. Actual execution and scientific scores

The single run started **2026-11-06T18:21:25.558Z** and ended **18:23:06.039Z** (~100.5 s including process startup). Execution HEAD was the freeze commit; production source was the declared 9J tree. Configuration: Node **v24.21.0**, Windows, one isolated process per case, concurrency 1, hard deadline 45,000 ms per case, one attempt. There was no prediction shakedown on these cases and no retry. [results/RUN-LOCK.json](results/RUN-LOCK.json) was created before case execution. [results/raw.jsonl](results/raw.jsonl), per-case `.json`/`.log` files and [audit/evaluation-console.log](audit/evaluation-console.log) preserve calls, full predictions and process outcomes. All 52 child exits were zero; no error, timeout or unsupported-case result was omitted.

The public listing interface does not take solvent/temperature parameters. The frozen adapter supplies structural cyanide, iodide or ethoxide where declared, then filters pathway metadata. It makes no target-dependent fallback call. Routes use a real planner-shaped step when generated, otherwise submit the seeded route manually, then assess replay, compatibility, selectivity and quality. Route replay is an intended verification operation, not a favorable retry.

All 17 emitted names matched frozen accepted names; independent identity resolution used the frozen database pairs, so **zero post-prediction network lookups** were needed. Scoring ran once into a separate file. A read-only diagnostic recomputation matched every stored dimension and every raw/per-case object; it did not replace any score.

### A: directly reference-validated dimensions

| Dimension | Correct / fixed N | Rate | Wilson 95% | Other outcomes |
|---|---:|---:|---:|---|
| molecularIdentity | 17/17 | 100.0% | 81.6%–100.0% | None |
| nomenclature | 17/17 | 100.0% | 81.6%–100.0% | None |
| stereochemistry | 3/3 | 100.0% | 43.9%–100.0% | None |
| molecularIon | 7/7 | 100.0% | 64.6%–100.0% | None |
| basePeak | 6/11 | 54.5% | 28.0%–78.7% | 5 wrong |
| keyFragments | 2/10 | 20.0% | 5.7%–51.0% | 8 wrong |

Naming identity and lexical correctness are two views of the same 17 outputs, not independent replications. The three stereo-name cases cover one tetrahedral example and an E/Z pair. Molecular-ion scoring applies only to the seven references whose parent peak is at least 1% of the reference maximum; the four exclusions are weak/absent experimental parents, not engine abstentions. The 7/7 tests m/z bookkeeping, not parent intensity or observability.

Strict key-fragment correctness is 2/10. Across 28 selected key peaks, **11/28 (39.3%)** are present in the prediction. This micro recall is descriptive; peaks within the same molecule are dependent. The strict metric excludes the library base peak by design, so a correct key-fragment set does not imply a correct base peak.

| Case | Molecule | Library base m/z | Predicted base m/z | Confidence label | Key peaks present / N |
|---|---|---:|---:|---|---:|
| MS-04 | pyridazine | 80 | 80.037 | supported | 0/3 |
| MS-05 | pyrimidine | 80 | 80.037 | supported | 0/2 |
| MS-06 | pyrazine | 80 | 80.037 | supported | 0/2 |
| MS-07 | cycloheptanone | 68 | 112.089 | heuristic | 0/3 |
| MS-09 | 2-nonanone | 43 | 43 | supported | 2/3 |
| MS-10 | nonanal | 57 | 44 | heuristic | 1/3 |
| MS-11 | methyl heptanoate | 74 | 113 | heuristic | 3/3 |
| MS-12 | ethyl heptanoate | 88 | 113 | heuristic | 3/3 |
| MS-14 | nonanenitrile | 41 | 41 | heuristic | 2/3 |
| MS-15 | 1-decanol | 70 | 31 | unreliable | 0/3 |
| MS-17 | tripropylamine | 114 | 114 | supported | n/a |

New-set confidence stratification (kept separate from the development-guided 9J pool):

| Label | Base peaks correct / N | Wilson 95% | Label coverage |
|---|---:|---:|---:|
| supported | 5/5 | 56.6%–100.0% | 5/11 |
| heuristic | 1/5 | 3.6%–62.4% | 5/11 |
| unreliable | 0/1 | 0.0%–79.3% | 1/11 |

The five supported predictions include three related diazines. Their 5/5 cannot establish general reliability; heuristic 1/5 and unreliable 0/1 are too small to order confidently. These are categorical outcome rates, not calibrated probability estimates. All 11 cases emit a numeric base peak: numerical abstention is **0/11**, while supported-label coverage is **5/11 (45.5%)**.

### B: provisional textbook-rule applications

These frozen figures are not part of the A reference-validated evaluation. Reaction filters and RX-06 qualifications below further limit them.

| Dimension | Correct / fixed N | Rate | Wilson 95% | Other outcomes |
|---|---:|---:|---:|---|
| connectivity | 13/13 | 100.0% | 77.2%–100.0% | None |
| regiochemistry | 6/6 | 100.0% | 61.0%–100.0% | None |
| stereochemistry | 4/6 | 66.7% | 30.0%–90.3% | 2 incomplete |
| majorMinorRanking | 2/2 | 100.0% | 34.2%–100.0% | None |
| routeSpecificity | 6/6 | 100.0% | 61.0%–100.0% | None |
| routeSensitivity | 5/5 | 100.0% | 56.6%–100.0% | None |

Connectivity means reference constitutional product occurrence, not correctness of the entire offered product set. Regiochemistry also examines the frozen forbidden/minor alternatives and declared major labels. The two major/minor cases compare E2 constitutional products for homologous substrates; this does **not** independently validate SN2-versus-E2 pathway competition, ratios or solvent/temperature dependence.

Relative reaction stereochemistry is 4/6, with two incomplete outputs and no assigned-wrong stereoisomer observed by this scorer. RX-08/09 give the requested Z/E alkenes; RX-10/11 propagate SN2 inversion. RX-06 is underdetermined rather than a demonstrated engine chemical failure. RX-07 is the substantive omission: syn hydrogenation of 1,2-dimethylcycloheptene returns stereo-unspecified `CC1CCCCCC1C`, without a stereo limitation warning. Its cis target is meso; the frozen `racemic` metadata is imprecise but canonical mirror identity makes no change to the score.

The seeded route results require attribution beyond the 5/5 tier-based sensitivity:

| Route cases | Expected label | Replay | Chemical finding | Tier result |
|---|---|---|---|---|
| RQ-01–RQ-06 | Clear (6) | All verified | No rejecting concern | Four chemically-supported, two plausible-incomplete |
| RQ-07, RQ-08 | Flag (2) | Failed | Acid/base quench | Contradicted |
| RQ-09, RQ-10 | Flag (2) | Verified | Competing ketone reduction | Known-concern |
| RQ-12 | Flag (1) | Failed | No substantive chemical finding | Replay-only contradicted |

Thus **end-to-end sensitivity 5/5** includes one replay-only detection. **Chemical-finding sensitivity is 4/5**, Wilson **37.6–96.4%**; on verified positive routes alone it is **2/2**, **34.2–100%**. Specificity is **6/6**, **61.0–100%**; false-positive rate is **0/6**, upper bound **39.0%**. All six negatives are structurally verified. Route verdict coverage is 11/11, structural replay passes 8/11, and four of six clear routes reach chemically-supported. This assesses small seeded one-step routes, not multistep synthesis discovery, optimality, yield or general route quality.

### Coverage, abstention and benchmark/harness failures

Output coverage: names 17/17; numeric MS base peaks 11/11; reaction-family products 13/13; route tiers 11/11. There are no explicit naming abstentions, unresolved names, timeouts or execution errors. Reaction stereo completeness is 4/6 with 2/6 incomplete; those incomplete values remain in the fixed denominator. Low MS confidence and route plausible-incomplete are reported as such, not silently converted into numerical abstentions or successes on unasked dimensions.

[ERRATA-9K.md](ERRATA-9K.md) records four post-freeze limitations without editing ground truth:

1. **K-01, filter contamination (five cases):** RX-01/RX-04 admit dibromocyclopropanation because CHBr3 matches HBr; RX-06 admits hydrobromination and NBS chemistry; RX-08/RX-09 admit deuteration alternatives. These arise from the frozen adapter regexes, not from an engine conditioned on the wrong reagent. Preserve the frozen B scores, but do not claim clean condition-specific 13/13 reaction accuracy. No rescored replacement is supplied.
2. **K-02, underdetermined input:** RX-06 uses `C1=CCCCCCC1` without E/Z geometry and assumes the cis-cyclooctene trans-dibromide result. Distinct [cis](https://webbook.nist.gov/cgi/cbook.cgi?ID=C931873) and [trans](https://webbook.nist.gov/cgi/cbook.cgi?ID=C931895) NIST records establish why that assumption matters. The engine explicitly discloses insufficient alkene geometry. This is a reference/input limitation, not a proven chemical error.
3. **K-03, annotation defect:** frozen `routeQualityOnly.nonInfoFindings` includes replay/support/incomplete findings because its exclusion uses obsolete codes. Primary tier scores are unaffected; `results/diagnostics.json` separately classifies concern/contradiction with replay/atom bookkeeping excluded.
4. **K-04, meso metadata:** RX-07's racemic wording is imprecise. Its target equals its mirror; no result was relabelled or rescored.

## 5. Scientific defects and differences from development-guided findings

* **Confirmed comparator defect beyond 9J's repair:** locants are discarded even though descriptors survive. This can accept distinct partially specified stereochemical identities, and contradictory relative labels can also compare equal. This is benchmark/scoring code, not the production name builder. It is a new specific defect; the 17 new production names themselves are correct.
* **Newly documented hydrogenation stereo omission:** RX-07's product lacks the expected cis relationship and a caveat. `src/utils/reactions/families/alkenes.ts:105` defines the hydrogenation SMARTS without a syn stereo profile; raw output confirms the omission. [OpenStax 8.6](https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation) supplies the syn-addition basis. This is incomplete stereochemical specification, not a wrong assigned diastereomer. It remains B evidence rather than exact-case experimental validation.
* **Independent MS failures on new molecules:** cycloheptanone predicts parent 112 as base instead of observed 68 and misses all three selected keys. The three diazines have correct parent/base 80 yet miss all seven combined selected fragment peaks. 1-Decanol predicts base 31 instead of 70 and misses all three keys. Nonanal predicts 44 instead of 57. Methyl/ethyl heptanoate predict 113 instead of 74/88 while their selected non-base key peaks pass. These exact-library discrepancies are reproducible from saved records; they demonstrate fragmentation/abundance limitations despite reliable mass arithmetic.
* **Replicated, not newly discovered, class limitation:** long-chain ester/alcohol behavior extends the earlier 9I/9J heuristic-intensity concerns to new constitutions. Do not describe every homologous miss as a novel mechanism. Nonanenitrile succeeds on base 41, showing that failure is not uniform across long-chain classes.
* **New reagent-provenance defect:** saved route findings mention cobalt for Grignard conditions, calcium for catalytic esterification, sulfur in LAH reductions and phosphorus for polar aprotic conditions. `src/utils/reactions/engine/routeQuality.ts:132` parses capitalized English words as element symbols, e.g. `Catalytic` → Ca and `Polar` → P; `reagentNote` also enters that parser at line 192. These are incorrect provenance statements. The same permissive set could mask atom-sourcing issues, but no additional masked-reaction experiment was run or claimed.
* **Generation versus assessment remain distinct:** RQ-09/RQ-10 produce the keto-alcohol retaining a ketone under LAH, and the quality layer flags competing reduction. This independently replicates the value of the advisory check, without validating the generated product as the chemically complete outcome.

Compared with earlier findings, the new names are easier, predominantly acyclic or singly aromatic structures; they do not reproduce the exposed 52-case nomenclature mix. MS strict fragment selection is a new explicit top-three threshold, so 2/10 here and 0/7 in 9J are not directly comparable effect sizes. Route positives probe familiar failure families with new substrates and more explicit conditions. No old holdout was rerun. New independent authorship and one frozen run improve provenance, but do not remove selection bias, scaffold correlation, incomplete interfaces or uncertain textbook extrapolation.

## 6. Uncertainty and limits

All reported intervals are nominal 95% Wilson binomial intervals with fixed denominators. They represent small sample sizes, not random sampling or independent chemical families. Homologous E2 examples, three diazines and paired E/Z names reduce effective diversity. A 2/2 ranking result still has a 34.2% lower bound; 5/5 supported base peaks has a 56.6% lower bound. There is no numeric confidence calibration, primary-paper reaction-yield validation or validated global selectivity ratio.

The exact-reference set is only 28 cases; the remaining 24 are provisional, and one reaction input is underdetermined. The finite nomenclature synonym list would penalize unlisted valid names, although none occurred here. NIST spectra are single library records; downloaded JCAMP files do not establish electron energy, so this report does not repeat the earlier blanket 70 eV claim. Parent scoring excludes weak/absent reference parents and measures m/z only. Key-fragment recall is not precision: extra predicted fragments are not penalized by that criterion.

The reaction listing API cannot encode all declared conditions. Five filter errors prevent a strong condition-specific product-set conclusion. Route checks are seeded one-step assays, not end-to-end synthesis-route quality in diverse chemistry. The independent source-backed Diels–Alder audit validates the example's molecular relationship; it does not experimentally validate the broad correction under every substrate and condition.

## 7. Prioritized follow-up for Claude Code (no fixes implemented here)

1. **Preserve stereogenic-unit identity in the synonym comparator.** Compare descriptor/locant pairs, handle optional unique locants conservatively, reject contradictory relative labels and correct the meso negative test. Use structural identity for supported synonym classes where possible. Do not modify old frozen score files.
2. **Propagate hydrogenation's syn stereochemistry or explicitly abstain.** Connect the rule to the existing stereo machinery by atom provenance; cover a fresh cyclic substrate and existing-center behavior. Treat RX-07 as exposed development evidence now.
3. **Improve MS coverage before broad intensity tuning.** Address cyclic-ketone and diazine fragments and long-chain alcohol/aldehyde channels; preserve mass/charge validity. Use current cases for development only and commission a new independently frozen set for any transfer claim. Avoid fitting a universal base-peak constant to these few spectra.
4. **Replace English-text element inference with structured reagent-source metadata.** Keep warnings explicit when atom provenance is unknown; add diagnostic checks for words such as Catalytic, Compatible and Polar. The demonstrated bogus messages should not count as reliable atom sourcing.
5. **Repair reporting/calibration tooling.** Use actual confidence enum values and `basePeakCandidates`, separate numerical abstention from weak confidence, compute each eligible denominator and Wilson interval centrally, and report replay-only, bookkeeping and chemical detections separately. Append historical errata rather than rewriting original records.
6. **Strengthen independent evaluation interfaces and future harness checks.** Bind exact rule IDs/reagent requirements, reject isotope/light/peroxide mismatches with synthetic metadata checks, accept explicit condition data and specify cyclic alkene geometry. Fix the 9K annotation only in a separately versioned future harness; retain this frozen run. Extend future route testing to multistep routes and new incompatibility families.

## 8. Verification, local commits and final Git status

Relevant deterministic checks: six Stage 9K scorer checks passed; existing `nameEquivalence9j` (28) and `dielsAlder9j` (4) passed, **32/32**. The latter are unit/regression checks, not executions of older frozen holdouts. Independent graph/parity and molecular-reference checks passed. No existing assertions were weakened.

`npm.cmd run build` (TypeScript build plus Vite production build) completed with actual native exit **0**. The existing large-chunk warning remains. PowerShell initially blocked the npm script shim and then treated warning stderr as an error record; the native-shell verification and all logs are preserved. These were build-launcher checks, not chemistry retries. No full old test battery, lint sweep, browser test or search benchmark was run. See [audit/ENVIRONMENT-NOTES.md](audit/ENVIRONMENT-NOTES.md), [audit/build-native.log](audit/build-native.log), [audit/build-exit.txt](audit/build-exit.txt), [audit/deterministic-checks.log](audit/deterministic-checks.log), [audit/scorer-checks.log](audit/scorer-checks.log).

Read-only verification checks **1,012 hashes**: 118 frozen files, 150 evidence files, 740 historical files and four unrelated files. It also checks 52 unique raw records, zero execution failures, matching scorer outputs and the unchanged production src tree. The repository-wide log ignore rule required explicitly staging only the 57 Stage 9K logs; they are committed and covered by the evidence hash manifest.

Local commits created in this assignment:

* `03e017bdb9992cffbe1706f0f646d07820ef80c0` — test: freeze independent Stage 9K scientific benchmark before evaluation
* `3c10ca96de01e23669f5c8f5402804dda16a10ee` — test: preserve Stage 9K single-run results and independent Stage 9J audit evidence
* `c5cacd73a201a309acdb2f297edf6707b6c16deb` — test: retain complete Stage 9K execution and build logs
* Delivery report commit — `HEAD` at delivery, subject **docs: consolidate Stage 9K independent scientific validation report**. A report cannot embed its own Git object hash without changing that hash; resolve this final entry with `git rev-parse HEAD`. Its exact hash is also supplied in the final handoff message.

Final delivery status, checked with `node scripts/benchmarks/stage9k/verify-final.mjs --delivery`: no staged or unstaged tracked changes; exactly the original four unrelated untracked paths remain:

```text
?? CLAUDE.md
?? scripts/browser/stage9fLiveCheck.mjs
?? stage5-changes.patch
?? stage5-status.txt
```

No production chemistry correction, UI change, historical benchmark rewrite or push was performed. All observations needed for subsequent Claude work are preserved in this report and its linked evidence. The run is locked; further scientific corrections or a new evaluation belong to a separate assignment.
