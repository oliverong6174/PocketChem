/**
 * Stage 28: evidence records for the atomic-structure, bonding/geometry and molecular-orbital laboratories. Same three separate
 * questions as evidence27.ts (kind, source status, calculation status) and the same validator; kept in its own registry so the
 * Stage 27 manifest, which pins the Stage 27 records, stays accurate.
 *
 * `checks` entries have the form "<test file prefix>:[<test tag>]" and name a test in scripts/tests/<prefix>28.test.mjs
 * (atomic28, bonding28, mo28); a Stage 28 platform test confirms that each tag really appears in that file.
 *
 * Nothing here is a certification. "Source-verified" is used only where retrieved text was compared item by item.
 */
import type { EvidenceRecord, EvidenceSource } from "./evidence27";

const RET = "2026-11-24";
const OS = (page: string, title: string, covers: string): EvidenceSource => ({ title: `OpenStax Chemistry 2e, ${title}`, ref: `openstax.org/books/chemistry-2e/pages/${page}`, retrieved: RET, covers });
const NIST_PT: EvidenceSource = {
  title: "NIST Handbook of Basic Atomic Spectroscopic Data, per-element Atomic Data tables (hydrogen to krypton)",
  ref: "physics.nist.gov/PhysRefData/Handbook/periodictable.htm", retrieved: RET,
  covers: "ground-state configuration of the neutral atom and of the singly charged ion for the 36 elements (ions: all except H and Ti, which have no usable second entry)",
};
const NIST_CONST: EvidenceSource = {
  title: "NIST Fundamental Physical Constants, complete listing (2022 CODATA adjustment)", ref: "physics.nist.gov/cuu/Constants/Table/allascii.txt", retrieved: "2026-11-23",
  covers: "h, c and e (exact in the SI), read in Stage 27",
};

export const EVIDENCE28: readonly EvidenceRecord[] = [
  {
    id: "gc-quantum-orbitals", model: "Quantum numbers and hydrogenic orbitals (1s, 2s, 2p, 3s, 3p, 3d)", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The quantum-number rules, the orbital and electron counts per subshell and shell (2l+1, 2(2l+1), n², 2n²) and the radial-node rule n − l − 1 were compared with OpenStax Chemistry 2e 6.3. The closed-form radial functions and spherical harmonics were NOT compared with a retrieved text (the MIT OCW 5.111 lecture-note page was opened, but its PDF was not read); they are checked by independent mathematics instead.",
    calc: "independently-checked",
    checks: ["atomic28:[valid]", "atomic28:[capacity]", "atomic28:[shell]", "atomic28:[nodes]", "atomic28:[normalization]", "atomic28:[expectation]", "atomic28:[radial nodes]", "atomic28:[probability peaks]", "atomic28:[real basis]", "atomic28:[complex basis]", "atomic28:[angular nodes]", "atomic28:[parity]", "atomic28:[enclosure]"],
    conditions: ["Nonrelativistic Schrödinger equation, point nucleus of charge Z, one electron, infinite nuclear mass.", "Lengths in bohr radii a₀ (a₀/Z for charge Z)."],
    assumptions: ["The sign (phase) of ψ is a mathematical property and is not electric charge; only |ψ|² is a probability density.", "Real orbitals (p_x, d_xy, …) are equal-weight combinations of ±m_l complex functions: a choice of basis, not eigenstates of L_z.", "The 90 % surface is estimated on a bounded 3-D grid and its enclosed probability is a numerical estimate."],
    scope: "Exact one-electron orbitals for six orbitals, used to explain shapes, nodes and radial distributions.",
    unsupported: ["Orbitals with n > 3 or l > 2.", "Any atom or ion with more than one electron: the orbitals of many-electron atoms are not these functions.", "Relativistic, spin–orbit and reduced-mass effects."],
    sources: [OS("6-3-development-of-quantum-theory", "6.3 Development of Quantum Theory", "quantum numbers, orbital counts, radial-node rule")],
    quantitative: true,
  },
  {
    id: "gc-hydrogen-spectra", model: "Hydrogen-like energy levels, photon energy and spectral series", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "Only the constants h, c and e (exact SI values, NIST listing read in Stage 27). The Rydberg energy 13.605 693 eV was entered from CODATA 2018 and was not re-compared with a retrieved table in Stage 28; the level formula E_n = −Ry·Z²/n² is a textbook result and was checked against the Rydberg wavelength formula, not against measured spectra.",
    calc: "independently-checked",
    checks: ["atomic28:[constants]", "atomic28:[levels]", "atomic28:[Balmer]", "atomic28:[Balmer visible set]", "atomic28:[Lyman, Paschen]", "atomic28:[absorption and emission]", "atomic28:[Z scaling]", "atomic28:[invalid input]"],
    conditions: ["One-electron species only (H, He⁺, Li²⁺, Be³⁺), levels n = 1 to 10.", "Visible region taken as 380 to 750 nm (a conventional approximation)."],
    assumptions: ["Infinite nuclear mass: hydrogen's real lines are about 0.054 % shifted (reduced mass).", "No fine structure, hyperfine structure, Lamb shift or relativistic correction; wavelengths are vacuum values of the idealised model."],
    scope: "Level diagrams and the wavelength, frequency and energy of the photon for a chosen transition in the ideal one-electron model.",
    unsupported: ["Spectra of any atom with more than one electron.", "Line intensities, selection rules and line widths."],
    sources: [NIST_CONST], quantitative: true,
  },
  {
    id: "gc-config-atoms", model: "Ground-state electron configurations of the neutral atoms, Z = 1–36", kind: "reference-data", source: "source-verified",
    sourceCovers: "All 36 neutral-atom configurations, compared one by one with the NIST per-element tables, including chromium (3d⁵4s¹) and copper (3d¹⁰4s¹). OpenStax Chemistry 2e 6.4 gives the same two exceptions and the Madelung filling order.",
    calc: "independently-checked",
    checks: ["atomic28:[NIST ground states]", "atomic28:[Aufbau exceptions]", "atomic28:[electron counts]", "atomic28:[unpaired electrons]", "atomic28:[orbital boxes]"],
    conditions: ["Gas-phase ground state of the neutral atom.", "Subshells written in order of increasing n, as in NIST tables (3d before 4s)."],
    assumptions: ["The Aufbau (Madelung) order is a model: it is shown next to the observed configuration and is wrong for Cr and Cu within Z ≤ 36.", "Orbital boxes are drawn with Hund's rule (parallel spins first); that is a model of the ground state, not a measurement."],
    scope: "Observed ground-state configurations, noble-gas abbreviations, unpaired-electron counts and box diagrams for the first 36 elements.",
    unsupported: ["Elements beyond krypton.", "Excited-state configurations as data (a student-built excited configuration is only identified as not the ground state)."],
    sources: [NIST_PT, OS("6-4-electronic-structure-of-atoms-electron-configurations", "6.4 Electronic Structure of Atoms (Electron Configurations)", "Aufbau order, Hund's rule, Cr and Cu exceptions")],
    quantitative: false,
  },
  {
    id: "gc-config-ions", model: "Electron configurations of ions (removal and filling rules)", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The rule (for transition metals the ns electrons are removed before the (n−1)d; anions fill in Aufbau order) was read in OpenStax Chemistry 2e 6.4. For +1 ions the rule's result was compared with the NIST gas-phase ground configuration of 34 elements: it agrees except for V⁺, Co⁺ and Ni⁺, which are flagged in the tool. Ions with higher charge and all anions were not compared with a data source.",
    calc: "independently-checked",
    checks: ["atomic28:[cations]", "atomic28:[anions]", "atomic28:[NIST ions]", "atomic28:[unsupported]"],
    conditions: ["Charges from −3 to +8; anions only for atoms that are not d-block elements and only within their own period."],
    assumptions: ["A rule taught for chemical ions, not a calculation. Gas-phase ground states of some ions differ, and ions in compounds are influenced by their environment."],
    scope: "Teaching configurations of common ions such as Fe²⁺, Fe³⁺, Cu²⁺, O²⁻ and Cl⁻.",
    unsupported: ["Anions of the d-block elements.", "Ions of elements beyond krypton.", "Energies of ionisation."],
    sources: [NIST_PT, OS("6-4-electronic-structure-of-atoms-electron-configurations", "6.4 Electronic Structure of Atoms (Electron Configurations)", "electron configurations of ions")],
    quantitative: false,
  },
  {
    id: "gc-lewis", model: "Lewis structures, formal charge and resonance (curated molecules)", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The formal-charge procedure and its check that formal charges sum to the ionic charge (including CO: C −1, O +1) were read in OpenStax 7.4; the statement that the best BF₃ structure has three single bonds and an electron-deficient boron in 7.3; and that the three C–O bonds of carbonate are identical because of resonance in 7.6. The individual curated structures, the ozone, nitrate, nitrite, sulfur dioxide and sulfate descriptions were not each compared with a retrieved text.",
    calc: "independently-checked",
    checks: ["bonding28:[conservation]", "bonding28:[formal charge]", "bonding28:[known formal charges]", "bonding28:[errors]", "bonding28:[statuses]", "bonding28:[equivalence]", "bonding28:[averages]"],
    conditions: ["Only the molecules and ions listed in the tool; each structure is stored explicitly with its bond orders and lone pairs."],
    assumptions: ["Formal charge is a bookkeeping convention, not the real charge on an atom.", "A molecule has no unique Lewis structure, and resonance contributors are not real, interconverting species: the real electron distribution is delocalised.", "Expanded octets are shown for third-period and later atoms; the d-orbital explanation for them is not endorsed."],
    scope: "Valence-electron counting, formal charges, octet status and comparison of valid Lewis structures for 30 curated species.",
    unsupported: ["Structures for molecules not in the list.", "Radicals (odd-electron species), organometallic and ionic-lattice structures.", "Deciding which resonance contributor 'wins' from energies."],
    sources: [OS("7-4-formal-charges-and-resonance", "7.4 Formal Charges and Resonance", "formal-charge procedure and the check against the ionic charge"), OS("7-3-lewis-symbols-and-structures", "7.3 Lewis Symbols and Structures", "electron-deficient BF₃"), OS("7-6-molecular-structure-and-polarity", "7.6 Molecular Structure and Polarity", "carbonate resonance and one region per multiple bond")],
    quantitative: false,
  },
  {
    id: "gc-vsepr", model: "VSEPR electron-domain and molecular geometry", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The ideal domain angles (180°, 120°, 109.5°, 90°/120°, 90°), the rule that a multiple bond counts as one region, bent water at 104.5°, seesaw SF₄ with an equatorial lone pair, square planar XeF₄ and linear XeF₂ with a trigonal bipyramidal domain geometry were read in OpenStax 7.6. The other curated geometries (for example ClF₃ and BrF₅) follow the same table but were not individually compared.",
    calc: "independently-checked",
    checks: ["bonding28:[table]", "bonding28:[electron-domain vs molecular]", "bonding28:[ideal angles]", "bonding28:[angle counts]", "bonding28:[coordinates]", "bonding28:[unsupported]", "bonding28:[curated molecules]"],
    conditions: ["One central atom; two to six electron domains; lone pairs take equatorial (trigonal bipyramid) or trans (octahedron) positions."],
    assumptions: ["Coordinates are IDEAL directions. Lone pairs and unlike substituents change real angles, and VSEPR does not give those changes numerically.", "The few measured angles quoted (H₂O 104.5°, NH₃ about 107°, O₃ about 117°) are textbook values; only H₂O was compared with a retrieved text."],
    scope: "Thirteen (bonded atoms, lone pairs) cases covering eleven molecular shapes.",
    unsupported: ["Seven or more domains.", "Cases with three lone pairs on six domains.", "Multi-centre molecules as a single 3-D shape (each centre is described separately)."],
    sources: [OS("7-6-molecular-structure-and-polarity", "7.6 Molecular Structure and Polarity", "VSEPR table and worked cases")],
    quantitative: false,
  },
  {
    id: "gc-polarity", model: "Schematic bond dipoles and molecular polarity", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "Only the qualitative statements that CO₂ is nonpolar because its two bond moments oppose, and that H₂O is polar because its bond moments do not cancel (OpenStax 7.6, Figure 7.27). The Pauling electronegativities were entered from standard tables and were not retrieved; the 0.4 and 1.7 labels are common conventions, not physical limits.",
    calc: "independently-checked",
    checks: ["bonding28:[bond]", "bonding28:[cancellation]", "bonding28:[polar molecules]", "bonding28:[hand vectors]", "bonding28:[direction]", "bonding28:[symmetry cases]", "bonding28:[limitations are stated]"],
    conditions: ["Each bond is a vector of length |ΔEN| pointing to the more electronegative atom, in the ideal VSEPR geometry."],
    assumptions: ["Lone-pair dipoles, bond order, geometric distortion and the real charge distribution are ignored.", "The result says whether bond dipoles cancel by symmetry; it is NOT a dipole moment in debye and is never compared with measured values."],
    scope: "Qualitative classification (polar or nonpolar) of single-centre molecules, with the cancellation shown.",
    unsupported: ["Quantitative dipole moments.", "Molecules whose polarity is set by lone pairs or small opposing terms (NF₃ is the standard caution; ozone has identical atoms but a measured nonzero dipole)."],
    sources: [OS("7-6-molecular-structure-and-polarity", "7.6 Molecular Structure and Polarity", "CO₂ versus H₂O bond moments")],
    quantitative: false,
  },
  {
    id: "gc-hybridization", model: "Hybridisation as a bookkeeping model (sp, sp², sp³)", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "That the hybridisation follows the number of electron regions (three regions give sp², four give sp³, as for urea carbon, sulfate sulfur and acetic acid carbons) and that OpenStax assigns sp³d to SeF₄ was read in OpenStax 8.2. The statement that hybridisation is a model and that hypervalent molecules are not best explained by d-orbital hybridisation is the app's own caution and was NOT checked against a retrieved text.",
    calc: "independently-checked",
    checks: ["bonding28:[carbon]", "bonding28:[lone pairs count as domains]", "bonding28:[hydrogen]", "bonding28:[hypervalent]", "bonding28:[resonance caution]", "bonding28:[σ and π counts]"],
    conditions: ["Assigned from the steric number of each atom in the displayed Lewis structure."],
    assumptions: ["Hybridisation is a way of describing bonding, not an observable quantity or a unique decomposition of a molecular wavefunction.", "For five and six domains the labels sp³d and sp³d² are shown only as bookkeeping."],
    scope: "σ and π bond counts and hybrid labels for the curated molecules.",
    unsupported: ["Any claim that d orbitals take part in hypervalent bonding.", "Hybridisation of atoms in molecules that are not listed."],
    sources: [OS("8-2-hybrid-atomic-orbitals", "8.2 Hybrid Atomic Orbitals", "regions-to-hybridisation assignment and worked examples")],
    quantitative: false,
  },
  {
    id: "gc-mo-diatomics", model: "Qualitative molecular-orbital diagrams of homonuclear diatomics", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The bond-order formula, Hund's rule for degenerate orbitals, the π-below-σ ordering for C₂ (and C₂²⁻ with bond order 3) and the O₂ result (bond order 2, two unpaired electrons in π*) were read in OpenStax 8.4. The orbital orderings of B₂, N₂, F₂, Ne₂ and of the ions are the standard textbook convention, not individually compared; for ions the ordering is a stated assumption.",
    calc: "independently-checked",
    checks: ["mo28:[valence electrons]", "mo28:[ordering by atom]", "mo28:[bond order, unpaired electrons]", "mo28:[magnetism]", "mo28:[oxygen]", "mo28:[nitrogen]", "mo28:[boron and carbon]", "mo28:[ions do not depend on the 2p ordering]", "mo28:[Hund's rule]", "mo28:[Pauli]"],
    conditions: ["Valence orbitals only; core 1s electrons (Li–Ne) cancel in the bond order."],
    assumptions: ["Orbital heights show ORDER only, not energies.", "Spin-only paramagnetism: unpaired electrons are counted and orbital angular momentum and spin–orbit coupling are ignored.", "The bond order is a simple count; it is not a bond dissociation energy or a universal prediction of stability (Be₂, for example, is a weakly bound species)."],
    scope: "Seventeen curated species: occupancy, bond order and paramagnetism.",
    unsupported: ["Heteronuclear and polyatomic molecules.", "Orbital energies, bond lengths and bond energies.", "Species other than those listed."],
    sources: [OS("8-4-molecular-orbital-theory", "8.4 Molecular Orbital Theory", "bond order, Hund's rule, C₂ ordering, O₂ paramagnetism")],
    quantitative: false,
  },
  {
    id: "gc-mo-lcao", model: "LCAO illustration of σ1s and σ*1s for two hydrogen 1s orbitals", kind: "numerical-model", source: "not-verified",
    sourceCovers: "Nothing. The overlap integral S(R) = e^(−R)(1 + R + R²/3) and the normalisation 1/√(2(1 ± S)) are standard closed forms that were verified by independent quadrature in this repository, not against a retrieved text.",
    calc: "independently-checked",
    checks: ["mo28:[overlap integral]", "mo28:[normalisation]", "mo28:[nodal plane]", "mo28:[density between the nuclei]", "mo28:[grid]"],
    conditions: ["Two hydrogen 1s functions with exponent 1 at a fixed separation R (bohr); no optimisation of the exponent."],
    assumptions: ["An illustration of in-phase and out-of-phase overlap, not an ab initio result and not a quantitatively accurate electron density.", "Sign colours show the sign (phase) of the wavefunction, not electric charge."],
    scope: "Showing why the bonding combination piles up density between the nuclei and the antibonding one has a nodal plane.",
    unsupported: ["Any quantitative density of a real molecule.", "p-orbital combinations: those are drawn as schematic lobes, not computed."],
    sources: [], quantitative: false,
  },
];

export const evidence28ById = (id: string): EvidenceRecord | undefined => EVIDENCE28.find((e) => e.id === id);
