# Stage 9I handoff

State: Stage 9I done on branch `stage9h-fresh-evaluation` (local commits only, not pushed). Read `REPORT.md` first.

* Done: route-quality tier (`engine/routeQuality.ts`), nomenclature fixes + guards, McLafferty ions + base-peak certainty, 15-case NIST MS dev set (`ms-dev/`, baseline preserved in `results/baseline.json`, post-change in `results/after-fix.json`).
* Not done: reaction selectivity (Phase E) - no engine change; nothing new for major/minor ranking. Unsupported nomenclature: biphenyl, diphenylamine, bicyclo/spiro, phthalic anhydride, quaternary ammonium salts, fumaric/maleic acid.
* Saved-result versions: synthesis 2, spectroscopy 3 (old results flagged, not recomputed).
* Gotchas: Bash heredocs/`node -e` strip backslashes in regexes (use Write/Edit); synthesis search results vary with machine load (route chosen changes); pre-existing lint (~18) and a documented Diels-Alder depiction test.
* Next milestone: author a genuinely independent, frozen case set (nomenclature + MS + selectivity) by someone other than the engine author.
