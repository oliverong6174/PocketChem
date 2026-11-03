# Stage 9F benchmark protocol (frozen before any engine run)

Engine under test at freeze: the commit recorded in `manifest.json` (`engineCommitAtFreeze`, the Stage 9E engine, `src/` unchanged).

## What is frozen
`cases/*.json` (SHA-256 in `manifest.json`), `snapshots/*` (SHA-256 of each fetched source), the development/holdout partition, and the scoring rules in `run.mjs`. `run.mjs` refuses to start if a frozen case file's hash differs from the manifest.

## Partition (fixed before any run, hash rule, authors did not know it)
holdout iff `parseInt(sha256("stage9f-v1|" + id).slice(0,8), 16) % 5 < 2` (about 40%). Counts: see `manifest.json` `counts`.
The holdout is run once, at the end, with `run.mjs --set holdout --final`. The runner refuses if `src/` has uncommitted changes and writes `holdout-lock.json`, after which it refuses to run the holdout again. Holdout case content is not to be inspected during development; if one is seen or used to guide a fix it is permanently reclassified as development-guided.

## Authorship and its limits (stated, not hidden)
* reactions, nomenclature, properties, ranking, synthesis: written by delegated subagents that were told not to read the repository and to use only fetched sources; they saved the fetched text as snapshots. Cases a fetched source does not directly support are marked `evidence: "inferred"` and reported separately. Authoring is model-generated: it was independent of PocketChem's code, **not** of model error. A pre-freeze audit by the main session recomputed all property references with RDKit (all agree within the stated tolerances), checked 70 nomenclature names against the saved PubChem records (68 literally present; NM-02 downgraded to inferred), and read all 48 reaction cases for chemical sense (RX-11 downgraded to inferred because the page gives a rule and a homologous example only).
* spectroscopy: a subagent launch for this was refused by the permission system and was not retried. The main session authored it instead, mechanically: mass spectra (molecular ion, base peak, up to four peaks of at least 20% of the base, M+2 ratio for Cl/Br) are read from NIST WebBook JCAMP peak tables; IR present/absent bands are rows of a fetched LibreTexts IR table chosen by RDKit SMARTS; NMR environment counts are a Weisfeiler-Lehman topological symmetry calculation written for this benchmark; shift ranges are the few labelled rows of a fetched LibreTexts table. The molecule list was chosen by the main session, which had earlier read the repository's reaction code (not the spectroscopy code) during the Stage 9E audit. Spectroscopy independence is therefore weaker than for the delegated sets.
* The main session had read parts of the reaction engine before authoring began (Stage 9E audit). The reaction cases were written by a subagent without that knowledge.
* Several sources are Wikipedia or secondary pages (flagged in each source's `cite`/`says`); no primary paper was inspected.

## Scoring (fixed; every dimension reported separately, never merged)
* Only `evidence: "verified"` cases enter the headline denominators; `inferred` cases are run and reported in their own column.
* "abstained" (the engine declines or does not rank) is neither correct nor wrong.
* nomenclature: `name` = displayed name equals an accepted name after case/space/dash normalisation (correct / abstained when status is unsupported / wrong-flagged / wrong-confident when confidence is High); `constitutionName` ignores stereo descriptors.
* properties: formula exact; MW within 0.1; exact mass within 0.005; DBE, ring count, charge exact; logP within 1.0 of the experimental value.
* reactions: reagent tokens select the engine pathways that count; connectivity, regiochemistry (engine "major" vs expected), ranking, ambiguity (engine must not declare a major), stereochemistry (isomeric SMILES comparison, enantiomer-aware, meso-aware); negative controls are correct when nothing forbidden is offered; unsupported-expected cases score abstention.
* ranking: pairwise order agreement per case; ties must tie; unranked pairs abstain.
* synthesis: route found within 15 s, structurally verified, step count within the documented range, no forbidden intermediate.
* spectroscopy: IR present bands within 20 cm-1 of a table range, absent regions with no diagnostic peak; NMR environment counts exact, shift ranges within 0.3 ppm (1H) / 5 ppm (13C); MS molecular ion, base peak, key-fragment recall (strict: all listed fragments), M+2 ratio within 20%.
Harness errors (`harness-error`) are reported, not scored as chemistry.
Scoring-rule corrections made BEFORE the freeze (not after seeing any result): MW tolerance 0.05 -> 0.1 (a 1-decimal reference), negative-control handling, stereo-isomer forbidden entries and meso products.
