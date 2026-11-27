# History rewrite manifest (2026-11-27)

The development history after the last published commit was rewritten once, before it was first pushed.
Previously published commits and remote branches were not changed.

| Item | Value |
|---|---|
| Original base (published, unchanged) | `0e65cdf48b5bac88bbb7990c5a51ba8c88df3ff9` |
| Original HEAD | `f24c921d663eaeb8e858855f9dc1d3d11a15200f` |
| Cleaned HEAD (rewrite of the original HEAD) | `a011db575eb814a08b5d2a25e3e19d641ea72bf4` |
| Commits before / after | 214 / 214, same order |
| Original to cleaned hashes | [commit-map.tsv](commit-map.tsv) |

Commits that follow the cleaned HEAD add notices, ignore rules, this manifest and the handoff.

## What changed

1. **Third-party reference material removed from every rewritten commit** (739 files). These were downloaded
   copies of other people's publications and database records, kept only as benchmark inputs.

   | Source | Files |
   |---|---|
   | NIST Chemistry WebBook spectra | 282 |
   | PubChem records | 303 |
   | OpenStax textbook modules and pages | 70 |
   | Wikipedia article text | 32 |
   | LibreTexts, course pages, a pKa compilation and a PMC article extract | 32 |
   | Organic Syntheses procedure text | 11 |
   | University lecture PDF and page images | 9 |

2. **Local absolute paths replaced** in 23 benchmark reports, handoffs, logs and one report script.
   The repository root reads as `<repo>` (or `.\` in shell commands) and the user folder as `<home>`.
3. **Automatic `Co-Authored-By: Claude` trailer removed** from 197 commit messages.

Nothing else changed. Author and committer names, emails, dates and time zones are identical, as are all
messages apart from that trailer. `src/`, tests, benchmark scripts, case files, results and reports were not
altered beyond the path replacements. No commit was dropped or left empty. Nine commits at or before the
published base still carry the trailer.

## Reading old references

Documents, result files and some benchmark scripts quote original commit hashes. Look them up in
`commit-map.tsv` (match on the leading characters). Source trees (`<commit>:src`) are identical before and
after. Scripts that require an exact old commit hash need the private backup of the original history.

## Optional local benchmark inputs

The removed files are not needed to build, run or test the application. Some benchmark authoring, verification
and scoring scripts read them. The paths below are git-ignored; place local copies there to use those scripts.
Do not commit them. A re-download can differ from the original bytes, so frozen SHA-256 manifest checks only
pass with the original archived copies.

| Local path under `scripts/benchmarks/` | How to obtain |
|---|---|
| `stage9f/snapshots/` | Source URLs are recorded in `stage9f/manifest.json` and `stage9f/cases/` |
| `stage9h/snapshots/` | `stage9h/tools/fetchCompounds.mjs`, `fetchIR.mjs`, `fetchMS.mjs`, `fetchRanking.mjs`, `fetchWiki.mjs`, `fetchOpenstax.mjs` |
| `stage9i/ms-dev/snapshots/` | `node stage9i/tools/msDevSet.mjs fetch` |
| `stage9j/ms-dev-b/snapshots/` | `node stage9j/tools/msDevSetB.mjs fetch` |
| `stage9k/references/` | `stage9k/fetch-references.py` |
| `stage9k/audit/` (PDF, page images) | `stage9k/audit-fetch.py`, then `stage9k/audit/render-pdf.ps1` |

Each source's own terms apply to anything retrieved.
