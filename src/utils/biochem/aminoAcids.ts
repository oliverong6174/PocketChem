/**
 * Curated reference data for the 20 standard (genetically encoded) L-amino acids (pure; no React, no network).
 *
 * Sources of the numbers (all textbook values, stated as approximate in the interface):
 *  - pKa values of the free amino acid in water at 25 °C (the Lehninger Principles table of amino-acid properties);
 *  - hydropathy index (Kyte & Doolittle, 1982);
 *  - residue volume in Å^3 (Zamyatnin, 1972);
 *  - the one-letter code is the same alphabet the Biology Translation tool uses (geneticCode.ts).
 * Structures are written as SMILES of the L-form with explicit stereochemistry and are the single chemical identity used for drawing,
 * peptide assembly, formulas and masses: there is no second structure table.
 */
import { AMINO_ACIDS as CODE_TABLE } from "../biology/geneticCode";

export type AaClass = "nonpolar-aliphatic" | "aromatic" | "polar-uncharged" | "positive" | "negative";
export type SideGroupKind = "carboxyl" | "imidazole" | "thiol" | "phenol" | "amino" | "guanidinium";

export interface IonizableGroup {
  id: "alpha-carboxyl" | "alpha-amino" | "side-chain";
  label: string;
  /** Approximate pKa of the free amino acid. */
  pKa: number;
  /** An acid group is neutral when protonated and −1 when deprotonated; a base group is +1 when protonated and neutral when deprotonated. */
  type: "acid" | "base";
  kind?: SideGroupKind;
}

export interface AminoAcid {
  one: string;
  three: string;
  name: string;
  formula: string;
  /** SMILES of the free L-amino acid (neutral, un-ionised form). */
  smiles: string;
  /** SMILES branch of the side chain as written in the backbone template `N[C@@H](<branch>)C(=O)` (empty for glycine). */
  branch: string;
  /** Heavy (non-hydrogen) atoms of the side chain. */
  sideChainHeavyAtoms: number;
  cls: AaClass;
  aromatic: boolean;
  aliphatic: boolean;
  /** Kyte–Doolittle hydropathy index. */
  hydropathy: number;
  /** Residue volume (Å^3). */
  volume: number;
  /** Ionisable groups with approximate pKa, in the order they titrate from low to high pH. */
  groups: IonizableGroup[];
  /** CIP descriptors of the stereocentres of the natural L-form, as (atom label → descriptor). Glycine has none. */
  stereo: Record<string, "R" | "S">;
  /** One sentence on how the side chain behaves and where it matters biochemically. */
  role: string;
  /** Typical noncovalent interactions of the side chain. */
  interactions: string[];
}

const G = (label: string, pKa: number, type: "acid" | "base", kind?: SideGroupKind, id: IonizableGroup["id"] = "side-chain"): IonizableGroup => ({ id, label, pKa, type, kind });
const backbone = (c: number, n: number): IonizableGroup[] => [G("α-carboxyl", c, "acid", undefined, "alpha-carboxyl"), G("α-amino", n, "base", undefined, "alpha-amino")];
const withSide = (c: number, n: number, side: IonizableGroup): IonizableGroup[] => [...backbone(c, n), side].sort((a, b) => a.pKa - b.pKa);

export const AMINO_ACID_LIST: AminoAcid[] = [
  { one: "G", three: "Gly", name: "Glycine", formula: "C2H5NO2", smiles: "NCC(=O)O", branch: "", sideChainHeavyAtoms: 0, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: false, hydropathy: -0.4, volume: 60.1, groups: backbone(2.34, 9.60), stereo: {}, role: "The smallest residue: its side chain is a hydrogen atom, so it is the only achiral standard amino acid and the most conformationally flexible. It allows tight turns and close packing.", interactions: ["Backbone hydrogen bonds only", "Flexibility in turns and loops"] },
  { one: "A", three: "Ala", name: "Alanine", formula: "C3H7NO2", smiles: "N[C@@H](C)C(=O)O", branch: "C", sideChainHeavyAtoms: 1, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: 1.8, volume: 88.6, groups: backbone(2.34, 9.69), stereo: { Cα: "S" }, role: "A small methyl side chain; common in α-helices and buried positions.", interactions: ["Van der Waals contacts", "Weak hydrophobic effect"] },
  { one: "V", three: "Val", name: "Valine", formula: "C5H11NO2", smiles: "N[C@@H](C(C)C)C(=O)O", branch: "C(C)C", sideChainHeavyAtoms: 3, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: 4.2, volume: 140.0, groups: backbone(2.32, 9.62), stereo: { Cα: "S" }, role: "A β-branched hydrophobic residue; favours β-strands and the hydrophobic core.", interactions: ["Hydrophobic interactions", "Van der Waals contacts"] },
  { one: "L", three: "Leu", name: "Leucine", formula: "C6H13NO2", smiles: "N[C@@H](CC(C)C)C(=O)O", branch: "CC(C)C", sideChainHeavyAtoms: 4, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: 3.8, volume: 166.7, groups: backbone(2.36, 9.60), stereo: { Cα: "S" }, role: "A bulky hydrophobic residue, very common in the interior of proteins and in leucine-zipper contacts.", interactions: ["Hydrophobic interactions", "Van der Waals contacts"] },
  { one: "I", three: "Ile", name: "Isoleucine", formula: "C6H13NO2", smiles: "N[C@@H]([C@@H](C)CC)C(=O)O", branch: "[C@@H](C)CC", sideChainHeavyAtoms: 4, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: 4.5, volume: 166.7, groups: backbone(2.36, 9.68), stereo: { Cα: "S", Cβ: "S" }, role: "An isomer of leucine with a β-branch and a second stereocentre; strongly hydrophobic and common in β-strands.", interactions: ["Hydrophobic interactions", "Van der Waals contacts"] },
  { one: "P", three: "Pro", name: "Proline", formula: "C5H9NO2", smiles: "OC(=O)[C@@H]1CCCN1", branch: "", sideChainHeavyAtoms: 3, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: -1.6, volume: 112.7, groups: backbone(1.99, 10.96), stereo: { Cα: "S" }, role: "The side chain loops back onto the backbone nitrogen, making a five-membered ring and a secondary amine. Proline has no backbone N–H to donate a hydrogen bond, restricts φ to about −63°, and often starts turns or breaks helices.", interactions: ["No backbone N–H donor", "Restricts φ (rigid ring)", "Cis–trans peptide-bond isomerisation is easier"] },
  { one: "M", three: "Met", name: "Methionine", formula: "C5H11NO2S", smiles: "N[C@@H](CCSC)C(=O)O", branch: "CCSC", sideChainHeavyAtoms: 4, cls: "nonpolar-aliphatic", aromatic: false, aliphatic: true, hydropathy: 1.9, volume: 162.9, groups: backbone(2.28, 9.21), stereo: { Cα: "S" }, role: "A flexible, mostly hydrophobic thioether side chain; the usual start residue of translation (AUG).", interactions: ["Hydrophobic interactions", "Metal binding through sulfur"] },
  { one: "F", three: "Phe", name: "Phenylalanine", formula: "C9H11NO2", smiles: "N[C@@H](Cc1ccccc1)C(=O)O", branch: "Cc1ccccc1", sideChainHeavyAtoms: 7, cls: "aromatic", aromatic: true, aliphatic: false, hydropathy: 2.8, volume: 189.9, groups: backbone(1.83, 9.13), stereo: { Cα: "S" }, role: "A benzyl side chain: hydrophobic and aromatic, packing into protein cores.", interactions: ["Hydrophobic interactions", "π–π stacking", "Cation–π interactions"] },
  { one: "W", three: "Trp", name: "Tryptophan", formula: "C11H12N2O2", smiles: "N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O", branch: "Cc1c[nH]c2ccccc12", sideChainHeavyAtoms: 10, cls: "aromatic", aromatic: true, aliphatic: false, hydropathy: -0.9, volume: 227.8, groups: backbone(2.38, 9.39), stereo: { Cα: "S" }, role: "The largest side chain: an indole ring that is mostly hydrophobic but whose N–H can donate a hydrogen bond. It absorbs near 280 nm and fluoresces.", interactions: ["Hydrophobic interactions", "π–π stacking", "Cation–π interactions", "Indole N–H hydrogen-bond donor"] },
  { one: "S", three: "Ser", name: "Serine", formula: "C3H7NO3", smiles: "N[C@@H](CO)C(=O)O", branch: "CO", sideChainHeavyAtoms: 2, cls: "polar-uncharged", aromatic: false, aliphatic: false, hydropathy: -0.8, volume: 89.0, groups: backbone(2.21, 9.15), stereo: { Cα: "S" }, role: "A hydroxymethyl side chain: polar, hydrogen-bonding, and a site of phosphorylation and of nucleophilic catalysis (as in serine proteases).", interactions: ["Hydrogen bonds (donor and acceptor)", "Phosphorylation site", "Nucleophile in some active sites"] },
  { one: "T", three: "Thr", name: "Threonine", formula: "C4H9NO3", smiles: "N[C@@H]([C@@H](C)O)C(=O)O", branch: "[C@@H](C)O", sideChainHeavyAtoms: 3, cls: "polar-uncharged", aromatic: false, aliphatic: false, hydropathy: -0.7, volume: 116.1, groups: backbone(2.11, 9.62), stereo: { Cα: "S", Cβ: "R" }, role: "A β-branched residue with a hydroxyl group and a second stereocentre; a phosphorylation site.", interactions: ["Hydrogen bonds (donor and acceptor)", "Phosphorylation site"] },
  { one: "C", three: "Cys", name: "Cysteine", formula: "C3H7NO2S", smiles: "N[C@@H](CS)C(=O)O", branch: "CS", sideChainHeavyAtoms: 2, cls: "polar-uncharged", aromatic: false, aliphatic: false, hydropathy: 2.5, volume: 108.5, groups: withSide(1.96, 10.28, G("thiol", 8.18, "acid", "thiol")), stereo: { Cα: "R" }, role: "The thiol (–SH) can be oxidised to a disulfide bond with another cysteine and binds metals. Its Cα is labelled R rather than S only because sulfur changes the CIP priorities; the spatial arrangement is the same as in the other L-amino acids.", interactions: ["Disulfide bonds (covalent)", "Metal binding", "Nucleophilic thiolate"] },
  { one: "Y", three: "Tyr", name: "Tyrosine", formula: "C9H11NO3", smiles: "N[C@@H](Cc1ccc(O)cc1)C(=O)O", branch: "Cc1ccc(O)cc1", sideChainHeavyAtoms: 8, cls: "aromatic", aromatic: true, aliphatic: false, hydropathy: -1.3, volume: 193.6, groups: withSide(2.20, 9.11, G("phenol", 10.07, "acid", "phenol")), stereo: { Cα: "S" }, role: "Phenylalanine with a para hydroxyl: aromatic, able to hydrogen-bond, a phosphorylation site, and absorbs near 280 nm.", interactions: ["Hydrogen bonds (donor and acceptor)", "π–π stacking", "Phosphorylation site"] },
  { one: "N", three: "Asn", name: "Asparagine", formula: "C4H8N2O3", smiles: "N[C@@H](CC(N)=O)C(=O)O", branch: "CC(N)=O", sideChainHeavyAtoms: 4, cls: "polar-uncharged", aromatic: false, aliphatic: false, hydropathy: -3.5, volume: 114.1, groups: backbone(2.02, 8.80), stereo: { Cα: "S" }, role: "A polar amide side chain that donates and accepts hydrogen bonds; the site of N-linked glycosylation (in an N-X-S/T sequon).", interactions: ["Hydrogen bonds (donor and acceptor)", "Turn-forming", "N-glycosylation site"] },
  { one: "Q", three: "Gln", name: "Glutamine", formula: "C5H10N2O3", smiles: "N[C@@H](CCC(N)=O)C(=O)O", branch: "CCC(N)=O", sideChainHeavyAtoms: 5, cls: "polar-uncharged", aromatic: false, aliphatic: false, hydropathy: -3.5, volume: 143.8, groups: backbone(2.17, 9.13), stereo: { Cα: "S" }, role: "Asparagine with one more CH2: a polar amide that forms hydrogen bonds.", interactions: ["Hydrogen bonds (donor and acceptor)"] },
  { one: "D", three: "Asp", name: "Aspartic acid", formula: "C4H7NO4", smiles: "N[C@@H](CC(=O)O)C(=O)O", branch: "CC(=O)O", sideChainHeavyAtoms: 4, cls: "negative", aromatic: false, aliphatic: false, hydropathy: -3.5, volume: 111.1, groups: withSide(1.88, 9.60, G("side-chain carboxyl", 3.65, "acid", "carboxyl")), stereo: { Cα: "S" }, role: "Negatively charged carboxylate at physiological pH; forms salt bridges, binds metal ions and acts as a general acid or base in active sites.", interactions: ["Salt bridges (with Lys, Arg, His)", "Hydrogen-bond acceptor", "Metal-ion binding"] },
  { one: "E", three: "Glu", name: "Glutamic acid", formula: "C5H9NO4", smiles: "N[C@@H](CCC(=O)O)C(=O)O", branch: "CCC(=O)O", sideChainHeavyAtoms: 5, cls: "negative", aromatic: false, aliphatic: false, hydropathy: -3.5, volume: 138.4, groups: withSide(2.19, 9.67, G("side-chain carboxyl", 4.25, "acid", "carboxyl")), stereo: { Cα: "S" }, role: "Aspartate with one more CH2: a negatively charged carboxylate that forms salt bridges and metal contacts.", interactions: ["Salt bridges (with Lys, Arg, His)", "Hydrogen-bond acceptor", "Metal-ion binding"] },
  { one: "K", three: "Lys", name: "Lysine", formula: "C6H14N2O2", smiles: "N[C@@H](CCCCN)C(=O)O", branch: "CCCCN", sideChainHeavyAtoms: 5, cls: "positive", aromatic: false, aliphatic: false, hydropathy: -3.9, volume: 168.6, groups: withSide(2.18, 8.95, G("side-chain ε-amino", 10.53, "base", "amino")), stereo: { Cα: "S" }, role: "A long chain ending in a primary amine that is protonated (+1) at physiological pH; forms salt bridges and is a site of acetylation, methylation and ubiquitination.", interactions: ["Salt bridges (with Asp, Glu)", "Hydrogen-bond donor", "Cation–π interactions"] },
  { one: "R", three: "Arg", name: "Arginine", formula: "C6H14N4O2", smiles: "N[C@@H](CCCNC(N)=N)C(=O)O", branch: "CCCNC(N)=N", sideChainHeavyAtoms: 7, cls: "positive", aromatic: false, aliphatic: false, hydropathy: -4.5, volume: 173.4, groups: withSide(2.17, 9.04, G("side-chain guanidinium", 12.48, "base", "guanidinium")), stereo: { Cα: "S" }, role: "A guanidinium group that stays protonated (+1) across almost the whole physiological pH range; forms several hydrogen bonds and salt bridges (e.g. to phosphate groups).", interactions: ["Salt bridges (with Asp, Glu, phosphate)", "Multiple hydrogen-bond donors", "Cation–π interactions"] },
  { one: "H", three: "His", name: "Histidine", formula: "C6H9N3O2", smiles: "N[C@@H](Cc1c[nH]cn1)C(=O)O", branch: "Cc1c[nH]cn1", sideChainHeavyAtoms: 6, cls: "positive", aromatic: true, aliphatic: false, hydropathy: -3.2, volume: 153.2, groups: withSide(1.82, 9.17, G("side-chain imidazole", 6.00, "base", "imidazole")), stereo: { Cα: "S" }, role: "An imidazole whose pKa is near physiological pH, so it can be partly protonated or neutral; it acts as a proton shuttle in many active sites and binds metals.", interactions: ["Proton donor/acceptor (general acid–base)", "Metal-ion binding", "Hydrogen bonds", "Salt bridges when protonated"] },
];

export const AMINO_ACIDS_BY_ONE: Record<string, AminoAcid> = Object.fromEntries(AMINO_ACID_LIST.map((a) => [a.one, a]));
export const ONE_LETTERS = AMINO_ACID_LIST.map((a) => a.one).join("");
export const aminoAcid = (one: string): AminoAcid | null => AMINO_ACIDS_BY_ONE[one] ?? null;

/** Names and codes must agree with the genetic-code table of the Biology Translation tool (one shared convention). */
export function codeTableAgrees(): boolean {
  return AMINO_ACID_LIST.every((a) => CODE_TABLE[a.one]?.name === a.name && CODE_TABLE[a.one]?.three === a.three);
}

export const CLASS_LABEL: Record<AaClass, string> = {
  "nonpolar-aliphatic": "Nonpolar, aliphatic",
  aromatic: "Aromatic",
  "polar-uncharged": "Polar, uncharged",
  positive: "Positively charged (basic)",
  negative: "Negatively charged (acidic)",
};
/** A non-colour cue for every class: shape names used on buttons and diagrams. */
export const CLASS_SHAPE: Record<AaClass, string> = { "nonpolar-aliphatic": "●", aromatic: "⬢", "polar-uncharged": "◆", positive: "▲", negative: "▼" };

/** Side-chain charge category at about pH 7 (His is mostly neutral; its pKa is near 6). */
export function chargeAtPh7(a: AminoAcid): "negative" | "positive" | "neutral" | "mostly neutral (partly +)" {
  if (a.one === "D" || a.one === "E") return "negative";
  if (a.one === "K" || a.one === "R") return "positive";
  if (a.one === "H") return "mostly neutral (partly +)";
  return "neutral";
}

// ---- atomic masses (monoisotopic and average) for formulas written like C6H14N2O2 ----------------------------------------------
const MONO: Record<string, number> = { H: 1.00782503207, C: 12, N: 14.0030740048, O: 15.99491461956, S: 31.97207100 };
const AVG: Record<string, number> = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, S: 32.06 };

export function parseFormula(f: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) if (m[1]) out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? Number(m[2]) : 1);
  return out;
}
export function formulaText(c: Record<string, number>): string {
  const order = ["C", "H", "N", "O", "S"];
  return order.filter((e) => c[e]).map((e) => `${e}${c[e] === 1 ? "" : c[e]}`).join("");
}
export const monoMass = (c: Record<string, number>) => Object.entries(c).reduce((s, [e, n]) => s + MONO[e] * n, 0);
export const avgMass = (c: Record<string, number>) => Object.entries(c).reduce((s, [e, n]) => s + AVG[e] * n, 0);
