# Stage 9L scientific correctness plan and decision ledger

Starting HEAD: `9ab60709f4154dbffd8bcc8adad8dd04f8170f94`.
Local branch: `stage9l-scientific-correctness`. No push; no Stage 9M.
User authorizes autonomous implementation and validated local milestone commits.

## Design and constraints

Use existing offline RDKit and molecular graphs. Preserve every Stage 9K file,
including predictions, answers, scorer and errata; never invoke its runner.
New checks are exposed development checks, never a repeated blind evaluation.
Preserve unrelated untracked files, dependencies, editor behavior and deadlines.

Alternatives considered: patching individual names/peak lists would overfit;
replacing the engines would disrupt compatibility. Choose shared graph identity,
conservative name comparison with explicit structural evidence, mechanism-derived
fragment coverage and explicit reagent metadata. Intensities remain heuristic.

## Tasks (test first, then implement, validate, commit)

- [ ] A: Independently read reports/raw evidence; classify every reported issue;
  capture read-only historical hashes and reproduce arithmetic without predictions.
- [ ] B: Add Stage 9L name comparator preserving descriptor/locant pairs and
  rejecting contradictory relative labels. Use RDKit identity when supplied
  independently resolved structures; test R/S, E/Z, meso, symmetry, mixtures,
  unspecified stereo and alternate SMILES. Exercise existing production target,
  reaction and saved-result semantics; change production only for proven defects.
- [ ] C: Trace sigma cleavage, diagnostic channels, rearrangements, merging and
  ranking. Add graph-derived secondary fragmentation/ring channels only with
  mass/charge bookkeeping and mechanism support. Test homologues, negative scope,
  fragment previews and normalization. Record improvements as development evidence.
- [ ] D: Replace arbitrary English element inference with explicit source
  metadata and conservative complete chemical-token parsing for legacy rules.
  Test legitimate reagents and misleading prose; distinguish replay, bookkeeping
  and chemical findings in a new saved-record reporting utility.
- [ ] E: Connect hydrogenation to existing syn machinery if atom mapping and
  tests support it; otherwise report explicit stereo limitations. Preserve
  existing centers and avoid assigning an unsupported face preference.
- [ ] F: Run focused checks, full tests, build, lint, offline-data checks and
  historical integrity verification. Review changes and record limits/handoff.

## Review focus

Partial stereo is not a racemate; a mixture cannot verify a pure target.
Meso identity follows symmetry, not ordered R/S letters.
Name lexing cannot resolve arbitrary chemical identity without a structure.
Fragment channels must conserve atoms and not draw a neutral as a charged ion.
English prose cannot authorize atoms in products; missing metadata stays explicit.

## Ledger

- Initial read-only Stage 9K delivery verifier passed all 1,012 hashes, 52 unique
  records, zero process failures. This did not execute any predictions.
- Ruling: work in the requested checkout on a new local branch, retaining existing
  installed dependencies; no duplicated worktree or dependency installation.
- Ruling: preserve original Stage 9J comparator/tests as historical methodology;
  add a versioned Stage 9L comparator rather than silently rewrite old scoring.
- Audit confirms 9K does not demonstrate a production name-generator failure:
  descriptor/locant loss occurs in Stage 9J's benchmark-only comparator.
