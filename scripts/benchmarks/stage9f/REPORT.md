# Stage 9F scientific validation report

Engine under test: 5023678 (src unchanged since 685f84b). Benchmark frozen at 010c807 before any engine run; cases, snapshots and manifest verified byte-identical to the freeze at holdout time. The holdout ran exactly once (holdout-lock.json, results/holdout-final.json). Before that run, no result file contained a holdout ID, so the holdout was untouched during development. Fixes were guided by development cases only.

Counts are correct/total (abstentions counted in the total) on `verified` cases; for synthesis, "found" = route found within 15 s (the summary key is `found`, not `correct`).

| Capability | Dev baseline (9E) | Dev after fixes | **Blind holdout** |
|---|---|---|---|
| Nomenclature, displayed name | 15/40 | 21/40 (13 abstained) | **17/27** (3 confident-wrong, 6 flagged-wrong) |
| Nomenclature, systematic name | 17/40 | 23/40 | **21/27** |
| Properties: formula / MW / exact mass / DBE / rings / charge | 10-12 of 12 | 12/12 | **17/18, 18/18 x5** |
| Properties: logP (±1.0) | 3/5 | 3/5 | **6/9** |
| Reactions: connectivity | 7/20 | 11/20 | **11/15** |
| Reactions: regiochemistry | 2/9 | 3/10 | **4/12** (5 abstained) |
| Reactions: ranking | 1/5 | 1/6 | **0/6** (all abstained) |
| Reactions: stereochemistry | 1/1 | 3/3 | **5/7** (2 incomplete) |
| Ranking: pairwise order | 4/18 | 4/18 | **7/24** (14 wrong, 3 abstained) |
| Synthesis: route found in 15 s | 0 correct-key (13 cases) | unchanged | **2 found, 1 timeout of 3** |
| Spectroscopy IR present / absent | 26/29, 30/31 | same | **23/23, 19/21** |
| Spectroscopy 1H count / 13C count | 23/31, 31/31 | 30/31, 31/31 | **22/25, 25/25** |
| Spectroscopy 1H / 13C shifts | 16/16, 10/10 | same | **10/10, 9/9** |
| MS molecular ion / M+2 | 30/30, 4/5 | same | **24/24, 3/3** |
| MS base peak / key fragments | 18/31, 9/31 | same | **11/25, 7/24** |

## Findings
* Strong and generalising: molecular formula/mass/DBE/charge, IR band presence, 13C counts and shifts, 1H shifts, molecular ion.
* Weak and generalising poorly: ranking order (7/24 on the blind set, with 14 wrong), MS base peak and fragments (heuristic, not simulation), reaction ranking (the engine abstains on every holdout case), synthesis route discovery (timeouts at the 45 s deadline on the inferred cases).
* Nomenclature improved on dev (15 to 21) and holdout (17/27) lands near the dev-after level, so the improvement is not clearly overfit. 3 confident-wrong names remain, which is the most important defect there.
* Development gains on ranking were small (4/18 to 4/18); the boiling-point tie-break fix is not visible in the dev score.
* The blind set is small (3 to 28 cases per capability); a difference of one or two cases is within noise. Inferred cases are reported separately and not in headlines.

## Limits
Authoring was model-generated (independent of PocketChem code, not of model error); spectroscopy cases were written by the main session and are less independent (see PROTOCOL.md). Several sources are secondary (Wikipedia). RX-24/25/26 forbidden entries may be over-strict and were left as frozen. These are heuristic engines; none of this validates them as experimentally exact. Offline behaviour was not part of this stage. No `npm test` rerun was done in this session, and the holdout cannot be rerun.
