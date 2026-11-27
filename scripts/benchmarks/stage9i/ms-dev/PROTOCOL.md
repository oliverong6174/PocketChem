# Stage 9I mass-spectrum development set (frozen before any engine run on it)

Purpose: measure whether Stage 9I mass-spectrum changes help on compounds that were not Stage 9H or Stage 9F cases. This is a **development set**, not a blind holdout: the author is also the evaluator, and the Stage 9H failure classes (alkyl halides, alcohols, ethers, nitriles, esters) decided which compound classes were sampled. No compound here was a Stage 9H or 9F case (excluded by constitution in `tools/msDevSet.mjs build`).

Source: NIST Chemistry WebBook, 70 eV EI JCAMP-DX spectra (saved verbatim under `snapshots/`, SHA-256 in `manifest.json`), structures from PubChem, formula agreement NIST vs PubChem required. Compounds whose NIST name lookup returned a non-spectrum entry (2-hexanol, propanenitrile, acetophenone, diethylamine, ethylbenzene) or a formula mismatch (toluene, p-xylene) were dropped, not replaced.

Cases: 15 (`cases.json`). Scoring is the unchanged Stage 9H `scoreMS`: molecular ion m/z (only when NIST shows >= 1 % at M), base-peak m/z (rounded, exact), key fragments (up to four peaks >= 20 % of base, present within 0.5 m/z). Relative intensities are not scored.

Run order: (1) freeze this protocol, cases and snapshots in one commit; (2) run the unmodified Stage 9G/9I-checkpoint-2 engine once (`results/baseline.json`); (3) change the engine; (4) run again (`results/after-fix.json`). Cases are never edited after step 1.

Limits: n = 15 means one case is 6.7 points; intervals are very wide. Single library spectra vary between instruments. Passing here shows development progress only.
