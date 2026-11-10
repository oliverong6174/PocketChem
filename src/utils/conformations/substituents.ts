/**
 * Substituent identity and documented A-values.
 *
 * A substituent is identified by the canonical SMILES of the fragment that hangs off a ring (or
 * bond) atom, with "*" standing for the attachment point. The same RDKit canonicalisation is applied to
 * the table keys, so a methyl is "*C" however the molecule was drawn.
 *
 * A-values are conformational free-energy differences (kcal/mol) for a substituent axial versus
 * equatorial on cyclohexane. They are literature values that vary with solvent and method; the table
 * records a central value and, where known, the literature range. Substituents that are not listed are
 * NOT given a value: the model reports "no A-value" instead of guessing.
 *
 * Sources (recalled from the standard compilations, not re-read in this stage):
 *  - E. L. Eliel, S. H. Wilen, Stereochemistry of Organic Compounds, Wiley 1994, ch. 11 (conformational A-values).
 *  - F. R. Jensen, C. H. Bushweller, J. Am. Chem. Soc. 1969, 91, 3223 (low-temperature NMR A-values).
 *  - J. A. Hirsch, Topics in Stereochemistry 1967, 1, 199 (the classic table).
 *  - J. Clayden, N. Greeves, S. Warren, Organic Chemistry, 2nd ed., ch. 16 (conformational analysis).
 */
import { MAX_HEAVY_ATOMS, symbolOf, type ConformationGraph, type RdKitLike } from "./graph";

export type AValueEntry = {
  id: string;
  name: string;
  /** Canonical-able SMILES with "*" at the attachment point. */
  smiles: string;
  /** kcal/mol, equatorial preference. */
  a: number;
  range?: [number, number];
  /** "standard": well-established; "approximate": reported values scatter or depend strongly on solvent. */
  confidence: "standard" | "approximate";
  note?: string;
  /** For tert-butyl-like groups the true value is larger than any measured ring-flip equilibrium can show. */
  lowerBound?: boolean;
};

export const A_VALUE_TABLE: readonly AValueEntry[] = [
  { id: "methyl", name: "methyl", smiles: "*C", a: 1.74, confidence: "standard" },
  { id: "ethyl", name: "ethyl", smiles: "*CC", a: 1.79, confidence: "standard" },
  { id: "isopropyl", name: "isopropyl", smiles: "*C(C)C", a: 2.21, confidence: "standard" },
  {
    id: "tert-butyl", name: "tert-butyl", smiles: "*C(C)(C)C", a: 4.9, range: [4.7, 4.9], confidence: "standard", lowerBound: true,
    note: "Larger than about 4: the axial conformer is essentially unpopulated, so the value is a lower bound in practice.",
  },
  { id: "phenyl", name: "phenyl", smiles: "*c1ccccc1", a: 2.8, range: [2.7, 3.0], confidence: "standard" },
  { id: "vinyl", name: "vinyl", smiles: "*C=C", a: 1.49, confidence: "standard" },
  { id: "ethynyl", name: "ethynyl", smiles: "*C#C", a: 0.41, confidence: "approximate" },
  { id: "fluoro", name: "fluoro", smiles: "*F", a: 0.25, range: [0.24, 0.28], confidence: "standard" },
  { id: "chloro", name: "chloro", smiles: "*Cl", a: 0.53, range: [0.43, 0.6], confidence: "standard" },
  { id: "bromo", name: "bromo", smiles: "*Br", a: 0.48, range: [0.38, 0.6], confidence: "standard" },
  { id: "iodo", name: "iodo", smiles: "*I", a: 0.47, range: [0.4, 0.6], confidence: "standard" },
  { id: "hydroxyl", name: "hydroxyl", smiles: "*O", a: 0.87, range: [0.6, 1.04], confidence: "standard", note: "Solvent dependent (hydrogen bonding)." },
  { id: "methoxy", name: "methoxy", smiles: "*OC", a: 0.74, range: [0.55, 0.75], confidence: "standard" },
  { id: "acetoxy", name: "acetoxy", smiles: "*OC(C)=O", a: 0.71, confidence: "approximate" },
  { id: "amino", name: "amino", smiles: "*N", a: 1.2, range: [1.2, 1.6], confidence: "approximate", note: "Strongly solvent and protonation dependent." },
  { id: "thiol", name: "sulfanyl (SH)", smiles: "*S", a: 1.1, range: [0.9, 1.2], confidence: "approximate" },
  { id: "cyano", name: "cyano", smiles: "*C#N", a: 0.17, range: [0.15, 0.25], confidence: "standard" },
  { id: "carboxyl", name: "carboxylic acid", smiles: "*C(=O)O", a: 1.35, confidence: "standard" },
  { id: "methyl-ester", name: "methoxycarbonyl", smiles: "*C(=O)OC", a: 1.27, confidence: "standard" },
  { id: "nitro", name: "nitro", smiles: "*[N+](=O)[O-]", a: 1.1, confidence: "approximate" },
  { id: "trifluoromethyl", name: "trifluoromethyl", smiles: "*C(F)(F)F", a: 2.5, range: [2.1, 2.5], confidence: "approximate" },
];

export type SubstituentIdentity = {
  /** Attachment atom (the first atom of the substituent). */
  atom: number;
  /** Canonical fragment SMILES with "*", or null when the fragment loops back to the ring. */
  key: string | null;
  /** Atoms of the substituent in the input molecule. */
  atoms: number[];
  /** Short display name. */
  label: string;
  /** Matching table entry, if any. */
  aValue: AValueEntry | null;
  /** The substituent reconnects to the ring system (bridged, fused or spiro): not a free substituent. */
  reconnects: boolean;
};

const keyCache = new WeakMap<object, Map<string, string | null>>();

function molblockFor(graph: ConformationGraph, atoms: number[], attachedTo: number): string | null {
  // Atom 1 is the dummy "*"; the substituent atoms follow, in the order given.
  const order = [attachedTo, ...atoms];
  const position = new Map<number, number>();
  order.forEach((atom, i) => position.set(atom, i + 1));
  const bonds = graph.bonds.filter((bond) => position.has(bond.a) && position.has(bond.b));
  const dummyBond = graph.bonds.find((bond) => (bond.a === attachedTo && atoms.includes(bond.b)) || (bond.b === attachedTo && atoms.includes(bond.a)));
  if (!dummyBond) return null;
  const lines = ["", "  conformations", ""];
  lines.push(`${String(order.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`);
  order.forEach((atom, i) => {
    const symbol = i === 0 ? "*" : symbolOf(graph.atoms[atom].atomicNumber);
    lines.push(`    0.0000    0.0000    0.0000 ${symbol.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  });
  for (const bond of bonds) {
    // Bonds from the dummy are rewritten to the attachment slot; the ring atom itself is not part of the fragment.
    const a = bond.a === attachedTo ? 1 : position.get(bond.a)!;
    const b = bond.b === attachedTo ? 1 : position.get(bond.b)!;
    lines.push(`${String(a).padStart(3)}${String(b).padStart(3)}${String(bond.order).padStart(3)}  0`);
  }
  const charges = order.map((atom, i) => ({ i, c: i === 0 ? 0 : graph.atoms[atom].charge })).filter((entry) => entry.c !== 0);
  if (charges.length > 0) lines.push(`M  CHG${String(charges.length).padStart(3)}${charges.map((e) => `${String(e.i + 1).padStart(4)}${String(e.c).padStart(4)}`).join("")}`);
  const isotopes = order.map((atom, i) => ({ i, m: i === 0 ? 0 : graph.atoms[atom].isotope })).filter((entry) => entry.m !== 0);
  if (isotopes.length > 0) lines.push(`M  ISO${String(isotopes.length).padStart(3)}${isotopes.map((e) => `${String(e.i + 1).padStart(4)}${String(e.m).padStart(4)}`).join("")}`);
  lines.push("M  END");
  return lines.join("\n");
}

/** Canonical SMILES of a SMILES-with-"*" string, or null when RDKit rejects it. */
function canonicalKey(rdkit: RdKitLike, smiles: string): string | null {
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
}

let tableKeys: Map<string, AValueEntry> | null = null;
function tableLookup(rdkit: RdKitLike): Map<string, AValueEntry> {
  if (tableKeys) return tableKeys;
  const map = new Map<string, AValueEntry>();
  for (const entry of A_VALUE_TABLE) {
    const key = canonicalKey(rdkit, entry.smiles);
    if (key) map.set(key, entry);
  }
  tableKeys = map;
  return map;
}

/**
 * Identifies the substituent that starts at `atom` and hangs off `from`. `blocked` are atoms the
 * walk must not enter (the ring being analysed); reaching one of them means the group is not free.
 */
export function identifySubstituent(
  rdkit: RdKitLike,
  graph: ConformationGraph,
  from: number,
  atom: number,
  blocked: ReadonlySet<number>,
): SubstituentIdentity {
  const cacheKey = `${from}>${atom}|${[...blocked].sort((a, b) => a - b).join(",")}`;
  let cache = keyCache.get(graph);
  if (!cache) {
    cache = new Map();
    keyCache.set(graph, cache);
  }
  const atoms: number[] = [];
  const seen = new Set<number>([from]);
  const stack = [atom];
  let reconnects = false;
  while (stack.length > 0 && atoms.length <= MAX_HEAVY_ATOMS) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    atoms.push(current);
    for (const next of graph.atoms[current].neighbors) {
      if (next === from) continue;
      if (blocked.has(next)) {
        reconnects = true;
        continue;
      }
      if (!seen.has(next)) stack.push(next);
    }
  }
  atoms.sort((a, b) => a - b);
  const heavy = graph.atoms[atom];
  const fallbackLabel = heavy.atomicNumber === 1 ? "H" : heavy.symbol;
  if (reconnects) return { atom, key: null, atoms, label: fallbackLabel, aValue: null, reconnects: true };
  let key: string | null;
  if (cache.has(cacheKey)) {
    key = cache.get(cacheKey) ?? null;
  } else {
    const block = molblockFor(graph, atoms, from);
    key = null;
    if (block) {
      const mol = rdkit.get_mol(block);
      if (mol) {
        try {
          key = mol.get_smiles();
        } finally {
          mol.delete();
        }
      }
    }
    cache.set(cacheKey, key);
  }
  const entry = key ? (tableLookup(rdkit).get(key) ?? null) : null;
  return { atom, key, atoms, label: entry?.name ?? (key ? key.replace("*", "–") : fallbackLabel), aValue: entry, reconnects: false };
}
