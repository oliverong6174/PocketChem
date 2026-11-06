# Stage 9J handoff

State: Stage 9J done on `stage9h-fresh-evaluation` (local commits, not pushed). Read `REPORT.md`, then `ERRATA-9J.md`.

* Done: qualitative SN2/E2, bulky-electrophile ortho penalty, condition-dependent primary Friedel-Crafts, aldol ketone-electrophile minor, acid epoxide alcoholysis keeps both regioisomers; beta-halo carbonyl check covers strong-base haloalkane rules; ring-count name guard (nicotine no longer mis-named); Diels-Alder endo fix (was a real defect); stereo-sensitive synonym equivalence; frozen route-quality set (27) and MS set B (8) with baselines preserved.
* Verified: full `npm test` 1253 tests / 1247 pass / 0 fail / 6 todo; `tsc -b`, production build OK; lint 18 (same as 9I); real-browser checks 14/14 and 9/9.
* Not done / limits: no independent or blind evaluation (same author); no numeric ratios; SN/E pathway label is not shown on the separate Reactions-page cards; MS intensities heuristic, only the `supported` base-peak label is empirically reliable; runtime overhead vs 9I commit not measured.
* Gotchas: Bash heredocs and the Edit/patch scripts strip backslashes (use the Write tool for regex-heavy patches); `cd` in Bash persists the cwd; a stray `git stash` is easy to run, check `git stash list`; source files use CRLF.
* Next milestone: have someone other than the engine author build and freeze a multi-capability case set (nomenclature, MS, selectivity, route quality), run it once, and keep the first-run report immutable.
