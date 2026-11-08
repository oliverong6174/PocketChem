# Stage 9L handoff for a fresh Claude Code session

Read [REPORT.md](REPORT.md), then [AUDIT.md](AUDIT.md),
[REVIEW.md](REVIEW.md), [ERRATA-HISTORICAL.md](ERRATA-HISTORICAL.md).

Starting checkpoint: `9ab60709f4154dbffd8bcc8adad8dd04f8170f94`.
Delivery branch: `stage9l-scientific-correctness`; local commits only, no push.
Exact milestone hashes are in the report; delivery commit is `git rev-parse HEAD`.

Done: locant/relative/mixture-sensitive new name comparator with optional
independent structure resolution; meso and incomplete-stereo identity fixes;
representation-invariant small-ring H2 syn templates and face-mixture accounting;
mass-balanced unranked EI candidates, impossible phenyl-ion guard and direct
channel dedup; authoritative reagent sources/conservative fallback; corrected
saved-record reporting; four saved engine version bumps.

Tests: 25 focused checks, 166 expanded regressions and 7 production-browser checks
pass. Build/TypeScript pass. Full suite retained: 1,266 pass / 3 fail / 6 TODO
(1,275 total). Three failures are the same estragole 45-s search scenario; one
starting-engine diagnostic also times out. No deadline/assertion relaxed. Lint
retains 18 pre-existing issues, with no new-code lint failures.
The full run started before the last review fixes; final targeted checks cover
the delivery tree, without another expensive full-suite run.

All old cases are exposed. New development coverage 2/17 → 17/17 counts possible
mechanism masses, including unranked candidates; it is NOT measured spectrum
accuracy or a base-peak gain. MS intensities remain heuristic; candidate abundance
and unique rearranged-ion structures are unknown. No numeric selectivity ratios
were invented. General arbitrary name parsing, broad hydrogenation face
preferences, complex ring fragmentation and exact reagent stoichiometry remain
unsupported. Old saved results are never silently recomputed.

Preserved: all original 9K files/answers/predictions, earlier evaluation records
and the original four unrelated untracked files. Run the read-only integrity check:
`node scripts/benchmarks/stage9l/verify-history.mjs` (1,012 hashes).
Do NOT run the locked Stage 9K evaluator or treat any old case as untouched.

Stage 9L is delivered for independent review. Do not begin Stage 9M without a
new user instruction. All task background processes have completed; ready for
`/clear`.
