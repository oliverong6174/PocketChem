# Stage 9B-1 before/after (observed results only; no accuracy claim)

Baseline: `baseline/9a0/observed-results.json` (budget 25 s). After: `results/9b1-after.json` (same runner, budget 25 s).
All reference answers are provisional (see `baseline/9a0/provenance.json`); none of this is reference-validated.

| Case | Best route before | Best route after | Time before -> after |
|---|---|---|---|
| C1 | hydration > PCC | same | 2.1 s -> 4.4 s (timing noise suspected; no refinement ran, route has no concerns) |
| C4 | FC acylation > Suzuki | same (step flagged "outcome not ranked": o/p isomers) | 0.9 s -> 8.9 s (refinement pass found nothing) |
| C5 | Sonogashira > Lindlar | same | 1.5 s -> 3.9 s |
| C7 | DIBAL > Heck > hydrogenation | same (Heck flagged unranked; DIBAL rule limitation shown) | 2.3 s -> 9.9 s |
| C8 | connectivity-only | same (epoxidation rule still "representative") | 1.7 s -> 2.1 s |
| C9 | dehydration > Heck > hydration | same (Heck flagged unranked; no alternative route exists: no Grignard-formation rule) | 1.4 s -> 7.9 s |
| C11 | anti-dihydroxylation > pinacol (target spelled CC(=O)CCCCCC) | hydration > PCC ranked first; pinacol route kept as #2 and flagged | 2.7 s -> 5.4 s |

## Stage 9B-1A (extra search only for documented concerns; canonical search roots)
Runtimes (ms, budget 25 s) 9A-0 / 9B-1 / 9B-1A: C1 2066/4422/3232; C4 882/8867/1779; C5 1523/3864/2731; C7 2280/9916/3280;
C8 1679/2064/2560; C9 1384/7915/2300; C10 1250/n.r./1895; C11 2694/5394/2425. Selected routes in 9B-1A equal 9A-0 except C11
(hydration > PCC, as in 9B-1). Timing is single-run and machine-dependent; differences of 1-2 s are within the noise seen in repeated runs.

## Pre-existing defects noticed while checking canonical search roots (not caused by them; same result with raw roots)
- (S)-butan-2-ol (`C[C@@H](O)CC`) -> butanone: no route is found, although racemic `CC(O)CC` -> butanone is found.
  The single-step oxidation rules produce no pathway for the stereo-specified alcohol.
- `[13CH3]CO` -> `[13CH3]C=O`: no route is found, although the one-step rule itself produces `[13CH3]C=O`.
