/**
 * Atom-level roles of an amino acid or peptide, found by substructure matching with the project's local RDKit build (the same loader and
 * molecule drawing the Organic Chemistry tools use; no second chemical-identity system). The functions take the RDKit module as an argument
 * so they can run in the browser and under the Node test harness.
 */
import { AMINO_ACIDS_BY_ONE } from "./aminoAcids";
import { peptideStructure } from "./peptide";

type Rd = any; // the RDKit JS module (untyped upstream)

function matches(rd: Rd, mol: any, smarts: string): number[][] {
  const q = rd.get_qmol(smarts);
  try {
    const raw = JSON.parse(mol.get_substruct_matches(q));
    return Array.isArray(raw) ? raw.map((m: { atoms: number[] }) => m.atoms) : [];
  } finally { q.delete?.(); }
}
const heavyCount = (mol: any): number => JSON.parse(mol.get_json()).molecules[0].atoms.length;

export interface AminoAcidRoles {
  smiles: string;
  atomCount: number;
  amino: number[];
  carboxyl: number[];
  alphaC: number;
  sideChain: number[];
  /** side-chain ionisable group atoms (absent for amino acids without one) */
  sideIonizable: number[] | null;
  donors: number[];
  acceptors: number[];
  /** names of functional groups found in the side chain, by SMARTS */
  sideGroups: string[];
}

const SIDE_GROUPS: Array<[string, string]> = [
  ["alcohol (–OH)", "[CX4][OX2H1]"], ["phenol (aryl –OH)", "c[OX2H1]"], ["thiol (–SH)", "[CX4][SX2H1]"], ["thioether (C–S–C)", "[CX4][SX2][CX4]"],
  ["carboxylic acid (–COOH)", "[CX3](=O)[OX2H1]"], ["primary amide (–CONH₂)", "[CX3](=O)[NX3H2]"], ["primary amine (–NH₂)", "[CX4][NX3H2]"], ["guanidine", "[NX3]C(=[NX2])[NX3]"],
  ["imidazole ring", "c1c[nH]cn1"], ["indole ring", "c1c[nH]c2ccccc12"], ["benzene ring", "c1ccccc1"], ["alkyl (C–H only)", "[CX4;!$(C[!#6;!#1])]"],
];
const IONIZABLE: Record<string, string> = { carboxyl: "[CX3](=O)[OX2H1]", amino: "[CX4][NX3;H2]", guanidinium: "[NX3]C(=[NX2])[NX3]", imidazole: "c1c[nH]cn1", thiol: "[SX2H1]", phenol: "c[OX2H1]" };

export function analyzeAminoAcid(rd: Rd, one: string): AminoAcidRoles | null {
  const aa = AMINO_ACIDS_BY_ONE[one];
  if (!aa) return null;
  const mol = rd.get_mol(aa.smiles);
  if (!mol) return null;
  try {
    const bb = matches(rd, mol, "[NX3][CX4][CX3](=[OX1])[OX2H1]");
    if (bb.length !== 1) return null;
    const [n, ca, c, o1, o2] = bb[0];
    const total = heavyCount(mol);
    const back = new Set(bb[0]);
    const sideChain = Array.from({ length: total }, (_, i) => i).filter((i) => !back.has(i));
    const side = new Set(sideChain);
    let sideIonizable: number[] | null = null;
    const sideAtoms = aa.groups.find((g) => g.id === "side-chain");
    if (sideAtoms?.kind) {
      const found = matches(rd, mol, IONIZABLE[sideAtoms.kind]).find((m) => m.every((i) => side.has(i)));
      sideIonizable = found ?? null;
    }
    const inSide = (list: number[][]) => [...new Set(list.flat().filter((i) => side.has(i)))].sort((x, y) => x - y);
    const donors = inSide(matches(rd, mol, "[#7,#8;!H0]"));
    const acceptors = inSide([...matches(rd, mol, "[#8]"), ...matches(rd, mol, "[nX2]"), ...matches(rd, mol, "[NX2]"), ...matches(rd, mol, "[NX3;!$(N[CX3]=[O,N]);!$(Na);!$([nX3])]")]);
    const sideGroups = SIDE_GROUPS.filter(([, smarts]) => matches(rd, mol, smarts).some((m) => m.some((i) => side.has(i)) && m.every((i) => side.has(i) || i === ca))).map(([name]) => name);
    return { smiles: aa.smiles, atomCount: total, amino: [n], carboxyl: [c, o1, o2], alphaC: ca, sideChain, sideIonizable, donors, acceptors, sideGroups };
  } finally { mol.delete?.(); }
}

export type Highlight = { atoms: number[]; color: [number, number, number] };
/** SVG of a SMILES with some atoms (and the bonds between them) highlighted; null when RDKit cannot parse it. */
export function highlightedSvg(rd: Rd, smiles: string, highlights: Highlight[], size: { width: number; height: number } = { width: 320, height: 240 }): string | null {
  const mol = rd.get_mol(smiles);
  if (!mol) return null;
  try {
    mol.set_new_coords?.();
    const json = JSON.parse(mol.get_json()).molecules[0];
    const atomColors: Record<string, number[]> = {}, bondColors: Record<string, number[]> = {};
    for (const h of highlights) {
      const set = new Set(h.atoms);
      for (const a of h.atoms) atomColors[String(a)] = h.color;
      (json.bonds as Array<{ atoms: [number, number] }>).forEach((b, bi) => { if (set.has(b.atoms[0]) && set.has(b.atoms[1])) bondColors[String(bi)] = h.color; });
    }
    return mol.get_svg_with_highlights(JSON.stringify({
      width: size.width, height: size.height, bondLineWidth: 2, padding: 0.08,
      highlightAtoms: Object.keys(atomColors).map(Number), highlightBonds: Object.keys(bondColors).map(Number),
      highlightAtomColors: atomColors, highlightBondColors: bondColors, highlightRadius: 0.32, fillHighlights: true,
      backgroundColour: [1, 1, 1, 1], atomLabelDeuteriumTritium: true,
    }));
  } finally { mol.delete?.(); }
}

/** Atom sets of a peptide for drawing: backbone, side chains, peptide-bond planar units, termini. */
export function peptideRoles(seq: string) {
  const s = peptideStructure(seq);
  const backbone = s.residues.flatMap((r) => [r.N, r.CA, r.C, r.O]);
  const side = s.residues.flatMap((r) => r.side);
  const bondAtoms = s.bonds.flatMap((b) => [b.C, b.O, b.N]);
  return { smiles: s.smiles, backbone, side, bondAtoms, nTerminalN: s.residues[0].N, cTerminalO: s.terminalO, cTerminalC: s.residues[s.residues.length - 1].C };
}
