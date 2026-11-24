# Properties dashboard implementation plan

Goal: implement the user's Stage 29B-1 specification in the existing checkout and stop for personal review after local commits.

Architecture: keep React, Ketcher, offline ChEBI, RDKit, the existing acid/base engines and Saved Analyses. Preserve imported provenance separately from structure-derived nomenclature, bound to canonical isomeric structure identity. Use RDKit's JSON ring information and aromatic flags; add only conservative, explicitly bounded electron interpretation and planar teaching cases. Use local molfile edits for counterpart candidates, validated again by RDKit.

Design decisions: wider two-column editor/results workspace, ordinary page scrolling, compact instruction line, identity above five result tabs. No column resizing initially: fluid columns avoid a second layout state and remain reliable at short heights. Existing vertical editor resizing is preserved. Compact metrics and selected acid/base site details replace repeated prose cards. Counterparts are previews with explicit apply/cancel and restoration of original KET and provenance. No unrelated redesign or push.

Execution: inline, authorized by the user's instruction to complete autonomously. The supplied specification is the design authority; additional design approval and worktree setup would conflict with that request and the named repository checkpoint. Heavy checks run sequentially.

1. [ ] Capture baseline with real name input, acetic acid/aspirin, vitamin K and complex molecule across requested layouts; inspect screenshots. Write identity regressions, observe failures, preserve provenance and exact isomeric identity, suppress invalid generic metrics, test persistence. Commit identity changes explicitly.
2. [ ] Replace tall onboarding and fixed-height results wrappers; implement metric rows, accessible tabs and selectable acid/base table plus detailed disclosure. Verify workflows and responsive geometry. Commit dashboard changes.
3. [ ] Write independently expected aromaticity cases; observe failures; implement RDKit ring-system reporting, fused/individual membership, bounded electron counts and geometry limitations; selectable highlights. Commit aromaticity changes.
4. [ ] Write counterpart validation/ranking tests; observe failures; implement isolated all-carbon 5/7-membered ring charge/H edits, preserve substituents/connectivity, validate candidates and expose ties; preview/apply/cancel/restore with stale-editor protection. Commit counterpart changes.
5. [ ] TypeScript, build, changed-file lint, focused scientific and organic/persistence regressions; production browser pointer/keyboard/tab/save/reopen checks and screenshots across all sizes/themes. Inspect images. Investigate relevant Stage 11/19 failures. Review diff, correct issues and write handoff with exact evidence, limitations, commits and screenshot index. Commit verification/documentation; verify Git and stash; no push.

Review focus: delayed editor events and equivalent redraws; stereoisomer and charge changes; generic atoms and misleading scaffold descriptors; fused aromatic bonds versus independent rings; candidate application after unsaved editor changes; restored provenance after navigation/reload. Each belongs in focused tests or the browser check.
