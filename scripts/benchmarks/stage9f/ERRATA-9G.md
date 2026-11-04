# Stage 9F errata and exposure notes, written in Stage 9G (append-only)

Nothing in `cases/`, `snapshots/`, `manifest.json`, `run.mjs`, `PROTOCOL.md`, `REPORT.md` or `results/*.json` was edited. `git diff 010c807 HEAD` on the frozen case, snapshot and manifest files is empty. These are corrections to how the original results should be read.

## 1. Holdout exposure
* The blind holdout was run exactly once, at engine `5023678` (`results/holdout-final.json`, `holdout-lock.json`). **It must not be described as untouched any more.** Its aggregate numbers (REPORT.md) were used to choose Stage 9G priorities.
* Stage 9G root-cause analysis read development records and development case files only (checked against the partition rule: every inspected ID is in `results/after-dev-candidate.json`, which holds no holdout ID). Individual holdout case contents were not read in Stage 9G. Stage 9G development gains are therefore **development-guided**, not independent generalisation.
* A freshly authored, separately frozen set was not produced (see `../stage9g/FRESH-SET-AUTHORING-BRIEF.md`).

## 2. Scoring and harness defects found (the engine was right or the metric was mis-specified)
| Case | Observation | Direct engine check |
|---|---|---|
| RX-02, RX-03, RX-08 (NaOMe/MeOH opens an epoxide) scored "abstained" | Reagent tokens `naome/methoxide/meoh` do not occur in the generic rule text `RO⁻` | RX-02: `COC(C)C(C)(C)O` (methoxide at the secondary carbon, as expected). RX-03: `epoxideRegio9f.test.mjs` covers methoxide at the terminal CH2 of styrene oxide. RX-08: only the SN2 product `C=CC(O)COC` is offered; SN2' is not modeled |
| RX-16, RX-20 "none ranked major" | The claimed-rule set includes rules matched only by generic tokens (`bromination`, `nitration`, `h2so4`): benzylic NBS/hv bromination, sulfonation, iodination. RX-20's ring bromination alone offers only the correct ortho-to-OMe product | RX-16 was a genuine gap (halobenzene ortho/para unranked) and is fixed in 9G for nitration of Cl and Br only |
| RX-14 "engine declares a major" | The harness lists the Williamson ether only if reagent molecules are supplied. With ethoxide supplied the engine offers `CCOC(C)CC` plus the E2 butenes; "major" applies only inside the E2 pathway (trans-2-butene over 1-butene) | SN2:E2 ratio is not modeled and not claimed |
| RX-24, RX-25, RX-26, RX-44 forbidden entries | The frozen "forbidden" lists contain real minor products (the unrearranged secondary bromide; the primary bromide in radical bromination). They stay as frozen | Engine continues to offer both, unranked or with a sourced fraction |
| Synthesis SY-03, SY-04, SY-10, SY-20 | The runner starts with `copies: 1`, but each target needs two molecules of one starting material | With `copies: 2` on engine `4dc32d0`: SY-03 found 1.6 s (1 step), SY-04 found 1.2 s (1 step), SY-10 found 2.1 s (1 step, case expects 2), SY-20 found 1.7 s (2 steps, case expects 3) |
| Synthesis SY-15 (phenol to paracetamol) | The acetylating reagent must be supplied as a species; with `Oc1ccccc1.CC(=O)OC(C)=O` a 3-step route is found in 16 s at a 45 s budget, so it misses the harness's 15 s budget | Search efficiency, not a missing rule |
| Synthesis SY-07, SY-09, SY-13, SY-17 | Not found at 15 s with 1 or 2 copies | Missing chemistry: benzilic acid rearrangement, pinacol coupling and rearrangement, Dieckmann/ketonic decarboxylation, acetoacetic ester route |

## 3. Supplementary readings (not replacements)
The original scores stay as recorded. Synthesis route discovery: 5/13 verified development cases found at `copies: 1` (as recorded). Four further verified cases (SY-03, SY-04, SY-10, SY-20) are found when the stoichiometry the chemistry requires is given; SY-10 and SY-20 are found as shorter routes than the case's step range, so they would score "shorter", not "within-range".

## 4. Engine used for the Stage 9G development run
`../stage9g/results/after-9g-dev.json`, engine `4dc32d0` (clean tree). Same runner, same frozen cases, development partition only.
