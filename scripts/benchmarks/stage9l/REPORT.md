# PocketChem Stage 9L — scientific correctness improvements

Development validation only. All Stage 9F/H/I/J/K cases are exposed. No frozen
evaluation was rerun, and no independent generalization result is claimed.

## Starting checkpoint and audit interpretation

Verified HEAD `9ab60709f4154dbffd8bcc8adad8dd04f8170f94`, initially on
`stage9h-fresh-evaluation`; no tracked changes and the same four unrelated
untracked files. Work is local on `stage9l-scientific-correctness`; no push.
Read-only verification checks all 1,012 historical hashes and unchanged Stage
9K files. No original predictions, frozen answers, scores or errata were edited.

[AUDIT.md](AUDIT.md) classifies every reported issue. In particular, the locant
comparator defect belongs to benchmark methodology; 17/17 new production names
do not demonstrate a naming-generator failure. MS misses establish real missing
channels and weak abundance ranking. Cyclooctene geometry is underdetermined,
five reagent filters are contaminated, and the meso target's racemic wording is
imprecise. These do not justify speculative chemistry corrections. Stage 9J's
Diels–Alder correction was already supported and was not repeated.

## Stereochemical correctness

The original comparator discarded descriptor locants, ignored contradictory
relative labels and rejected a symmetry-equivalent meso pair. The new versioned
name comparator preserves descriptor/locant associations, descriptor case and
relative/mixture qualifiers. Independently resolved complete-name structures are
compared by bundled RDKit canonical molecular identity; unresolved lexical cases
remain conservative. Arbitrary systematic name parsing is not claimed. The old
scorers and their recorded outputs remain unchanged.

Production identity now ignores atom-map labels only in its comparison copy,
rejects calling a meso structure its own enantiomer, and requires sufficient atom
and alkene stereo specification before asserting a pure enantiomer pair.
Unknown pre-existing centers prevent the achiral-face racemate shortcut. R/S,
E/Z, enantiomers, diastereomers, meso symmetry, partial/unspecified stereo,
mixtures, isotopes and equivalent SMILES are tested. Pure synthesis targets
cannot be certified from a reported stereoisomer mixture. KET/source structures
and saved snapshots retain their existing fidelity paths.

## Mass spectrometry

The audited pipeline comprises general graph sigma cleavage, diagnostic SMARTS,
McLafferty rearrangements, merging/normalization, parent promotion and categorical
base-peak labels. Missing diazine/cyclic-ketone/long-chain secondary channels are
distinct from ester rearrangement ions already present but ranked too low.

Changes:

- New mass-balanced, singly charged **unranked composition candidates** cover
  supported alcohol dehydration/secondary cleavage, aldehyde secondary channels,
  simple cyclic-ketone ring opening/ethylene/CO loss, and azine HCN/N2 channels.
  Their scope excludes unsupported isotopes, radicals, charges, polycycles and
  inappropriate chain environments. No unique ion structure or new quantitative
  abundance is invented. The UI lists them separately from chart peaks.
- A phenyl diagnostic requires a six-carbon aromatic subgraph and sufficient
  parent C/H composition; aromatic labels cannot create C6H5+ from C4H4N2 or C6F6.
- General and diagnostic descriptions of one direct-cleavage ion no longer add
  duplicate abundance. Distinct graph cleavage sites keep their multiplicity.
  Existing heuristic weight constants were not fitted to spectra.
- Unknown-abundance competing candidates downgrade a supported chart-base claim
  to heuristic. Existing unreliable calls remain uncertain; numeric output is
  distinguished from numerical abstention.

[development-results.json](development-results.json) compares original source at
the starting checkpoint with the new code on seven separate development
molecules. Selected mechanism-mass coverage rises from **2/17 to 17/17**, counting
existing chart peaks and new unranked candidates. This is not experimental
fragment accuracy, not a new strict-fragment score and not a base-peak accuracy
gain. The original Stage 9K 6/11 and 2/10 figures remain historical results.
McLafferty eligibility/mass, alpha cleavage, benzylic/allylic and heteroatom
channels have regression coverage; broader intensity prediction remains limited.

## Route-quality methodology and production correction

[ERRATA-HISTORICAL.md](ERRATA-HISTORICAL.md) appends corrections without rewriting
history. New saved-record reporting centralizes eligible denominators, Wilson
intervals, real confidence enums/field names, numerical abstention and detection
attribution. It does not execute a chemistry engine.

Stage 9J has **29** cases: 12 positives, 13 negatives, 2 unsupported, 2 ambiguous.
Combined detection is **11/12** (Wilson 64.6–98.5%); chemical findings are **8/12**,
including **6/7** verified positives. Two other positives have atom bookkeeping;
F07 alone is replay-only. Final false positives are **0/13**, upper Wilson bound
22.8%. Prior configurations remain separate. N01 remains a disclosed label error.
Stage 9K combined 5/5 includes one replay-only finding; chemical findings are 4/5.
Pooled old MS fragments are 3/22; supported fragments 0/4. All 23 old pooled
predictions are numerical, with zero numerical abstentions; supported coverage
is 5/23. Historical null candidate fields cannot prove candidate-set success.

The demonstrated production defect was English words being parsed as element
symbols. The assessor now accepts authoritative structured source metadata or
complete chemical tokens, excludes explanatory notes/saved labels, preserves
real formula/abbreviation handling, and explicitly marks wholly unresolved
provenance incomplete. Phosphate/Hinsberg donors have explicit metadata.
Presence-only legacy reagent inference still does not establish atom-transfer
stoichiometry; H/O and exact reagent quantities retain prior assessment limits.

## Reaction selectivity and compatibility

Hydrogenation now assigns the supported syn relationship for tetrasubstituted
endocyclic alkenes on fully mapped, saturated, nonfused 5–7 member ring paths.
Equivalent SMILES produce the same meso identity where symmetry applies;
pre-existing centers survive, and distinct face outcomes form an explicit
mixture without unsupported ranking or a pure-target claim. Other geometries,
large/bridged rings and face preferences retain an explicit limitation.

Epoxide, Friedel–Crafts, substitution/elimination, aldol and regioisomer rules
were reviewed and regression-tested. Stage 9K supplies no new clean evidence
for quantitative ratios or broader rankings in these families. Alternatives and
uncertainty remain; no speculative retuning was added. The LAH keto-ester
generation/assessment distinction remains an acknowledged coverage limitation.

Saved results remain snapshots and are never silently recomputed. Engine
versions advance for Spectroscopy (4), Synthesis (3), Reactions (2) and
Multi-Catalytic (2), so earlier results retain the existing earlier-version label.

## Verification, performance and limits

| Gate | Actual result |
|---|---|
| New scientific checks | 25/25 passed; final descriptor/report checks 10/10; final MS checks 7/7 |
| Expanded stereo, chemistry and persistence regressions | 166/166 passed (`review-regressions.txt`) |
| Full `npm test`, one run | 1,275 tests: 1,266 pass, 3 fail, 6 pre-existing TODO; 774 s |
| TypeScript / production build | `tsc -b` and Vite production build pass, native exit 0; both entry points preserved; existing large-chunk warning |
| Full lint | Existing 18 issues: 16 errors, 2 warnings. Final changed-file lint has only 3 existing SpectroscopyPage errors and its existing warning; no new-code lint issue remains. |
| Real browser, production build | 7/7 pass; external HTTPS blocked; candidates/uncertainty, workspace reload, H2 scope/meso label, zero uncaught exceptions |
| Historical integrity | 1,012 hashes pass; Stage 9K Git diff empty; no predictions executed by verifier |
| Offline data | Bundled ChEBI header verified v3; full local input/persistence tests and browser calculation use local assets; no runtime network dependency added |
| Git whitespace | Source/documentation checks pass; raw validation transcripts preserve tool-output whitespace via local attributes |

The three full-suite failures all belong to the existing estragole deep-search
scenario: the compatibility ordering assertion, route-before-45-s assertion and
starting-material-order assertion. An isolated current-engine check also hit
45 s. A single starting-engine source-overlay check at `9ab6070` likewise hit
45 s and returned zero routes (`baseline-search-result.json`). This reproduces
the limit at the starting checkpoint; it does not prove universal runtime
equivalence. No deadline or assertion was relaxed, and no expensive full suite
was repeated. The original failing full log is retained.
The full run began before the last review corrections; final focused and
expanded regressions cover those corrections. It is not presented as a fresh
full-suite run on the exact delivery tree.

The first browser harness attempt had CSS-capitalization and post-reload page
navigation assumptions. These were corrected in the harness; the failed record
is preserved. The temporary browser profile was moved to the repository's
dependency cache to prevent Vite watching transient locked browser files. A
native subprocess wrapper records actual build exit codes because PowerShell
can turn warning stderr into an error record. These are harness/environment
corrections, not chemistry retries or favorable benchmark replacement.

Final seven-molecule timing comparison: 35 warm samples per version, alternating
ordering, median full-spectrum time **24.85 → 26.98 ms**; p95 **76.94 → 124.55 ms**.
Candidate generation median **1.18 ms**, p95 **5.70 ms**; process RSS about 381 MB.
Initial timing evidence is also preserved (47.44 → 55.35 ms medians), illustrating
environment variance. These descriptive samples mix structures and do not
establish a general overhead distribution. Search deadlines remain 45 s.

[REVIEW.md](REVIEW.md) records fresh-context review and corrected draft defects;
final review found no remaining important code issues.

[REFERENCES.md](REFERENCES.md) links the independently checked stereochemical,
ion-fragmentation and isotope-labelling evidence, with access and extrapolation
limits. Development channel coverage and code review do not supply a new
independent experimental holdout. Remaining weak areas include quantitative MS
intensities, unique rearranged-ion structures, broader cyclic/fused fragmentation,
general name-to-structure parsing, partial-stereo chemical ensembles, numeric
reaction selectivity and unresolved route search/coverage limits.

## Local milestone commits and delivery

- `dfa2e11b79c54ae9fdd4509468f02282746dafe6` — audit and initial stereo identity.
- `a61a5ab47cc1774b7c00fca941d19e170b68c0a1` — unranked EI channels, conservation and uncertainty.
- `4fcdf6d3227bdcdc4f52fb77d5058ea6428923e4` — route provenance and reporting methodology.
- `0dc535f6aabf88a693c66f1622535c2c9febf523` — final stereo purity, H2 and saved versions.
- Final documentation/evidence delivery commit: resolve with `git rev-parse HEAD`;
  its exact hash is supplied in the final handoff message. Embedding a commit's
  own hash in its content would change that hash.

Final status: no staged/unstaged tracked changes; only the original unrelated
untracked `CLAUDE.md`, `scripts/browser/stage9fLiveCheck.mjs`,
`stage5-changes.patch`, `stage5-status.txt`. No push. No Stage 9M work.
Recommended next milestone: independent scientific review of this diff and its
limited scope, then a separately authored/frozen holdout if transfer accuracy is
needed. The estragole deadline limitation warrants a separate performance task;
do not relax deadlines to obtain a pass.
