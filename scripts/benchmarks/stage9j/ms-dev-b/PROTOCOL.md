# Stage 9J mass-spectrum development set B (frozen before any engine run on it)

Purpose: a second development set, disjoint from Stage 9F, 9H and 9I compounds (excluded by constitution in `tools/msDevSetB.mjs build`), to measure whether the Stage 9I McLafferty / certainty-label work transfers to compounds it was not tuned on, and to calibrate the certainty labels on a larger sample.

Honest scope: NOT a blind holdout. The author is also the evaluator and the engine author, the compound classes were chosen to include McLafferty/alpha-cleavage/benzylic cases after seeing Stage 9I, and the compound list was fixed before fetching (drops are rule-based: no NIST spectrum, formula mismatch, already seen). Set B was never looked at before the baseline run, so Stage 9I engine changes were not tuned on it; any change made after the baseline run IS development-guided and is reported separately.

Source: NIST Chemistry WebBook 70 eV EI JCAMP-DX (saved verbatim under `snapshots/`, SHA-256 in `manifest.json`); structures from PubChem; formula agreement required. Scoring is the unchanged Stage 9H `scoreMS`.

Order: (1) freeze in one commit; (2) run the unmodified Stage 9I engine once (`results/baseline.json`, immutable); (3) any engine change; (4) rerun (`results/after-fix.json`). Cases are never edited after step 1.
