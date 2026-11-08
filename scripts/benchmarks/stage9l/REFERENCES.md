# Scientific basis and limits

- [IUPAC Blue Book P-9](https://iupac.qmul.ac.uk/BlueBook/P9.html), especially
  P-91/P-93: descriptor-to-stereogenic-unit association and configuration.
- [RDKit Book](https://www.rdkit.org/docs/RDKit_Book.html): graph canonicalization,
  stereochemical representation, atom/bond stereo. The implementation uses the
  repository's bundled version, with descriptor behavior checked locally.
- [OpenStax Organic Chemistry 8.6](https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation):
  catalytic hydrogenation's syn relationship and possible face selectivity.
  No quantitative face preference is inferred for the new generic templates.
- Dampc, Możejko and Zubek, [Electron impact ionization and cationic fragmentation
  of pyridazine, EPJD 72, 216 (2018)](https://doi.org/10.1140/epjd/e2018-90474-2).
  The paper's assignments include HCN and N2 losses and secondary H loss.
  Its 100 eV abundance table is not a quantitative model for other EI conditions.
  [Accessible author-paper copy](https://www.academia.edu/48165257/Electron_impact_ionization_and_cationic_fragmentation_of_the_pyridazine_molecules).
- [QCEIMS study of purines and pyrimidines](https://pmc.ncbi.nlm.nih.gov/articles/PMC8779335/):
  EI HCN losses and limitations of computational fragment/abundance prediction.
- [Fingerprinting pyridine/benzonitrile fragments](https://pmc.ncbi.nlm.nih.gov/articles/PMC10510038/):
  direct ion spectroscopy and theory distinguish nominal-loss assignments from
  unique structures. This supports withholding a speculative fragment drawing.
- Borhani, [Some Studies on Mass Spectrometry of Organic Compounds, Glasgow thesis
  (1975)](https://theses.gla.ac.uk/78710/), printed pp. 48–49
  ([PDF pp. 57–58](https://theses.gla.ac.uk/78710/1/13803965.pdf#page=58)):
  isotope-labelled primary alcohols support water/ethylene loss and hydrocarbon
  fragments. Application to longer homologues and repeated ethylene losses is a
  mechanism-based candidate extrapolation, not measured abundance validation.
- [Electron ionization cross-section and fragmentation of α-cyclohexanedione
  (2012)](https://www.sciencedirect.com/science/article/abs/pii/S1387380611004180):
  accessible indexed abstract/text discusses successive ethylene/CO loss for the
  related cyclic-ketone comparison. Full publisher page returned 403; no claim
  of full-paper access. General ring-opening/CO/ethylene channels also follow
  established cyclic-ketone schemes in Gross, *Mass Spectrometry*, ch. 6.

The new generator's substituted azines, larger cyclic ketone and longer chains
are development extrapolations from these channels. They have no assigned
intensity, no unique claimed connectivity and no calibrated confidence score.
Existing McLafferty, alpha, benzylic and heteroatom cleavage rules were audited
and regression-tested; no molecule-specific abundance constants were fitted.

The original Stage 9K NIST JCAMP files are preserved, hashed, exposed diagnostic
evidence. They establish that particular masses were measured, without uniquely
establishing ion structures, universal electron energies or general accuracy.
