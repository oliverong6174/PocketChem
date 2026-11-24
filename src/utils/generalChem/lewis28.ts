/**
 * Stage 28: valence electrons, Lewis structures, formal charge, octet bookkeeping and resonance for a curated, bounded set of molecules and
 * polyatomic ions (pure; no React).
 *
 * Lewis structures are a bookkeeping formalism. A molecule does not have one unique Lewis structure, and for resonance systems no single
 * contributor is the real molecule: the real electron distribution is delocalised, not a rapid switching between contributors.
 * Formal charge is FC = V − N − B/2 (valence electrons of the free atom − nonbonding electrons − half the bonding electrons); it is
 * a bookkeeping convention, not the actual charge on the atom.
 * Nothing here predicts products of reactions or builds structures from an arbitrary formula: only the molecules listed in MOLECULES.
 */
import { ELEMENTS } from "./elements";

export const LEWIS_ENGINE_VERSION = 1;

/** Valence electrons of the free neutral atom, main-group elements used by the curated molecules. */
export const VALENCE_ELECTRONS: Readonly<Record<string, number>> = Object.freeze({
  H: 1, He: 2, Li: 1, Be: 2, B: 3, C: 4, N: 5, O: 6, F: 7, Ne: 8, Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7, Ar: 8, Se: 6, Br: 7, Kr: 8, I: 7, Xe: 8,
});
export const valenceElectrons = (el: string): number | null => VALENCE_ELECTRONS[el] ?? null;
export const periodOf = (el: string): number => { const Z = ELEMENTS[el]?.Z ?? 0; return Z <= 2 ? 1 : Z <= 10 ? 2 : Z <= 18 ? 3 : Z <= 36 ? 4 : 5; };

export type StructureKind = "main" | "resonance" | "alternative";
export interface LewisStructureDef {
  id: string; label: string; kind: StructureKind;
  /** Bond order (1–3) of each skeleton bond, in the order of MoleculeDef.bonds. */
  bondOrders: number[];
  /** Lone pairs on each atom, in atom order. */
  lonePairs: number[];
  note?: string;
}
export interface MoleculeDef {
  id: string; name: string; formula: string; charge: number;
  atoms: string[];
  bonds: Array<[number, number]>;
  structures: LewisStructureDef[];
  /** Index of the single central atom for single-centre molecules (used for VSEPR geometry and polarity); null for multi-centre molecules. */
  center: number | null;
  /** 2-D positions for the Lewis drawing (bond length ≈ 1); radial layout is used when absent. */
  layout?: Array<[number, number]>;
  topic: string;
  caution?: string;
  /** Approximate measured bond angle in degrees from general-chemistry textbooks (not source-verified in this app). */
  textbookAngle?: { atoms: string; deg: number };
}

type S = Omit<LewisStructureDef, "kind"> & { kind?: StructureKind };
const st = (s: S): LewisStructureDef => ({ kind: "main", ...s });

function mol(m: MoleculeDef): MoleculeDef { return m; }

export const MOLECULES: ReadonlyArray<MoleculeDef> = Object.freeze([
  mol({ id: "h2o", name: "Water", formula: "H₂O", charge: 0, atoms: ["O", "H", "H"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Two bonding pairs and two lone pairs: bent", textbookAngle: { atoms: "H–O–H", deg: 104.5 },
    structures: [st({ id: "a", label: "Two O–H single bonds, two lone pairs on O", bondOrders: [1, 1], lonePairs: [2, 0, 0] })] }),
  mol({ id: "nh3", name: "Ammonia", formula: "NH₃", charge: 0, atoms: ["N", "H", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "Three bonding pairs and one lone pair: trigonal pyramidal", textbookAngle: { atoms: "H–N–H", deg: 107 },
    structures: [st({ id: "a", label: "Three N–H single bonds, one lone pair on N", bondOrders: [1, 1, 1], lonePairs: [1, 0, 0, 0] })] }),
  mol({ id: "ch4", name: "Methane", formula: "CH₄", charge: 0, atoms: ["C", "H", "H", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "Four bonding pairs: tetrahedral",
    structures: [st({ id: "a", label: "Four C–H single bonds", bondOrders: [1, 1, 1, 1], lonePairs: [0, 0, 0, 0, 0] })] }),
  mol({ id: "nh4", name: "Ammonium ion", formula: "NH₄⁺", charge: 1, atoms: ["N", "H", "H", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "A positive ion: N carries formal charge +1",
    structures: [st({ id: "a", label: "Four N–H single bonds, no lone pair", bondOrders: [1, 1, 1, 1], lonePairs: [0, 0, 0, 0, 0] })] }),
  mol({ id: "co2", name: "Carbon dioxide", formula: "CO₂", charge: 0, atoms: ["C", "O", "O"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Two double bonds: linear; polar bonds that cancel", textbookAngle: { atoms: "O–C–O", deg: 180 },
    structures: [st({ id: "a", label: "Two C=O double bonds", bondOrders: [2, 2], lonePairs: [0, 2, 2] })] }),
  mol({ id: "hcn", name: "Hydrogen cyanide", formula: "HCN", charge: 0, atoms: ["C", "H", "N"], bonds: [[0, 1], [0, 2]], center: 0, topic: "A single and a triple bond at carbon: linear, sp",
    structures: [st({ id: "a", label: "H–C≡N with a lone pair on N", bondOrders: [1, 3], lonePairs: [0, 0, 1] })] }),
  mol({ id: "n2", name: "Dinitrogen", formula: "N₂", charge: 0, atoms: ["N", "N"], bonds: [[0, 1]], center: null, topic: "A triple bond: bond order 3 in both Lewis and MO models",
    structures: [st({ id: "a", label: "N≡N, one lone pair on each N", bondOrders: [3], lonePairs: [1, 1] })] }),
  mol({ id: "o2", name: "Dioxygen", formula: "O₂", charge: 0, atoms: ["O", "O"], bonds: [[0, 1]], center: null, topic: "The best Lewis structure has no unpaired electrons, but O₂ is paramagnetic",
    caution: "This Lewis structure pairs every electron, so it predicts a diamagnetic molecule. Real O₂ has two unpaired electrons; that needs molecular orbital theory.",
    structures: [st({ id: "a", label: "O=O, two lone pairs on each O", bondOrders: [2], lonePairs: [2, 2] })] }),
  mol({ id: "co", name: "Carbon monoxide", formula: "CO", charge: 0, atoms: ["C", "O"], bonds: [[0, 1]], center: null, topic: "A triple bond with formal charges −1 on C and +1 on O",
    structures: [st({ id: "a", label: "C≡O, one lone pair on each atom", bondOrders: [3], lonePairs: [1, 1] })] }),
  mol({ id: "o3", name: "Ozone", formula: "O₃", charge: 0, atoms: ["O", "O", "O"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Two equivalent resonance contributors: both O–O bonds are equal", textbookAngle: { atoms: "O–O–O", deg: 117 },
    caution: "The two contributors are not two molecules and the molecule does not flip between them: the real structure has two equal O–O bonds and delocalised π electrons.",
    structures: [
      st({ id: "a", label: "O=O–O⁻ (double bond to the left atom)", kind: "resonance", bondOrders: [2, 1], lonePairs: [1, 2, 3] }),
      st({ id: "b", label: "⁻O–O=O (double bond to the right atom)", kind: "resonance", bondOrders: [1, 2], lonePairs: [1, 3, 2] })] }),
  mol({ id: "no3", name: "Nitrate ion", formula: "NO₃⁻", charge: -1, atoms: ["N", "O", "O", "O"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "Three equivalent resonance contributors: trigonal planar",
    caution: "Every N–O bond is the same in the real ion (average bond order 4/3); no single contributor shows that.",
    structures: [
      st({ id: "a", label: "Double bond to O(1)", kind: "resonance", bondOrders: [2, 1, 1], lonePairs: [0, 2, 3, 3] }),
      st({ id: "b", label: "Double bond to O(2)", kind: "resonance", bondOrders: [1, 2, 1], lonePairs: [0, 3, 2, 3] }),
      st({ id: "c", label: "Double bond to O(3)", kind: "resonance", bondOrders: [1, 1, 2], lonePairs: [0, 3, 3, 2] })] }),
  mol({ id: "co3", name: "Carbonate ion", formula: "CO₃²⁻", charge: -2, atoms: ["C", "O", "O", "O"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "Three equivalent resonance contributors: trigonal planar",
    caution: "Every C–O bond is the same in the real ion (average bond order 4/3); no single contributor shows that.",
    structures: [
      st({ id: "a", label: "Double bond to O(1)", kind: "resonance", bondOrders: [2, 1, 1], lonePairs: [0, 2, 3, 3] }),
      st({ id: "b", label: "Double bond to O(2)", kind: "resonance", bondOrders: [1, 2, 1], lonePairs: [0, 3, 2, 3] }),
      st({ id: "c", label: "Double bond to O(3)", kind: "resonance", bondOrders: [1, 1, 2], lonePairs: [0, 3, 3, 2] })] }),
  mol({ id: "no2", name: "Nitrite ion", formula: "NO₂⁻", charge: -1, atoms: ["N", "O", "O"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Two equivalent resonance contributors; bent with a lone pair on N",
    structures: [
      st({ id: "a", label: "O=N–O⁻", kind: "resonance", bondOrders: [2, 1], lonePairs: [1, 2, 3] }),
      st({ id: "b", label: "⁻O–N=O", kind: "resonance", bondOrders: [1, 2], lonePairs: [1, 3, 2] })] }),
  mol({ id: "so2", name: "Sulfur dioxide", formula: "SO₂", charge: 0, atoms: ["S", "O", "O"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Octet-obeying resonance contributors versus an expanded-octet structure",
    caution: "Both descriptions are valid Lewis formalisms; neither one is 'the' structure. The two S–O bonds are equal in the real molecule.",
    structures: [
      st({ id: "a", label: "O=S⁺–O⁻ (octet on S)", kind: "resonance", bondOrders: [2, 1], lonePairs: [1, 2, 3] }),
      st({ id: "b", label: "⁻O–S⁺=O (octet on S)", kind: "resonance", bondOrders: [1, 2], lonePairs: [1, 3, 2] }),
      st({ id: "c", label: "O=S=O (10 electrons on S, all formal charges 0)", kind: "alternative", bondOrders: [2, 2], lonePairs: [1, 2, 2], note: "Expanded octet on sulfur; the picture that uses d orbitals is not the accepted physical explanation." })] }),
  mol({ id: "so4", name: "Sulfate ion", formula: "SO₄²⁻", charge: -2, atoms: ["S", "O", "O", "O", "O"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "Compare four single bonds (octet) with two double bonds (zero formal charge on S)",
    caution: "Choosing between these is a matter of which rule is applied (octet or formal-charge minimisation). The real S–O bonds are equal and all four oxygens are equivalent.",
    structures: [
      st({ id: "a", label: "Four S–O single bonds (octet on S, S has FC +2)", kind: "main", bondOrders: [1, 1, 1, 1], lonePairs: [0, 3, 3, 3, 3] }),
      st({ id: "b", label: "Two S=O and two S–O (12 electrons on S, S has FC 0)", kind: "alternative", bondOrders: [2, 2, 1, 1], lonePairs: [0, 2, 2, 3, 3], note: "Minimises formal charges at the cost of an expanded octet." })] }),
  mol({ id: "bf3", name: "Boron trifluoride", formula: "BF₃", charge: 0, atoms: ["B", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "An incomplete octet on boron: trigonal planar",
    structures: [
      st({ id: "a", label: "Three B–F single bonds (6 electrons on B)", kind: "main", bondOrders: [1, 1, 1], lonePairs: [0, 3, 3, 3] }),
      st({ id: "b", label: "One B=F double bond (octet on B, FC −1 on B and +1 on F)", kind: "alternative", bondOrders: [2, 1, 1], lonePairs: [0, 2, 3, 3], note: "Obeys the octet rule but puts a positive formal charge on the most electronegative atom." })] }),
  mol({ id: "ccl4", name: "Carbon tetrachloride", formula: "CCl₄", charge: 0, atoms: ["C", "Cl", "Cl", "Cl", "Cl"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "Polar bonds in a symmetric tetrahedron",
    structures: [st({ id: "a", label: "Four C–Cl single bonds", bondOrders: [1, 1, 1, 1], lonePairs: [0, 3, 3, 3, 3] })] }),
  mol({ id: "chcl3", name: "Chloroform", formula: "CHCl₃", charge: 0, atoms: ["C", "H", "Cl", "Cl", "Cl"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "A tetrahedron with unlike substituents",
    structures: [st({ id: "a", label: "One C–H and three C–Cl single bonds", bondOrders: [1, 1, 1, 1], lonePairs: [0, 0, 3, 3, 3] })] }),
  mol({ id: "ch2cl2", name: "Dichloromethane", formula: "CH₂Cl₂", charge: 0, atoms: ["C", "H", "H", "Cl", "Cl"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "A tetrahedron with unlike substituents",
    structures: [st({ id: "a", label: "Two C–H and two C–Cl single bonds", bondOrders: [1, 1, 1, 1], lonePairs: [0, 0, 0, 3, 3] })] }),
  mol({ id: "pcl5", name: "Phosphorus pentachloride", formula: "PCl₅", charge: 0, atoms: ["P", "Cl", "Cl", "Cl", "Cl", "Cl"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], center: 0, topic: "Five bonding pairs: trigonal bipyramidal (ten electrons around P)",
    caution: "Ten electrons around P is called an expanded octet. The accepted explanation does not rely on d-orbital hybridisation.",
    structures: [st({ id: "a", label: "Five P–Cl single bonds", bondOrders: [1, 1, 1, 1, 1], lonePairs: [0, 3, 3, 3, 3, 3] })] }),
  mol({ id: "sf4", name: "Sulfur tetrafluoride", formula: "SF₄", charge: 0, atoms: ["S", "F", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "Four bonding pairs and one lone pair: seesaw",
    structures: [st({ id: "a", label: "Four S–F single bonds, one lone pair on S", bondOrders: [1, 1, 1, 1], lonePairs: [1, 3, 3, 3, 3] })] }),
  mol({ id: "clf3", name: "Chlorine trifluoride", formula: "ClF₃", charge: 0, atoms: ["Cl", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "Three bonding pairs and two lone pairs: T-shaped",
    structures: [st({ id: "a", label: "Three Cl–F single bonds, two lone pairs on Cl", bondOrders: [1, 1, 1], lonePairs: [2, 3, 3, 3] })] }),
  mol({ id: "xef2", name: "Xenon difluoride", formula: "XeF₂", charge: 0, atoms: ["Xe", "F", "F"], bonds: [[0, 1], [0, 2]], center: 0, topic: "Two bonding pairs and three lone pairs: linear",
    structures: [st({ id: "a", label: "Two Xe–F single bonds, three lone pairs on Xe", bondOrders: [1, 1], lonePairs: [3, 3, 3] })] }),
  mol({ id: "sf6", name: "Sulfur hexafluoride", formula: "SF₆", charge: 0, atoms: ["S", "F", "F", "F", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]], center: 0, topic: "Six bonding pairs: octahedral",
    structures: [st({ id: "a", label: "Six S–F single bonds", bondOrders: [1, 1, 1, 1, 1, 1], lonePairs: [0, 3, 3, 3, 3, 3, 3] })] }),
  mol({ id: "brf5", name: "Bromine pentafluoride", formula: "BrF₅", charge: 0, atoms: ["Br", "F", "F", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], center: 0, topic: "Five bonding pairs and one lone pair: square pyramidal",
    structures: [st({ id: "a", label: "Five Br–F single bonds, one lone pair on Br", bondOrders: [1, 1, 1, 1, 1], lonePairs: [1, 3, 3, 3, 3, 3] })] }),
  mol({ id: "xef4", name: "Xenon tetrafluoride", formula: "XeF₄", charge: 0, atoms: ["Xe", "F", "F", "F", "F"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], center: 0, topic: "Four bonding pairs and two lone pairs: square planar",
    structures: [st({ id: "a", label: "Four Xe–F single bonds, two lone pairs on Xe", bondOrders: [1, 1, 1, 1], lonePairs: [2, 3, 3, 3, 3] })] }),
  mol({ id: "ch2o", name: "Formaldehyde", formula: "CH₂O", charge: 0, atoms: ["C", "O", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3]], center: 0, topic: "A C=O double bond: carbon is sp², trigonal planar",
    structures: [st({ id: "a", label: "C=O double bond, two C–H single bonds", bondOrders: [2, 1, 1], lonePairs: [0, 2, 0, 0] })] }),
  mol({ id: "c2h4", name: "Ethene (ethylene)", formula: "C₂H₄", charge: 0, atoms: ["C", "C", "H", "H", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5]], center: null, topic: "A C=C double bond: one σ bond and one π bond, sp² carbons",
    layout: [[-0.6, 0], [0.6, 0], [-1.2, 0.9], [-1.2, -0.9], [1.2, 0.9], [1.2, -0.9]],
    structures: [st({ id: "a", label: "C=C double bond, four C–H single bonds", bondOrders: [2, 1, 1, 1, 1], lonePairs: [0, 0, 0, 0, 0, 0] })] }),
  mol({ id: "c2h2", name: "Ethyne (acetylene)", formula: "C₂H₂", charge: 0, atoms: ["C", "C", "H", "H"], bonds: [[0, 1], [0, 2], [1, 3]], center: null, topic: "A C≡C triple bond: one σ and two π bonds, sp carbons",
    layout: [[-0.6, 0], [0.6, 0], [-1.7, 0], [1.7, 0]],
    structures: [st({ id: "a", label: "C≡C triple bond, two C–H single bonds", bondOrders: [3, 1, 1], lonePairs: [0, 0, 0, 0] })] }),
  mol({ id: "c2h6", name: "Ethane", formula: "C₂H₆", charge: 0, atoms: ["C", "C", "H", "H", "H", "H", "H", "H"], bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [1, 7]], center: null, topic: "Only σ bonds: sp³ carbons",
    layout: [[-0.6, 0], [0.6, 0], [-1.2, 0.9], [-1.5, 0], [-1.2, -0.9], [1.2, 0.9], [1.5, 0], [1.2, -0.9]],
    structures: [st({ id: "a", label: "C–C single bond, six C–H single bonds", bondOrders: [1, 1, 1, 1, 1, 1, 1], lonePairs: [0, 0, 0, 0, 0, 0, 0, 0] })] }),
]);
export const getMolecule = (id: string): MoleculeDef | undefined => MOLECULES.find((m) => m.id === id);

// ---- analysis --------------------------------------------------------------------------------------------------------------------------------

export interface LewisState { bondOrders: number[]; lonePairs: number[] }
export type OctetStatus = "duet" | "octet" | "incomplete" | "expanded" | "exceeds";
export interface AtomReport {
  index: number; el: string; valence: number; lonePairs: number; bondOrderSum: number;
  nonbonding: number; bonding: number; formalCharge: number; electronsAround: number; status: OctetStatus; statusNote: string;
}
export interface LewisReport {
  valid: boolean;
  errors: string[];
  totalValence: number; counted: number; conserved: boolean; difference: number;
  atoms: AtomReport[];
  formalChargeSum: number; chargeConsistent: boolean; sumAbsFormalCharge: number;
  /** Atoms whose electron count breaks the octet/duet guidance for their period (not necessarily an invalid structure). */
  concerns: string[];
  matchedStructure: string | null;
}

export function structureToState(s: LewisStructureDef): LewisState { return { bondOrders: [...s.bondOrders], lonePairs: [...s.lonePairs] }; }

function octetOf(el: string, around: number): { status: OctetStatus; note: string } {
  const period = periodOf(el);
  const small = el === "H" || el === "He";
  if (small) return around === 2 ? { status: "duet", note: "duet (2 electrons)" } : around < 2 ? { status: "incomplete", note: "fewer than 2 electrons" } : { status: "exceeds", note: "more than 2 electrons around hydrogen or helium" };
  if (around === 8) return { status: "octet", note: "octet (8 electrons)" };
  if (around < 8) return { status: "incomplete", note: `${around} electrons: an incomplete octet${["B", "Be", "Al", "Li"].includes(el) ? " is common for this element" : ""}` };
  if (period <= 2) return { status: "exceeds", note: `${around} electrons exceed the octet, which is not possible for a period-2 atom` };
  return { status: "expanded", note: `${around} electrons: an expanded octet (possible beyond period 2)` };
}

export function analyzeLewis(m: MoleculeDef, s: LewisState): LewisReport {
  const errors: string[] = [];
  if (s.bondOrders.length !== m.bonds.length) errors.push("Wrong number of bonds.");
  if (s.lonePairs.length !== m.atoms.length) errors.push("Wrong number of atoms.");
  if (s.bondOrders.some((b) => !Number.isInteger(b) || b < 1 || b > 3)) errors.push("Bond orders must be 1, 2 or 3.");
  if (s.lonePairs.some((p) => !Number.isInteger(p) || p < 0 || p > 4)) errors.push("Lone pairs per atom must be 0 to 4.");
  const empty: LewisReport = { valid: false, errors, totalValence: 0, counted: 0, conserved: false, difference: 0, atoms: [], formalChargeSum: 0, chargeConsistent: false, sumAbsFormalCharge: 0, concerns: [], matchedStructure: null };
  if (errors.length) return empty;
  const val = m.atoms.map(valenceElectrons);
  if (val.some((v) => v === null)) return { ...empty, errors: ["Unsupported element."] };
  const totalValence = (val as number[]).reduce((a, b) => a + b, 0) - m.charge;
  const sumOrders = new Array<number>(m.atoms.length).fill(0);
  m.bonds.forEach(([a, b], i) => { sumOrders[a] += s.bondOrders[i]; sumOrders[b] += s.bondOrders[i]; });
  const atoms: AtomReport[] = m.atoms.map((el, i) => {
    const nonbonding = 2 * s.lonePairs[i];
    const bonding = 2 * sumOrders[i];
    const fc = (val[i] as number) - nonbonding - bonding / 2;
    const around = nonbonding + bonding;
    const o = octetOf(el, around);
    return { index: i, el, valence: val[i] as number, lonePairs: s.lonePairs[i], bondOrderSum: sumOrders[i], nonbonding, bonding, formalCharge: fc, electronsAround: around, status: o.status, statusNote: o.note };
  });
  const counted = 2 * s.lonePairs.reduce((a, b) => a + b, 0) + 2 * s.bondOrders.reduce((a, b) => a + b, 0);
  const fcSum = atoms.reduce((a, x) => a + x.formalCharge, 0);
  const concerns = atoms.filter((a) => a.status === "exceeds" || a.status === "incomplete" && !["B", "Be", "Al", "Li"].includes(a.el)).map((a) => `${a.el}(${a.index + 1}): ${a.statusNote}`);
  const matched = m.structures.find((x) => x.bondOrders.every((b, i) => b === s.bondOrders[i]) && x.lonePairs.every((p, i) => p === s.lonePairs[i]));
  return {
    valid: true, errors: [], totalValence, counted, conserved: counted === totalValence, difference: counted - totalValence, atoms,
    formalChargeSum: fcSum, chargeConsistent: fcSum === m.charge, sumAbsFormalCharge: atoms.reduce((a, x) => a + Math.abs(x.formalCharge), 0), concerns,
    matchedStructure: matched ? matched.id : null,
  };
}

/** Formal charge of a single atom by the stated formula (also used to cross-check analyzeLewis). */
export const formalCharge = (valence: number, nonbondingElectrons: number, bondingElectrons: number): number => valence - nonbondingElectrons - bondingElectrons / 2;

// ---- resonance -------------------------------------------------------------------------------------------------------------------------------

export interface ResonanceHybrid {
  contributors: LewisStructureDef[];
  averageBondOrders: number[];
  averageFormalCharge: number[];
  /** True when every contributor has the same multiset of (element, formal charge) pairs, so they are equivalent by relabelling atoms of one element. */
  equivalent: boolean;
}
export function resonanceHybrid(m: MoleculeDef): ResonanceHybrid | null {
  const contributors = m.structures.filter((s) => s.kind === "resonance");
  if (contributors.length < 2) return null;
  const reports = contributors.map((c) => analyzeLewis(m, structureToState(c)));
  const k = contributors.length;
  const avgOrders = m.bonds.map((_, i) => contributors.reduce((a, c) => a + c.bondOrders[i], 0) / k);
  const avgFc = m.atoms.map((_, i) => reports.reduce((a, r) => a + r.atoms[i].formalCharge, 0) / k);
  const sig = (r: LewisReport) => r.atoms.map((a) => `${a.el}${a.formalCharge}`).sort().join("|");
  return { contributors, averageBondOrders: avgOrders, averageFormalCharge: avgFc, equivalent: reports.every((r) => sig(r) === sig(reports[0])) };
}

// ---- hybridisation bookkeeping ---------------------------------------------------------------------------------------------------------------

export interface HybridReport {
  index: number; el: string; neighbours: number; lonePairs: number; stericNumber: number;
  hybrid: string | null; sigma: number; pi: number;
  /** "model" for sp, sp², sp³; "bookkeeping" for the labels used for five and six domains. */
  level: "model" | "bookkeeping" | "none";
  note: string;
}
export function hybridization(m: MoleculeDef, s: LewisState): HybridReport[] {
  return m.atoms.map((el, i) => {
    const bondIdx = m.bonds.map((b, k) => ({ b, k })).filter(({ b }) => b[0] === i || b[1] === i);
    const neighbours = bondIdx.length;
    const lp = s.lonePairs[i];
    const pi = bondIdx.reduce((a, { k }) => a + (s.bondOrders[k] - 1), 0);
    const sn = neighbours + lp;
    if (el === "H") return { index: i, el, neighbours, lonePairs: lp, stericNumber: sn, hybrid: null, sigma: neighbours, pi: 0, level: "none", note: "Hydrogen uses its 1s orbital for its σ bond; it is not hybridised." };
    if (neighbours === 0) return { index: i, el, neighbours, lonePairs: lp, stericNumber: sn, hybrid: null, sigma: 0, pi: 0, level: "none", note: "No bonded neighbour." };
    const base = { index: i, el, neighbours, lonePairs: lp, stericNumber: sn, sigma: neighbours, pi };
    // resonance caution: a terminal atom with a lone pair next to a π bond
    const conj = lp > 0 && neighbours === 1 && bondIdx.some(({ b }) => { const other = b[0] === i ? b[1] : b[0]; return m.bonds.some((bb, k) => (bb[0] === other || bb[1] === other) && s.bondOrders[k] > 1); }) && s.bondOrders[bondIdx[0].k] === 1;
    const conjNote = conj ? " This atom's lone pair is delocalised into the neighbouring π system (resonance), so it is usually described as sp² rather than sp³." : "";
    if (sn === 2) return { ...base, hybrid: "sp", level: "model", note: `Two electron domains: one s and one p orbital mix into two sp hybrids (180°); two p orbitals remain for π bonds.${conjNote}` };
    if (sn === 3) return { ...base, hybrid: "sp²", level: "model", note: `Three electron domains: one s and two p orbitals mix into three sp² hybrids (120°); one p orbital remains for a π bond.${conjNote}` };
    if (sn === 4) return { ...base, hybrid: "sp³", level: "model", note: `Four electron domains: one s and three p orbitals mix into four sp³ hybrids (about 109.5°); no p orbital remains.${conjNote}` };
    if (sn === 5) return { ...base, hybrid: "sp³d", level: "bookkeeping", note: "Five electron domains: 'sp³d' is only a label for the trigonal bipyramidal arrangement. Modern treatments explain such molecules mainly with multi-centre bonding, not d-orbital hybridisation." };
    if (sn === 6) return { ...base, hybrid: "sp³d²", level: "bookkeeping", note: "Six electron domains: 'sp³d²' is only a label for the octahedral arrangement. Modern treatments do not rely on d-orbital hybridisation." };
    return { ...base, hybrid: null, level: "none", note: "Outside the supported range of 2 to 6 electron domains." };
  });
}

/** Radial 2-D layout for a single-centre molecule, used when the definition has no explicit layout. Angles in degrees from the +x axis. */
export function lewisLayout(m: MoleculeDef): Array<[number, number]> {
  if (m.layout) return m.layout;
  const out: Array<[number, number]> = m.atoms.map(() => [0, 0]);
  if (m.center === null) {
    // diatomic
    return m.atoms.length === 2 ? [[-0.6, 0], [0.6, 0]] : out;
  }
  const lig = m.atoms.map((_, i) => i).filter((i) => i !== m.center);
  const angles: Record<number, number[]> = { 1: [0], 2: [210, 330], 3: [90, 210, 330], 4: [45, 135, 225, 315], 5: [90, 162, 234, 306, 18], 6: [90, 30, 330, 270, 210, 150] };
  const set = angles[lig.length] ?? [];
  lig.forEach((idx, k) => { const a = ((set[k] ?? 0) * Math.PI) / 180; out[idx] = [Math.cos(a), Math.sin(a)]; });
  return out;
}
