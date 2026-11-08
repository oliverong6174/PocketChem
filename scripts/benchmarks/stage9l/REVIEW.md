# Fresh-context code review

A separate review agent read the plan, audit, changes and focused tests without
editing files, running frozen evaluations, or duplicating the full test suite.
Its small isolated probes found the following real defects in the initial draft:

| Finding | Correction and verification |
|---|---|
| Two-atom H2 templates depended on source SMILES ordering | Fully map each ring path and exocyclic neighbor; equivalent ring SMILES must yield only the same cis meso identity. Independent Python RDKit gives R/S for the explicit adjacent-tag product. |
| Two face products were not tracked as a mixture | Declare expected mixture; preserve distinct faces and prevent a pure-target claim. Symmetry deduplicates the single meso product. |
| Partial stereo was called an enantiomer pair | Query bundled RDKit for unknown atom centers and check potentially stereogenic internal C=C against assigned/constrained geometry. Unknown stereo prevents a pure-enantiomer assertion and racemate inference. |
| Radical input H bookkeeping used closed-shell valence | Exclude M RAD input from the narrow new candidate generator. |
| Carbon-only ring guard allowed C6H5+ from C6F6 | Require parent C/H composition as well as a carbon aromatic ring. |
| Prose donor lost its legitimate phosphate source | Add explicit phosphate and Hinsberg metadata; wholly unresolved provenance stays incomplete rather than contradicted. |
| Ion-only dedup discarded different graph cleavage sites | Preserve graph-site multiplicity; diagnostic descriptions are alternate estimates, not extra physical channels. |
| Saved reactions/workspaces lacked version bumps | Bump Reactions and Multi-Catalytic versions as well as Synthesis and Spectroscopy. Old data remain viewable and labelled earlier-version. |

Focused negative tests were observed failing before these corrections. Earlier
red/diagnostic logs are preserved separately from final verification logs.
Final read-only review reported **no remaining critical or important defects**.
This is code review, not independent experimental validation or held-out accuracy.
