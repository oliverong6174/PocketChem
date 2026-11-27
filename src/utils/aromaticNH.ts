/**
 * The packed ChEBI SMILES write pyrrole-type nitrogen as a bare "n", which no toolkit can read ("c1ccnc1" for pyrrole).
 * The hydrogen is put back only when the result parses AND its element counts equal the formula ChEBI records for that
 * entry. Where several placements satisfy both they are tautomers: an amide-like N–H next to C=O is preferred, then
 * the first in the stored order, and the caller is told that one tautomer is shown.
 */

type Query = { delete(): void };
type Mol = { get_smiles(): string; get_json(): string; get_substruct_matches?(query: Query): string; delete(): void };
export type NhToolkit = { get_mol(smiles: string): Mol | null; get_qmol(smarts: string): Query | null };

export type RestoredStructure = { smiles: string; tautomer: boolean };

const SYMBOLS: Record<number, string> = {
  1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 11: "Na", 12: "Mg", 14: "Si", 15: "P", 16: "S", 17: "Cl", 19: "K",
  20: "Ca", 25: "Mn", 26: "Fe", 27: "Co", 28: "Ni", 29: "Cu", 30: "Zn", 33: "As", 34: "Se", 35: "Br", 50: "Sn", 53: "I",
};
const MAX_ATTEMPTS = 600;

function formulaKey(counts: Map<string, number>): string {
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, n]) => `${symbol}${n}`).join("");
}

/** Plain element counts only: variable or isotopic formulae return null and are never repaired. */
function parseFormula(formula: string): string | null {
  if (!/^(?:[A-Z][a-z]?\d*|\.)+$/.test(formula)) return null;
  const known = new Set(Object.values(SYMBOLS));
  const counts = new Map<string, number>();
  for (const [, symbol, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (!known.has(symbol)) return null;
    counts.set(symbol, (counts.get(symbol) ?? 0) + Number(n || 1));
  }
  return formulaKey(counts);
}

function molFormula(mol: Mol): string | null {
  const json = JSON.parse(mol.get_json());
  const defaults = { z: 6, impHs: 0, ...(json.defaults?.atom ?? {}) };
  const counts = new Map<string, number>();
  const add = (symbol: string, n: number) => { if (n > 0) counts.set(symbol, (counts.get(symbol) ?? 0) + n); };
  for (const molecule of json.molecules ?? []) {
    for (const atom of molecule.atoms ?? []) {
      const symbol = SYMBOLS[atom.z ?? defaults.z];
      if (!symbol) return null;
      add(symbol, 1);
      add("H", atom.impHs ?? defaults.impHs);
    }
  }
  return formulaKey(counts);
}

/** Offsets of unbracketed aromatic "n" atoms. */
function bareNitrogens(smiles: string): number[] {
  const found: number[] = [];
  let bracket = false;
  for (let i = 0; i < smiles.length; i += 1) {
    if (smiles[i] === "[") bracket = true;
    else if (smiles[i] === "]") bracket = false;
    else if (!bracket && smiles[i] === "n") found.push(i);
  }
  return found;
}

function* choose(items: number[], size: number, start = 0): Generator<number[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i += 1) {
    for (const rest of choose(items, size - 1, i + 1)) yield [items[i], ...rest];
  }
}

export function restoreAromaticNH(rdkit: NhToolkit, smiles: string, formula: string | null): RestoredStructure | null {
  const wanted = formula ? parseFormula(formula) : null;
  const sites = bareNitrogens(smiles);
  if (!wanted || sites.length === 0) return null;
  const amide = rdkit.get_qmol("[nH]c=O");
  let attempts = 0;
  try {
    for (let size = 1; size <= Math.min(sites.length, 4); size += 1) {
      const matches = new Map<string, number>();
      for (const picked of choose(sites, size)) {
        if ((attempts += 1) > MAX_ATTEMPTS) break;
        let candidate = smiles;
        for (const at of [...picked].reverse()) candidate = `${candidate.slice(0, at)}[nH]${candidate.slice(at + 1)}`;
        const mol = rdkit.get_mol(candidate);
        if (!mol) continue;
        try {
          if (molFormula(mol) !== wanted) continue;
          const canonical = mol.get_smiles();
          if (matches.has(canonical)) continue;
          const hits = amide && mol.get_substruct_matches ? JSON.parse(mol.get_substruct_matches(amide)) : [];
          matches.set(canonical, Array.isArray(hits) ? hits.length : 0);
        } finally {
          mol.delete();
        }
      }
      if (matches.size > 0) {
        // Stable sort: equal scores keep the order the placements were tried in.
        const [best] = [...matches].sort((a, b) => b[1] - a[1]);
        return { smiles: best[0], tautomer: matches.size > 1 };
      }
    }
    return null;
  } finally {
    amide?.delete();
  }
}
