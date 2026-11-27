# Stage 9L independent interpretation of the exposed Stage 9K evidence

Starting checkpoint verified: `9ab60709f4154dbffd8bcc8adad8dd04f8170f94`.
Read the complete 9K report, manifests, raw saved MS/reaction/route records,
9K append-only errata and audit records; 9J report/errata/handoff and 9I/9H
reports. The read-only delivery verifier passed 1,012 historical hashes.
No frozen evaluation was rerun. All old cases are exposed.

| Reported issue | Interpretation and independent check | Action |
|---|---|---|
| Descriptor locants discarded | Genuine scoring defect: 9J comparator removes numbers before comparing R/S/E/Z. IUPAC P-91/P-93 bind descriptors to stereogenic units. | New production utility and versioned 9L tests; preserve historical comparator and scores. |
| Contradictory cis/trans accepted | Genuine scoring defect: early return when both CIP lists present. | Require relative consistency; only independently resolved full-name structures can prove redundant labels. |
| Meso negative test | Benchmark defect, not a production naming failure. Independent Python RDKit CIP and mirror canonicalization establish symmetry of butane-2,3-diol. | New graph-based positive/negative tests; do not rewrite old results. |
| 17/17 names, 7/7 parent masses | Supported only for these selected outputs/dimensions. Parent eligibility excludes weak/absent observed parents; mass accuracy does not establish visibility. | No repeated naming implementation or inflated claim. |
| MS base 6/11, strict fragments 2/10 | Real engine coverage and ranking limits: saved m/z arrays reproduce misses. Esters already contain rearrangement ions but rank acylium higher; cyclic ketone/diazines lack ring fragmentation; long alcohol lacks secondary dehydration channels. | New mechanistic candidates and structural validity checks; no fit of intensities to these cases. |
| Diazines contain m/z 77 phenyl preview | Additional engine composition defect: raw rows draw C6H5+ from C4H4N2. Functional-group label is too broad to authorize a phenyl fragment. | Require a carbon-only six-member aromatic subgraph. |
| MS confidence coverage/candidates | Reporting defect: obsolete `predicted` enum and reversed candidate-field name. Numeric outputs are not abstentions. Small correlated strata do not calibrate probabilities. | Versioned saved-record reporting with actual enum/field and eligible denominators. |
| Route 27 vs 29, replay attribution, Wilson | Reporting defects. 29 = 12 flag + 13 clear + 2 unsupported + 2 ambiguous. Replay is distinct from chemical/atom sourcing findings. | Append-only corrections beside preserved records; centralized new reporting. |
| Reagent words become elements | Genuine production provenance defect: parser recognizes initial symbols inside Catalytic/Compatible/Polar and explanatory notes. | Structured metadata plus conservative complete-token fallback; no parsing of prose notes or user labels. |
| LAH keto-alcohol route generated | Missing generation completeness; assessor correctly warns of competing ketone reduction. | Preserve warning, do not count generated connectivity as chemically complete. |
| RX-07 hydrogenation stereo | Genuine missing coverage: no syn profile on H2 rule, despite existing deuteration/stereo machinery. OpenStax 8.6 independently supports syn addition. | Test fresh cyclic and pre-existing-center substrates; add profile or explicit limitation as warranted. |
| RX-06 cyclooctene stereo | Molecular representation/reference limitation: unspecified geometry in a ring permitting cis and trans. Engine already warns. | No forced stereo assignment. |
| Five contaminated reagent filters | Benchmark defects, not proof of misconditioned engine chemistry. | Preserve frozen scores and disclose; do not rerun/rescore. |
| RX-07 racemic target wording | Benchmark metadata defect: cis target is meso, not racemic. | Preserve historical wording; use graph identity in development. |
| Diels–Alder endo correction | 9K independently supports the example and graph relationship; not quantitative selectivity or universal scope. | Do not repeat completed 9J development. |
| Unrelated original 9J commit file | Historical reporting issue, already corrected by amendment, independently recorded in Git audit. | Preserve unrelated untracked files. |

## Scientific boundaries

No new blind set is available. New tests and all changes are development validation.
NIST peak tables establish observed masses/abundances in particular records, not
unique ion structures or mechanisms. Nominal isobars and instrument dependence
limit assignments. New mechanisms without abundance support must remain unranked.
No numeric product ratios, broad selectivity retuning, global accuracy or
independent generalization claim is justified.

Sources: [IUPAC P-9](https://iupac.qmul.ac.uk/BlueBook/P9.html),
[RDKit stereochemistry](https://www.rdkit.org/docs/RDKit_Book.html),
[OpenStax hydrogenation](https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation),
and the original hashed NIST/reference files in Stage 9K.
