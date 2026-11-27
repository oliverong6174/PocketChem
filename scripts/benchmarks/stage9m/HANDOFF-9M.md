# Stage 9M handoff

Branch `stage9l-scientific-correctness`, from `9612881`. Nothing pushed. Stage 9N not started.

## What was added (all ordinary ReactionSMARTS rules on the existing engine; no new handler)
* `families/expansion9m.ts`: Wacker-Tsuji, ring-closing metathesis (5-8), Mitsunobu (secondary inversion + primary), benzilic acid (acyclic + ring contraction), pinacol coupling, ketonic decarboxylation, Dieckmann (5-7), and (via `activeMethylene9m.ts`) executable acetoacetic/malonic ester alkylation and hydrolysis-decarboxylation.
* `families/expansion9m2.ts`: heteroarene (furan/thiophene/pyrrole) alpha bromination, acylation, Vilsmeier-Haack, nitration; Claisen-Schmidt condensation and crossed aldol addition with a non-enolizable aldehyde.
* Structural partners are user-supplied (`supplyMode: user-structure`); scope (single-heteroatom rings, ketone donors, non-enolizable aldehydes, primary halides) is enforced in SMARTS.
* Tests: `expansion9m.test.mjs` (80), `expansion9m2.test.mjs` (20), `synthesisDemos9m.test.mjs` (9, incl. automatic convergent search).
* Changed one existing assertion: `synthesisSelectivity.test.mjs` 1-heptene/octene -> methyl ketone now selects the one-step Wacker route (still no unranked step; hydration route must not outrank it).

## Known limits
No numeric ratios; no beta heteroarene products; E/Z of enones unassigned; unsymmetrical ketone alpha sites unranked (user must choose an outcome); RCM/Dieckmann ring sizes fixed; Mitsunobu limited to acidic pronucleophiles. Citations in REFERENCES.md were recalled, not re-read.
Pre-existing estragole 45 s deep-search timeouts persist (Stage 9L); not investigated here.
