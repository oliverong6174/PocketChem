/**
 * Stage 9N: the shared molecular graph behind every conformational view.
 *
 * Built once from RDKit (SMILES or molfile). Atom indices are RDKit's own indices for the input
 * molecule, so a bond or ring picked on one view means the same atoms on every other view and in
 * saved analyses. Hydrogens that are implicit in the input get indices AFTER the input atoms
 * (`implicitHydrogenBase` and above) and exist only inside `neighbors`, where tetrahedral
 * chirality needs them.
 *
 * Nothing here invents stereochemistry: a centre without a chiral tag in the input has
 * `chirality[index] === undefined`.
 */

/** The slice of the RDKit JS API this module uses (kept structural so tests can pass the real module). */
export type RdMolLike = {
  delete(): void;
  get_smiles(): string;
  get_json(): string;
  get_molblock(): string;
  has_coords(): boolean;
  set_new_coords?(): unknown;
  add_hs_in_place(): unknown;
  is_valid?(): boolean;
};
export type RdKitLike = { get_mol(input: string, details?: string): RdMolLike | null };

export type GraphAtom = {
  index: number;
  atomicNumber: number;
  symbol: string;
  charge: number;
  /** 0 means the natural-abundance isotope mix. */
  isotope: number;
  aromatic: boolean;
  /** Hydrogens on this atom: implicit ones plus explicit hydrogen neighbours. */
  hydrogenCount: number;
  /** Heavy-atom (and explicit-H) neighbours present in the INPUT molecule. */
  neighbors: number[];
  ringMemberships: number;
};

export type GraphBond = {
  index: number;
  a: number;
  b: number;
  /** Kekulé order, 1 to 3. */
  order: number;
  aromatic: boolean;
  inRing: boolean;
};

export type ChiralTag = "cw" | "ccw";

export type ConformationGraph = {
  smiles: string;
  atoms: GraphAtom[];
  bonds: GraphBond[];
  /** Atom-index cycles of the smallest set of smallest rings, each in path order. */
  rings: number[][];
  /**
   * Every neighbour of every atom, hydrogens included, in RDKit bond order (the order its chiral
   * tag refers to). Implicit hydrogens are appended as virtual atoms with indices >= implicitHydrogenBase.
   */
  fullNeighbors: number[][];
  /** RDKit tetrahedral tag per atom, relative to `fullNeighbors` order. Absent = unspecified. */
  chirality: Record<number, ChiralTag>;
  /** Number of atoms in the input molecule; virtual implicit hydrogens have indices at or above this. */
  implicitHydrogenBase: number;
  /** 2D drawing coordinates (input coordinates when present, generated otherwise). */
  coords2D: Array<{ x: number; y: number }>;
  /** Where the 2D coordinates came from. */
  coordsSource: "input" | "generated";
};

export type GraphResult = { ok: true; graph: ConformationGraph } | { ok: false; message: string };

const SYMBOLS = [
  "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y",
  "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I",
];
export const symbolOf = (atomicNumber: number): string => SYMBOLS[atomicNumber] ?? `#${atomicNumber}`;

/** The largest molecule the conformation tools accept, so every view stays interactive. */
export const MAX_HEAVY_ATOMS = 120;

type JsonAtom = { z?: number; impHs?: number; chg?: number; isotope?: number; stereo?: string };
type JsonBond = { bo?: number; atoms: [number, number] };
type JsonMol = {
  atoms: JsonAtom[];
  bonds: JsonBond[];
  extensions?: Array<{ name: string; aromaticAtoms?: number[]; aromaticBonds?: number[]; atomRings?: number[][] }>;
};

function readJson(text: string): JsonMol | null {
  try {
    const parsed = JSON.parse(text) as { molecules?: JsonMol[] };
    return parsed.molecules?.[0] ?? null;
  } catch {
    return null;
  }
}

function parseCoords(molblock: string, atomCount: number): Array<{ x: number; y: number }> | null {
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 4) return null;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (!line) return null;
    const x = Number.parseFloat(line.slice(0, 10));
    const y = Number.parseFloat(line.slice(10, 20));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push({ x, y });
  }
  return out;
}

/** Parses SMILES or a molfile into the shared graph. The RDKit objects are always released. */
export function buildConformationGraph(rdkit: RdKitLike, input: string): GraphResult {
  // A Molfile starts with a title line that is often empty: trimming it shifts the header and the file no longer parses.
  const text = /M {2}END/.test(input) ? input : input.trim();
  if (!text) return { ok: false, message: "No structure was given." };
  const plain = rdkit.get_mol(text);
  if (!plain || (plain.is_valid && !plain.is_valid())) {
    plain?.delete();
    return { ok: false, message: "The structure could not be read." };
  }
  const withH = rdkit.get_mol(text);
  try {
    const heavy = readJson(plain.get_json());
    if (!heavy) return { ok: false, message: "The structure could not be read." };
    if (heavy.atoms.length === 0) return { ok: false, message: "The structure is empty." };
    if (heavy.atoms.length > MAX_HEAVY_ATOMS + heavy.atoms.filter((a) => a.z === 1).length) {
      return { ok: false, message: `The conformation tools accept molecules of up to ${MAX_HEAVY_ATOMS} heavy atoms.` };
    }
    const smiles = plain.get_smiles();
    if (smiles.includes(".")) return { ok: false, message: "Enter a single molecule (the structure has several disconnected parts)." };

    const extension = heavy.extensions?.find((entry) => entry.name === "rdkitRepresentation");
    const aromaticAtoms = new Set(extension?.aromaticAtoms ?? []);
    const aromaticBonds = new Set(extension?.aromaticBonds ?? []);
    const rings = (extension?.atomRings ?? []).map((ring) => [...ring]);

    const n = heavy.atoms.length;
    const bonds: GraphBond[] = heavy.bonds.map((bond, index) => ({
      index,
      a: bond.atoms[0],
      b: bond.atoms[1],
      order: bond.bo ?? 1,
      aromatic: aromaticBonds.has(index),
      inRing: false,
    }));
    const ringBondKeys = new Set<string>();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        ringBondKeys.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      }
    }
    for (const bond of bonds) bond.inRing = ringBondKeys.has(bond.a < bond.b ? `${bond.a}-${bond.b}` : `${bond.b}-${bond.a}`);

    const neighbors: number[][] = Array.from({ length: n }, () => []);
    for (const bond of bonds) {
      neighbors[bond.a].push(bond.b);
      neighbors[bond.b].push(bond.a);
    }
    const ringCounts = new Array<number>(n).fill(0);
    for (const ring of rings) for (const atom of ring) ringCounts[atom] += 1;

    const atoms: GraphAtom[] = heavy.atoms.map((atom, index) => {
      const atomicNumber = atom.z ?? 6;
      const explicitH = neighbors[index].filter((other) => (heavy.atoms[other].z ?? 6) === 1).length;
      return {
        index,
        atomicNumber,
        symbol: symbolOf(atomicNumber),
        charge: atom.chg ?? 0,
        isotope: atom.isotope ?? 0,
        aromatic: aromaticAtoms.has(index),
        hydrogenCount: (atom.impHs ?? 0) + explicitH,
        neighbors: neighbors[index],
        ringMemberships: ringCounts[index],
      };
    });

    // Chirality needs the implicit hydrogens as real neighbours: RDKit expresses the tag against the
    // bond order of the hydrogen-complete molecule, and add_hs keeps the input atoms' indices.
    const complete = withH ? (withH.add_hs_in_place(), readJson(withH.get_json())) : null;
    if (!complete) return { ok: false, message: "The structure could not be read." };
    const fullNeighbors: number[][] = Array.from({ length: complete.atoms.length }, () => []);
    for (const bond of complete.bonds) {
      fullNeighbors[bond.atoms[0]].push(bond.atoms[1]);
      fullNeighbors[bond.atoms[1]].push(bond.atoms[0]);
    }
    const chirality: Record<number, ChiralTag> = {};
    complete.atoms.forEach((atom, index) => {
      if (index < n && (atom.stereo === "cw" || atom.stereo === "ccw")) chirality[index] = atom.stereo;
    });

    let coordsSource: "input" | "generated" = plain.has_coords() ? "input" : "generated";
    if (!plain.has_coords() && plain.set_new_coords) plain.set_new_coords();
    let coords2D = parseCoords(plain.get_molblock(), n);
    if (!coords2D) {
      coordsSource = "generated";
      coords2D = Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));
    }

    return {
      ok: true,
      graph: { smiles, atoms, bonds, rings, fullNeighbors, chirality, implicitHydrogenBase: n, coords2D, coordsSource },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The structure could not be read." };
  } finally {
    plain.delete();
    withH?.delete();
  }
}

export const bondBetween = (graph: ConformationGraph, a: number, b: number): GraphBond | undefined =>
  graph.bonds.find((bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a));

export const isHydrogenIndex = (graph: ConformationGraph, index: number): boolean =>
  index >= graph.implicitHydrogenBase || graph.atoms[index]?.atomicNumber === 1;

/** Parity (+1 even, -1 odd) of the permutation taking `from` to `to` (same elements). */
export function permutationParity(from: readonly number[], to: readonly number[]): 1 | -1 {
  const position = new Map<number, number>();
  from.forEach((value, i) => position.set(value, i));
  const perm = to.map((value) => position.get(value) ?? -1);
  let parity: 1 | -1 = 1;
  const seen = new Array<boolean>(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      length += 1;
    }
    if (length % 2 === 0) parity = (parity * -1) as 1 | -1;
  }
  return parity;
}

/**
 * Handedness of `center` for an explicit neighbour order: +1 when, looking from the first neighbour,
 * the other three run clockwise; -1 when anticlockwise; 0 when the input does not specify it.
 * `ordered` must be a permutation of the centre's four neighbours (hydrogens included).
 */
export function chiralSense(graph: ConformationGraph, center: number, ordered: readonly number[]): 1 | -1 | 0 {
  const tag = graph.chirality[center];
  const base = graph.fullNeighbors[center];
  if (!tag || !base || base.length !== 4 || ordered.length !== 4) return 0;
  const parity = permutationParity(base, ordered);
  const sign = tag === "cw" ? 1 : -1;
  return (sign * parity) as 1 | -1;
}
