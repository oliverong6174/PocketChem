# Stage 9H handoff (start of next assignment after /clear)

State: Stage 9H evaluation complete and committed locally on branch `stage9h-fresh-evaluation` (not pushed). Engine unchanged from Stage 9G (`src` tree 767acf31). Read `scripts/benchmarks/stage9h/REPORT.md` first, then `PROTOCOL.md`.

* Frozen set: 280 cases, hashed in `manifest.json`, freeze commit b31356c. The blind run is DONE (`results/final-lock.json`); the set is now exposed and must not be reused as untouched data. Never rerun `run.mjs --final`.
* Raw records: `results/final-raw-*.jsonl`, `results/final-*.json`, `results/analysis.json` (from `node scripts/benchmarks/stage9h/analyze.mjs`).
* Headline: nomenclature 50%, properties 100% (MW/mass/charge), ranking 73% cases / 92% pairs, MS molecular ion 100% but base peak 33%, IR absent 100% / present 56% (partly my windows), reactions connectivity 83% but major/minor ranking 0/5, synthesis 6/6 found but several routes chemically questionable.
* Priority targets: see REPORT section 10. Any fix needs a NEW fresh set (use tools/ builders; sources: PubChem, NIST, OpenStax; Organic Syntheses is behind a bot check, do not bypass).
* Gotchas: bash heredocs strip backslashes (use the Write tool for regex-heavy files); curl and inline `node -e` fetches are hook-blocked, use script files; NMR has no independent reference yet.
* Stage 9I NOT started.
