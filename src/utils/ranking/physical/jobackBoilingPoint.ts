/**
 * Normal boiling point estimated by the Joback-Reid group-contribution method (Joback & Reid, Chem. Eng. Commun. 57, 233, 1987;
 * constants as tabulated in Poling, Prausnitz & O'Connell, The Properties of Gases and Liquids, 5th ed., ch. 2):
 *
 *     Tb [K] = 198 + sum(n_i * dTb_i)
 *
 * The published average absolute error is about 12 K, and large for strongly hydrogen-bonded amides, so the estimate is used to ORDER molecules,
 * never to quote a temperature as an experimental value. Structures containing groups the method has no parameter for (amides, ureas,
 * charges, sulfoxides/sulfones, phosphorus, silicon, boron, metals, acyl halides, anhydrides, carbonates) return null: the caller must
 * report "not estimated" rather than guess.
 */

type Matcher = { name: string; smarts: string; value: number; claim: "first" | number };
type RdkitMolLike = {
  get_substruct_matches?: (query: unknown) => string;
};
type RdkitLike = { get_qmol: (smarts: string) => ({ delete?: () => void } | null) };

/** Groups that need more than one atom (checked first, in this order; every matched atom is then consumed). */
const MULTI_ATOM_GROUPS: Matcher[] = [
  { name: "-CN", smarts: "[CX2]#[NX1]", value: 125.66, claim: 2 },
  { name: "-NO2", smarts: "[NX3+](=O)[O-]", value: 152.54, claim: 3 },
  { name: "-NO2", smarts: "[NX3](=O)=O", value: 152.54, claim: 3 },
  { name: "-COOH", smarts: "[CX3](=O)[OX2H1]", value: 169.09, claim: 3 },
  { name: "-COO- (ester)", smarts: "[CX3](=O)[OX2H0][#6]", value: 81.1, claim: 3 },
  { name: "O=CH- (aldehyde)", smarts: "[CX3H1](=O)[#6]", value: 72.24, claim: 2 },
  { name: ">C=O (ring)", smarts: "[CX3;R](=O)([#6])[#6]", value: 94.97, claim: 2 },
  { name: ">C=O (non-ring)", smarts: "[CX3;!R](=O)([#6])[#6]", value: 76.75, claim: 2 },
];

/** Atoms the method cannot parameterise: any match makes the whole estimate unavailable. */
const UNSUPPORTED_PATTERNS: Array<{ name: string; smarts: string }> = [
  { name: "amide, urea, carbamate or imide", smarts: "[CX3](=[OX1,SX1])[NX3]" },
  { name: "acyl halide or anhydride", smarts: "[$([CX3](=O)[Cl,Br,I,F]),$([CX3](=O)O[CX3]=O)]" },
  { name: "carbonate or carbamate", smarts: "[OX2][CX3](=O)[OX2,NX3]" },
  { name: "sulfoxide, sulfone or sulfonate", smarts: "[SX3,SX4,SX5,SX6]" },
  { name: "charged atom", smarts: "[+,-;!$([NX3+](=O)[O-]);!$([O-][NX3+]=O)]" },
  { name: "unsupported element", smarts: "[!#1;!#6;!#7;!#8;!#9;!#16;!#17;!#35;!#53]" },
  { name: "N-oxide, azo, hydrazine, nitroso or nitrite", smarts: "[$([NX2]=[NX2]),$([NX3][NX3]),$([NX2]=O),$([NX3;!$([N+](=O)[O-])]-[OX2])]" },
];

/** Single-atom environments, most specific first. The first pattern that claims an atom decides its group. */
const ATOM_GROUPS: Matcher[] = [
  { name: "-F", smarts: "[F]", value: -0.03, claim: "first" },
  { name: "-Cl", smarts: "[Cl]", value: 38.13, claim: "first" },
  { name: "-Br", smarts: "[Br]", value: 66.86, claim: "first" },
  { name: "-I", smarts: "[I]", value: 93.84, claim: "first" },
  { name: "-OH (alcohol)", smarts: "[OX2H1][CX4]", value: 92.88, claim: "first" },
  { name: "-OH (phenol/enol)", smarts: "[OX2H1][#6;!X4]", value: 76.34, claim: "first" },
  { name: "-O- (ring)", smarts: "[OX2H0;R]([#6])[#6]", value: 31.22, claim: "first" },
  { name: "-O- (non-ring)", smarts: "[OX2H0;!R]([#6])[#6]", value: 22.42, claim: "first" },
  { name: "-O- (aromatic)", smarts: "[o]", value: 31.22, claim: "first" },
  { name: "=O (other)", smarts: "[OX1]=*", value: -10.5, claim: "first" },
  { name: "-NH2", smarts: "[NX3H2][#6]", value: 73.23, claim: "first" },
  { name: ">NH (ring)", smarts: "[NX3H1;R]([#6])[#6]", value: 52.82, claim: "first" },
  { name: ">NH (non-ring)", smarts: "[NX3H1;!R]([#6])[#6]", value: 50.17, claim: "first" },
  { name: ">NH (aromatic)", smarts: "[nH]", value: 52.82, claim: "first" },
  { name: ">N- (aliphatic)", smarts: "[NX3H0]([#6])([#6])[#6]", value: 11.74, claim: "first" },
  { name: ">N- (aromatic)", smarts: "[nX3H0]", value: 11.74, claim: "first" },
  { name: "=NH", smarts: "[NX2H1]=[#6]", value: 83.08, claim: "first" },
  { name: "-N= (ring)", smarts: "[NX2H0;R]=[#6]", value: 57.55, claim: "first" },
  { name: "-N= (aromatic)", smarts: "[nX2]", value: 57.55, claim: "first" },
  { name: "-N= (non-ring)", smarts: "[NX2H0;!R]=[#6]", value: 74.6, claim: "first" },
  { name: "-SH", smarts: "[SX2H1]", value: 63.56, claim: "first" },
  { name: "-S- (ring)", smarts: "[SX2H0;R]", value: 52.1, claim: "first" },
  { name: "-S- (non-ring)", smarts: "[SX2H0;!R]", value: 68.78, claim: "first" },
  { name: "-S- (aromatic)", smarts: "[s]", value: 52.1, claim: "first" },
  { name: "=C= (allene)", smarts: "[CX2](=[#6])=[#6]", value: 26.15, claim: "first" },
  { name: "#CH", smarts: "[CX2H1]#[#6]", value: 9.2, claim: "first" },
  { name: "#C-", smarts: "[CX2H0]#[#6]", value: 27.38, claim: "first" },
  { name: "-CH3", smarts: "[CX4H3]", value: 23.58, claim: "first" },
  { name: "-CH2- (ring)", smarts: "[CX4H2;R]", value: 27.15, claim: "first" },
  { name: "-CH2- (non-ring)", smarts: "[CX4H2;!R]", value: 22.88, claim: "first" },
  { name: ">CH- (ring)", smarts: "[CX4H1;R]", value: 21.78, claim: "first" },
  { name: ">CH- (non-ring)", smarts: "[CX4H1;!R]", value: 21.74, claim: "first" },
  { name: ">C< (ring)", smarts: "[CX4H0;R]", value: 21.32, claim: "first" },
  { name: ">C< (non-ring)", smarts: "[CX4H0;!R]", value: 18.25, claim: "first" },
  { name: "=CH2", smarts: "[CX3H2]=[#6]", value: 18.18, claim: "first" },
  { name: "=CH- / aromatic CH (ring)", smarts: "[CX3H1,cH1;R]", value: 26.73, claim: "first" },
  { name: "=CH- (non-ring)", smarts: "[CX3H1;!R]", value: 24.96, claim: "first" },
  { name: "=C< / aromatic C (ring)", smarts: "[CX3H0,cH0;R]", value: 31.01, claim: "first" },
  { name: "=C< (non-ring)", smarts: "[CX3H0;!R]", value: 24.14, claim: "first" },
];

export type JobackEstimate =
  | { ok: true; boilingPointK: number; groups: Array<{ name: string; count: number; value: number }> }
  | { ok: false; reason: string };

function parseAtomLists(raw: string | undefined): number[][] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      const atoms = Array.isArray(entry) ? entry : (entry as { atoms?: unknown[] })?.atoms;
      return Array.isArray(atoms) ? atoms.map(Number).filter(Number.isFinite) : [];
    });
  } catch {
    return [];
  }
}

function matchesOf(rdkit: RdkitLike, mol: RdkitMolLike, smarts: string): number[][] {
  const query = rdkit.get_qmol(smarts);
  if (!query) return [];
  try {
    return parseAtomLists(mol.get_substruct_matches?.(query));
  } finally {
    query.delete?.();
  }
}

/**
 * `mol` must be a single-fragment molecule with implicit hydrogens (as produced by RDKit from a SMILES string); `heavyAtomCount` is the
 * number of non-hydrogen atoms, used to confirm that every atom was assigned to exactly one group.
 */
export function estimateJobackBoilingPoint(rdkit: RdkitLike, mol: RdkitMolLike, heavyAtomCount: number): JobackEstimate {
  if (heavyAtomCount < 2) return { ok: false, reason: "single-atom or empty structure" };

  for (const unsupported of UNSUPPORTED_PATTERNS) {
    if (matchesOf(rdkit, mol, unsupported.smarts).length > 0) {
      return { ok: false, reason: `contains ${unsupported.name}, which the group-contribution method does not parameterise` };
    }
  }

  const claimed = new Set<number>();
  const tally = new Map<string, { count: number; value: number }>();
  const add = (name: string, value: number) => {
    const entry = tally.get(name) ?? { count: 0, value };
    entry.count += 1;
    tally.set(name, entry);
  };

  for (const group of MULTI_ATOM_GROUPS) {
    const size = typeof group.claim === "number" ? group.claim : 1;
    for (const match of matchesOf(rdkit, mol, group.smarts)) {
      const members = match.slice(0, size);
      if (members.some((atom) => claimed.has(atom))) continue;
      members.forEach((atom) => claimed.add(atom));
      add(group.name, group.value);
    }
  }

  for (const group of ATOM_GROUPS) {
    for (const match of matchesOf(rdkit, mol, group.smarts)) {
      const centre = match[0];
      if (centre === undefined || claimed.has(centre)) continue;
      claimed.add(centre);
      add(group.name, group.value);
    }
  }

  if (claimed.size !== heavyAtomCount) {
    return { ok: false, reason: "some atoms fall outside the method's group definitions" };
  }

  let sum = 0;
  for (const entry of tally.values()) sum += entry.count * entry.value;
  return {
    ok: true,
    boilingPointK: 198 + sum,
    groups: [...tally.entries()].map(([name, entry]) => ({ name, count: entry.count, value: entry.value })),
  };
}
