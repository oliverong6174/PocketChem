# Scientific scope and sources

Sources opened 2026-11-24:

- [RDKit Book: aromaticity](https://www.rdkit.org/docs/RDKit_Book.html#aromaticity): atom/bond flags, fused systems, electron contributions, exocyclic bonds and radical exclusions. The app uses its bundled toolkit; ring membership comes from JSON `rdkitRepresentation.atomRings`.
- [OpenStax Organic Chemistry 15.3](https://openstax.org/books/organic-chemistry/pages/15-3-aromaticity-and-the-huckel-4n-2-rule): cyclic conjugation and geometry are prerequisites; cyclobutadiene is a four-electron antiaromatic reference, while cyclooctatetraene adopts a nonplanar tub and is nonaromatic.
- [OpenStax 15.4: aromatic ions](https://openstax.org/books/organic-chemistry/pages/15-4-aromatic-ions): six-electron cyclopentadienyl anion and tropylium, related to removal of hydrogen from the saturated carbon of their neutral precursors.
- [OpenStax 15.5: aromatic heterocycles](https://openstax.org/books/organic-chemistry/pages/15-5-aromatic-heterocycles-pyridine-and-pyrrole): pyridine-type nitrogen contributes one p electron; pyrrole-type nitrogen donates a lone pair. One oxygen lone pair participates in furan.

Assumptions:

- RDKit supplies aromatic assignments. The supplemental electron table is bounded and withholds counts for unsupported environments. Fused systems count each unique atom once; no global Huckel test is imposed on arbitrary polycyclic graphs.
- Four-carbon cyclic dienes and five-carbon dienyl monocations are conditional planar singlet teaching models. A 2D structure does not establish spin, planarity, stability or reaction feasibility. The cyclopentadienyl cation label makes no ground-state claim.
- Nonaromatic never automatically means antiaromatic. Neutral eight-carbon cyclic tetraenes use the ordinary cyclooctatetraene nonplanar reference, with a warning that substitution/constraints can require further geometry evidence.
- Unsupported heteroatoms, exocyclic double bonds and radicals receive no fabricated electron totals. Mixed fused systems report individual ring flags and withhold a system total.
- Counterparts are structural comparisons, not reaction predictions. Initially only isolated all-carbon five-membered dienyl and seven-membered trienyl systems qualify; substituents and other components must remain unchanged. Fused, spiro, bridged, generic, radical and unsupported stereochemical cases are excluded.
- Edit cost: 4 times local bond-order changes + 2 times absolute hydrogen-count change + absolute formal-charge change. Heavy-atom connectivity and elements/isotopes are mandatory invariants. Initial edits change one ring carbon's charge and implicit hydrogen count; bond-order cost is zero. Equal-cost distinct structures remain selectable. Closest means only within the supported set.

Evidence from the existing bundled ChEBI index:

- CHEBI:28384 vitamin K: `*C1=C(C)C(=O)c2ccccc2C1=O`, `C11H7O2R`, no IUPAC name: a generic family.
- CHEBI:16374 menaquinone: variable formula `(C5H8)n.C11H8O2`, despite a finite representative SMILES. Variable source composition suppresses whole-family mass/DBE just as a wildcard does.
- CHEBI:18067 phylloquinone has concrete composition and stored stereochemistry, and the existing vitamin K1 alias. Suggestions require concrete composition and RDKit scaffold matching and never load automatically.
- No parallel database or vitamin-K-only exception. Suggestions use bounded prefix searches in the existing alias index followed by scaffold matching; some families will have no discoverable suggestions.
