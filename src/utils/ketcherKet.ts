/**
 * Minimal Ketcher KET -> V3000 bridge used when Ketcher's standalone Indigo
 * export service is unavailable/hanging. Keeping this conversion outside the
 * synthesis component makes stereo preservation testable in isolation.
 */

export type KetAtom = {
  label?: string;
  location?: number[];
  charge?: number;
  isotope?: number;
  radical?: number;
};

export type KetBond = {
  type?: number;
  atoms?: number[];
  stereo?: number;
};

export type KetMolecule = {
  type?: string;
  atoms?: KetAtom[];
  bonds?: KetBond[];
};

export type KetDocument = {
  root?: {
    nodes?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

function v3000AtomLabel(label: string | undefined): string {
  const normalized = (label ?? "C").trim();
  if (!normalized) return "C";
  if (normalized === "R" || normalized === "R#" || /^R\d+$/.test(normalized)) {
    return "*";
  }
  return normalized;
}

function v3000BondType(type: number | undefined): number {
  return type === 2 || type === 3 || type === 4 ? type : 1;
}

/**
 * Ketcher's common KET bond stereo codes map to molfile/V3000 CFG values:
 *   1 = wedge/up    -> CFG=1
 *   4 = either      -> CFG=2
 *   6 = hash/down   -> CFG=3
 *
 * V3000 CFG is written on the bond with the original begin/end atom order;
 * that directionality is essential for tetrahedral chirality to survive the
 * KET -> V3000 -> RDKit path.
 */
function v3000BondCfg(stereo: number | undefined): string {
  if (stereo === 1) return " CFG=1";
  if (stereo === 4) return " CFG=2";
  if (stereo === 6) return " CFG=3";
  return "";
}

export function ketMoleculeHasDefinedWedgeStereo(molecule: KetMolecule): boolean {
  return (molecule.bonds ?? []).some(
    (bond) => bond.stereo === 1 || bond.stereo === 6,
  );
}

export function ketMoleculeToV3000(molecule: KetMolecule): string | null {
  const atoms = Array.isArray(molecule.atoms) ? molecule.atoms : [];
  const bonds = Array.isArray(molecule.bonds) ? molecule.bonds : [];
  if (atoms.length === 0) return null;

  const atomLines = atoms.map((atom, index) => {
    const location = Array.isArray(atom.location) ? atom.location : [];
    const x = Number.isFinite(location[0]) ? Number(location[0]) : 0;
    const y = Number.isFinite(location[1]) ? Number(location[1]) : 0;
    const z = Number.isFinite(location[2]) ? Number(location[2]) : 0;
    const properties: string[] = [];

    if (Number.isFinite(atom.charge) && atom.charge !== 0) {
      properties.push(`CHG=${Math.trunc(atom.charge as number)}`);
    }
    if (Number.isFinite(atom.isotope) && (atom.isotope as number) > 0) {
      properties.push(`MASS=${Math.trunc(atom.isotope as number)}`);
    }
    if (
      Number.isFinite(atom.radical) &&
      (atom.radical as number) >= 1 &&
      (atom.radical as number) <= 3
    ) {
      properties.push(`RAD=${Math.trunc(atom.radical as number)}`);
    }

    return `M  V30 ${index + 1} ${v3000AtomLabel(atom.label)} ${x} ${y} ${z} 0${
      properties.length ? ` ${properties.join(" ")}` : ""
    }`;
  });

  const bondLines = bonds.flatMap((bond, index) => {
    if (!Array.isArray(bond.atoms) || bond.atoms.length < 2) return [];
    const begin = bond.atoms[0];
    const end = bond.atoms[1];
    if (!Number.isInteger(begin) || !Number.isInteger(end)) return [];
    if (begin < 0 || end < 0 || begin >= atoms.length || end >= atoms.length) return [];

    return [
      `M  V30 ${index + 1} ${v3000BondType(bond.type)} ${begin + 1} ${end + 1}${v3000BondCfg(
        bond.stereo,
      )}`,
    ];
  });

  return [
    "PocketChem",
    "  Ketcher KET export",
    "",
    "  0  0  0  0  0  0            999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${atoms.length} ${bondLines.length} 0 0 0`,
    "M  V30 BEGIN ATOM",
    ...atomLines,
    "M  V30 END ATOM",
    "M  V30 BEGIN BOND",
    ...bondLines,
    "M  V30 END BOND",
    "M  V30 END CTAB",
    "M  END",
  ].join("\n");
}

export function extractKetMolecules(ket: KetDocument): KetMolecule[] {
  const molecules: KetMolecule[] = [];
  const seenRefs = new Set<string>();
  const nodes = Array.isArray(ket.root?.nodes) ? ket.root?.nodes ?? [] : [];

  for (const node of nodes) {
    const ref = typeof node?.$ref === "string" ? node.$ref : null;
    if (!ref || seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    const candidate = ket[ref];
    if (
      candidate &&
      typeof candidate === "object" &&
      (candidate as KetMolecule).type === "molecule"
    ) {
      molecules.push(candidate as KetMolecule);
    }
  }

  // Defensive fallback for KET documents that omit root references.
  if (molecules.length === 0) {
    for (const candidate of Object.values(ket)) {
      if (
        candidate &&
        typeof candidate === "object" &&
        (candidate as KetMolecule).type === "molecule"
      ) {
        molecules.push(candidate as KetMolecule);
      }
    }
  }

  return molecules;
}
