import type { ParsedMol, Substituent } from "../types";
import { getOtherAtom } from "../molParser";
import { buildBranchName } from "../branch/branchConstructor";
import { getNitrogenSubstituentPrefix } from "../classifiers/nitrogen";
import { classifyOxygen } from "../classifiers/oxygen";
import { alkylNameToAlkoxyName } from "../alkoxyNames";
import { getAlphabetizationKey } from "./prefixAlphabetization";

type RDKitQuery = { delete?: () => void };
type RDKitMol = {
  get_substruct_matches: (query: RDKitQuery) => string;
};
type RDKitModule = {
  get_qmol: (smarts: string) => RDKitQuery | null;
};

type HeterocycleLocant = number | string;

type HeterocycleTemplate = {
  name: string;
  stem: string;
  smarts: string;
  locants: HeterocycleLocant[];
  minUnsaturatedBonds?: number;
  maxUnsaturatedBonds?: number;
};

export type HeterocycleNomenclatureResult = {
  name: string;
  parentName: string;
  mainSuffix: string | null;
  confidence: "high" | "medium";
  explanation: string;
  limitations: string[];
};

/**
 * Retained heterocyclic parents commonly encountered in O-Chem, biochemistry,
 * and medicinal chemistry.  Query atoms are written in retained-parent
 * numbering order (or paired with an explicit locant sequence for fused rings).
 * Bonds use '~' so Kekule/resonance/tautomer drawings do not turn a heterocycle
 * into a fake acyclic imine parent.
 *
 * Larger fused systems are tested before their component rings (purine before
 * pyrimidine/imidazole, indole before pyrrole, etc.).
 */
const HETEROCYCLE_TEMPLATES: HeterocycleTemplate[] = [
  // Fused systems -------------------------------------------------------------
  {
    name: "purine",
    stem: "purin",
    smarts: "[#7]1~[#6]~[#7]~[#6]2~[#7]~[#6]~[#7]~[#6]~2~[#6]~1",
    // Query order: N1 C2 N3 C4 N9 C8 N7 C5 C6
    locants: [1, 2, 3, 4, 9, 8, 7, 5, 6],
    minUnsaturatedBonds: 3,
  },
  {
    name: "indole",
    stem: "indol",
    smarts: "[#7]1~[#6]~[#6]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, "3a", 4, 5, 6, 7, "7a"],
    minUnsaturatedBonds: 3,
  },
  {
    name: "benzimidazole",
    stem: "benzimidazol",
    smarts: "[#7]1~[#6]~[#7]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, "3a", 4, 5, 6, 7, "7a"],
    minUnsaturatedBonds: 3,
  },
  {
    name: "benzoxazole",
    stem: "benzoxazol",
    smarts: "[#8]1~[#6]~[#7]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, "3a", 4, 5, 6, 7, "7a"],
    minUnsaturatedBonds: 3,
  },
  {
    name: "benzothiazole",
    stem: "benzothiazol",
    smarts: "[#16]1~[#6]~[#7]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, "3a", 4, 5, 6, 7, "7a"],
    minUnsaturatedBonds: 3,
  },
  {
    name: "quinoline",
    stem: "quinolin",
    smarts: "[#7]1~[#6]~[#6]~[#6]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, 4, "4a", 5, 6, 7, 8, "8a"],
    minUnsaturatedBonds: 3,
  },
  {
    name: "isoquinoline",
    stem: "isoquinolin",
    smarts: "[#6]1~[#7]~[#6]~[#6]~[#6]2~[#6]~[#6]~[#6]~[#6]~[#6]1~2",
    locants: [1, 2, 3, 4, "4a", 5, 6, 7, 8, "8a"],
    minUnsaturatedBonds: 3,
  },

  // Six-membered aromatic heterocycles ---------------------------------------
  {
    name: "pyridazine",
    stem: "pyridazin",
    smarts: "[#7]1~[#7]~[#6]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5, 6],
    minUnsaturatedBonds: 1,
  },
  {
    name: "pyrimidine",
    stem: "pyrimidin",
    smarts: "[#7]1~[#6]~[#7]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5, 6],
    minUnsaturatedBonds: 1,
  },
  {
    name: "pyrazine",
    stem: "pyrazin",
    smarts: "[#7]1~[#6]~[#6]~[#7]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5, 6],
    minUnsaturatedBonds: 1,
  },
  {
    name: "pyridine",
    stem: "pyridin",
    smarts: "[#7]1~[#6]~[#6]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5, 6],
    minUnsaturatedBonds: 1,
  },

  // Five-membered aromatic heterocycles --------------------------------------
  {
    name: "1,2,3-triazole",
    stem: "1,2,3-triazol",
    smarts: "[#7]1~[#7]~[#7]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "1,2,4-triazole",
    stem: "1,2,4-triazol",
    smarts: "[#7]1~[#7]~[#6]~[#7]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "tetrazole",
    stem: "tetrazol",
    smarts: "[#7]1~[#7]~[#7]~[#7]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "imidazole",
    stem: "imidazol",
    smarts: "[#7]1~[#6]~[#7]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "pyrazole",
    stem: "pyrazol",
    smarts: "[#7]1~[#7]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "oxazole",
    stem: "oxazol",
    smarts: "[#8]1~[#6]~[#7]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "isoxazole",
    stem: "isoxazol",
    smarts: "[#8]1~[#7]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "thiazole",
    stem: "thiazol",
    smarts: "[#16]1~[#6]~[#7]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "isothiazole",
    stem: "isothiazol",
    smarts: "[#16]1~[#7]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "pyrrole",
    stem: "pyrrol",
    smarts: "[#7]1~[#6]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "furan",
    stem: "furan",
    smarts: "[#8]1~[#6]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },
  {
    name: "thiophene",
    stem: "thiophen",
    smarts: "[#16]1~[#6]~[#6]~[#6]~[#6]1",
    locants: [1, 2, 3, 4, 5],
    minUnsaturatedBonds: 1,
  },

  // Common saturated heterocycles --------------------------------------------
  { name: "oxirane", stem: "oxiran", smarts: "[#8]1-[#6]-[#6]1", locants: [1, 2, 3], maxUnsaturatedBonds: 0 },
  { name: "aziridine", stem: "aziridin", smarts: "[#7]1-[#6]-[#6]1", locants: [1, 2, 3], maxUnsaturatedBonds: 0 },
  { name: "thiirane", stem: "thiiran", smarts: "[#16]1-[#6]-[#6]1", locants: [1, 2, 3], maxUnsaturatedBonds: 0 },
  { name: "oxetane", stem: "oxetan", smarts: "[#8]1-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4], maxUnsaturatedBonds: 0 },
  { name: "azetidine", stem: "azetidin", smarts: "[#7]1-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4], maxUnsaturatedBonds: 0 },
  { name: "thietane", stem: "thietan", smarts: "[#16]1-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4], maxUnsaturatedBonds: 0 },
  { name: "oxolane", stem: "oxolan", smarts: "[#8]1-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5], maxUnsaturatedBonds: 0 },
  { name: "pyrrolidine", stem: "pyrrolidin", smarts: "[#7]1-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5], maxUnsaturatedBonds: 0 },
  { name: "thiolane", stem: "thiolan", smarts: "[#16]1-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5], maxUnsaturatedBonds: 0 },
  { name: "1,3-dioxolane", stem: "1,3-dioxolan", smarts: "[#8]1-[#6]-[#8]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5], maxUnsaturatedBonds: 0 },
  { name: "oxane", stem: "oxan", smarts: "[#8]1-[#6]-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
  { name: "piperidine", stem: "piperidin", smarts: "[#7]1-[#6]-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
  { name: "thiane", stem: "thian", smarts: "[#16]1-[#6]-[#6]-[#6]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
  { name: "morpholine", stem: "morpholin", smarts: "[#8]1-[#6]-[#6]-[#7]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
  { name: "piperazine", stem: "piperazin", smarts: "[#7]1-[#6]-[#6]-[#7]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
  { name: "1,4-dioxane", stem: "1,4-dioxan", smarts: "[#8]1-[#6]-[#6]-[#8]-[#6]-[#6]1", locants: [1, 2, 3, 4, 5, 6], maxUnsaturatedBonds: 0 },
];

type HeterocycleMatch = {
  template: HeterocycleTemplate;
  atoms: number[];
  locantByAtom: Map<number, HeterocycleLocant>;
};

type SuffixCandidate = {
  kind:
    | "carboxylic acid"
    | "carboxamide"
    | "carbonitrile"
    | "carbaldehyde"
    | "carbonyl chloride"
    | "carboxylate";
  locant: HeterocycleLocant;
  representedAtoms: Set<number>;
  alkylName?: string;
};

const HALOGEN_PREFIXES: Record<string, string> = {
  F: "fluoro",
  Cl: "chloro",
  Br: "bromo",
  I: "iodo",
};

function parseMatchArray(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => entry?.atoms)
      .filter((atoms): atoms is number[] =>
        Array.isArray(atoms) && atoms.every((value) => Number.isInteger(value))
      );
  } catch {
    return [];
  }
}

function countInternalUnsaturatedBonds(parsedMol: ParsedMol, atoms: number[]) {
  const set = new Set(atoms);
  return parsedMol.bonds.filter(
    (bond) =>
      set.has(bond.atomA) &&
      set.has(bond.atomB) &&
      bond.bondOrder > 1.1
  ).length;
}

function locantSortValue(locant: HeterocycleLocant) {
  if (typeof locant === "number") return locant;
  const match = /^(\d+)([a-z])?$/i.exec(locant);
  if (!match) return Number.POSITIVE_INFINITY;
  const base = Number(match[1]);
  const suffix = match[2]
    ? (match[2].toLowerCase().charCodeAt(0) - 96) / 100
    : 0;
  return base + suffix;
}

function compareNumericVectors(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? Number.POSITIVE_INFINITY;
    const bv = b[i] ?? Number.POSITIVE_INFINITY;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function getExternalRankingVector(
  parsedMol: ParsedMol,
  atoms: number[],
  locants: HeterocycleLocant[]
) {
  const set = new Set(atoms);
  const suffixLike: number[] = [];
  const ordinary: number[] = [];

  atoms.forEach((atomIndex, queryIndex) => {
    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const other = getOtherAtom(bond, atomIndex);
      if (set.has(other)) continue;
      const atom = parsedMol.atoms[other];
      if (!atom || atom.element === "H") continue;

      const value = locantSortValue(locants[queryIndex]);
      const isRingOxoOrThioxo =
        (atom.element === "O" || atom.element === "S") &&
        bond.bondOrder >= 1.5;

      const isDirectSuffixCarbon =
        atom.element === "C" &&
        bond.bondOrder === 1 &&
        (parsedMol.adjacency.get(other) ?? []).some((candidate) => {
          const attached = getOtherAtom(candidate, other);
          const attachedAtom = parsedMol.atoms[attached];
          return (
            attached !== atomIndex &&
            ((attachedAtom?.element === "O" && candidate.bondOrder >= 1.5) ||
              (attachedAtom?.element === "N" && candidate.bondOrder >= 2.5))
          );
        });

      (isRingOxoOrThioxo || isDirectSuffixCarbon ? suffixLike : ordinary).push(value);
    }
  });

  suffixLike.sort((a, b) => a - b);
  ordinary.sort((a, b) => a - b);
  return [...suffixLike, ...ordinary];
}

function findHeterocycleMatch(
  RDKit: RDKitModule,
  mol: RDKitMol,
  parsedMol: ParsedMol
): HeterocycleMatch | null {
  for (const template of HETEROCYCLE_TEMPLATES) {
    let query: RDKitQuery | null = null;
    try {
      query = RDKit.get_qmol(template.smarts);
      if (!query) continue;

      const matches = parseMatchArray(mol.get_substruct_matches(query))
        .filter((atoms) => atoms.length === template.locants.length)
        .filter((atoms) => {
          const unsaturated = countInternalUnsaturatedBonds(parsedMol, atoms);
          if (
            template.minUnsaturatedBonds !== undefined &&
            unsaturated < template.minUnsaturatedBonds
          ) {
            return false;
          }
          if (
            template.maxUnsaturatedBonds !== undefined &&
            unsaturated > template.maxUnsaturatedBonds
          ) {
            return false;
          }
          return true;
        });

      if (matches.length === 0) continue;

      const best = [...matches].sort((a, b) =>
        compareNumericVectors(
          getExternalRankingVector(parsedMol, a, template.locants),
          getExternalRankingVector(parsedMol, b, template.locants)
        )
      )[0];

      const locantByAtom = new Map<number, HeterocycleLocant>();
      best.forEach((atomIndex, index) => {
        locantByAtom.set(atomIndex, template.locants[index]);
      });

      return { template, atoms: best, locantByAtom };
    } catch {
      // One malformed/unsupported query must not break nomenclature entirely.
    } finally {
      query?.delete?.();
    }
  }

  return null;
}

function getTerminalHydroxyOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const oxygen = getOtherAtom(bond, carbonIndex);
    if (parsedMol.atoms[oxygen]?.element !== "O") return false;
    const heavyNeighbors = (parsedMol.adjacency.get(oxygen) ?? []).filter((candidate) => {
      const other = getOtherAtom(candidate, oxygen);
      return parsedMol.atoms[other]?.element !== "H";
    });
    return heavyNeighbors.length === 1;
  });
}

function classifySuffixCandidate(
  parsedMol: ParsedMol,
  carbonIndex: number,
  ringAtom: number,
  locant: HeterocycleLocant
): SuffixCandidate | null {
  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const nitrileNitrogenBond = bonds.find((bond) => {
    const other = getOtherAtom(bond, carbonIndex);
    return other !== ringAtom && parsedMol.atoms[other]?.element === "N" && bond.bondOrder >= 2.5;
  });
  if (nitrileNitrogenBond) {
    return {
      kind: "carbonitrile",
      locant,
      representedAtoms: new Set([carbonIndex, getOtherAtom(nitrileNitrogenBond, carbonIndex)]),
    };
  }

  const carbonylOxygenBond = bonds.find((bond) => {
    const other = getOtherAtom(bond, carbonIndex);
    return other !== ringAtom && parsedMol.atoms[other]?.element === "O" && bond.bondOrder >= 1.5;
  });
  if (!carbonylOxygenBond) return null;

  const carbonylOxygen = getOtherAtom(carbonylOxygenBond, carbonIndex);
  const represented = new Set<number>([carbonIndex, carbonylOxygen]);

  const hydroxyBond = getTerminalHydroxyOxygen(parsedMol, carbonIndex);
  if (hydroxyBond) {
    represented.add(getOtherAtom(hydroxyBond, carbonIndex));
    return { kind: "carboxylic acid", locant, representedAtoms: represented };
  }

  const amideBond = bonds.find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const other = getOtherAtom(bond, carbonIndex);
    return other !== ringAtom && parsedMol.atoms[other]?.element === "N";
  });
  if (amideBond) {
    represented.add(getOtherAtom(amideBond, carbonIndex));
    return { kind: "carboxamide", locant, representedAtoms: represented };
  }

  const chlorideBond = bonds.find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const other = getOtherAtom(bond, carbonIndex);
    return other !== ringAtom && parsedMol.atoms[other]?.element === "Cl";
  });
  if (chlorideBond) {
    represented.add(getOtherAtom(chlorideBond, carbonIndex));
    return { kind: "carbonyl chloride", locant, representedAtoms: represented };
  }

  const esterOxygenBond = bonds.find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const other = getOtherAtom(bond, carbonIndex);
    if (other === ringAtom || parsedMol.atoms[other]?.element !== "O") return false;
    return (parsedMol.adjacency.get(other) ?? []).some((oxygenBond) => {
      const attached = getOtherAtom(oxygenBond, other);
      return attached !== carbonIndex && parsedMol.atoms[attached]?.element === "C";
    });
  });
  if (esterOxygenBond) {
    const oxygen = getOtherAtom(esterOxygenBond, carbonIndex);
    const alkylBond = (parsedMol.adjacency.get(oxygen) ?? []).find((bond) => {
      const other = getOtherAtom(bond, oxygen);
      return other !== carbonIndex && parsedMol.atoms[other]?.element === "C";
    });
    if (alkylBond) {
      const alkylCarbon = getOtherAtom(alkylBond, oxygen);
      represented.add(oxygen);
      const alkylName = buildBranchName(parsedMol, alkylCarbon, oxygen).name;
      return {
        kind: "carboxylate",
        locant,
        representedAtoms: represented,
        alkylName,
      };
    }
  }

  // A ring-C(=O)H group has no second heavy-atom substituent on the carbonyl C.
  const heavyNonRingNeighbors = bonds.filter((bond) => {
    const other = getOtherAtom(bond, carbonIndex);
    return other !== ringAtom && parsedMol.atoms[other]?.element !== "H";
  });
  if (heavyNonRingNeighbors.length === 1) {
    return { kind: "carbaldehyde", locant, representedAtoms: represented };
  }

  return null;
}

function getOxygenPrefix(parsedMol: ParsedMol, oxygenIndex: number, parentAtom: number) {
  const classification = classifyOxygen(parsedMol, oxygenIndex);
  if (!classification) return "oxy";
  if (classification.kind === "hydroxy") return "hydroxy";
  if (classification.kind === "alkoxide") return "oxido";
  if (classification.kind === "nitrateEster") return "nitrooxy";
  if (classification.kind === "phosphateEster") return "phosphoryloxy";
  if (classification.kind === "sulfurOxygenEster") return "sulfonyloxy";
  if (classification.kind === "silylEther") return "silyloxy";
  if (classification.kind === "peroxide") return "peroxy";

  if (classification.kind === "ether") {
    const carbonBond = (parsedMol.adjacency.get(oxygenIndex) ?? []).find((bond) => {
      const other = getOtherAtom(bond, oxygenIndex);
      return other !== parentAtom && parsedMol.atoms[other]?.element === "C";
    });
    if (carbonBond) {
      const carbon = getOtherAtom(carbonBond, oxygenIndex);
      return alkylNameToAlkoxyName(buildBranchName(parsedMol, carbon, oxygenIndex).name);
    }
  }

  return "oxy";
}

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}

function renderSubstituentPrefixes(substituents: Substituent[]) {
  const groups = new Map<string, HeterocycleLocant[]>();
  for (const substituent of substituents) {
    const current = groups.get(substituent.name) ?? [];
    current.push(substituent.locant as HeterocycleLocant);
    groups.set(substituent.name, current);
  }

  return [...groups.entries()]
    .map(([name, locants]) => ({
      name,
      locants: [...locants].sort((a, b) => locantSortValue(a) - locantSortValue(b)),
    }))
    .sort((a, b) => {
      const alpha = getAlphabetizationKey(a.name).localeCompare(getAlphabetizationKey(b.name));
      if (alpha !== 0) return alpha;
      return locantSortValue(a.locants[0]) - locantSortValue(b.locants[0]);
    })
    .map(({ name, locants }) => `${locants.join(",")}-${getMultiplier(locants.length)}${name}`)
    .join("-");
}

function suffixPriority(kind: SuffixCandidate["kind"]) {
  switch (kind) {
    case "carboxylic acid": return 1;
    case "carboxylate": return 2;
    case "carbonyl chloride": return 3;
    case "carboxamide": return 4;
    case "carbonitrile": return 5;
    case "carbaldehyde": return 6;
  }
}

function renderExternalSuffix(
  parentName: string,
  candidates: SuffixCandidate[]
) {
  if (candidates.length === 0) return null;
  const bestPriority = Math.min(...candidates.map((candidate) => suffixPriority(candidate.kind)));
  const best = candidates.filter((candidate) => suffixPriority(candidate.kind) === bestPriority);
  const kind = best[0].kind;
  const sameKind = best.filter((candidate) => candidate.kind === kind);
  const locants = sameKind
    .map((candidate) => candidate.locant)
    .sort((a, b) => locantSortValue(a) - locantSortValue(b));

  if (kind === "carboxylic acid") {
    return {
      name: `${parentName}-${locants.join(",")}-${getMultiplier(locants.length)}carboxylic acid`,
      mainSuffix: "-carboxylic acid",
      representedAtoms: new Set(sameKind.flatMap((candidate) => [...candidate.representedAtoms])),
    };
  }
  if (kind === "carboxamide") {
    return {
      name: `${parentName}-${locants.join(",")}-${getMultiplier(locants.length)}carboxamide`,
      mainSuffix: "-carboxamide",
      representedAtoms: new Set(sameKind.flatMap((candidate) => [...candidate.representedAtoms])),
    };
  }
  if (kind === "carbonitrile") {
    return {
      name: `${parentName}-${locants.join(",")}-${getMultiplier(locants.length)}carbonitrile`,
      mainSuffix: "-carbonitrile",
      representedAtoms: new Set(sameKind.flatMap((candidate) => [...candidate.representedAtoms])),
    };
  }
  if (kind === "carbaldehyde") {
    return {
      name: `${parentName}-${locants.join(",")}-${getMultiplier(locants.length)}carbaldehyde`,
      mainSuffix: "-carbaldehyde",
      representedAtoms: new Set(sameKind.flatMap((candidate) => [...candidate.representedAtoms])),
    };
  }
  if (kind === "carbonyl chloride") {
    return {
      name: `${parentName}-${locants.join(",")}-carbonyl chloride`,
      mainSuffix: "-carbonyl chloride",
      representedAtoms: new Set(sameKind.flatMap((candidate) => [...candidate.representedAtoms])),
    };
  }
  if (kind === "carboxylate" && sameKind.length === 1 && sameKind[0].alkylName) {
    return {
      name: `${sameKind[0].alkylName} ${parentName}-${locants[0]}-carboxylate`,
      mainSuffix: "-carboxylate",
      representedAtoms: new Set([...sameKind[0].representedAtoms]),
    };
  }

  return null;
}

function collectHeterocycleSubstituents(
  parsedMol: ParsedMol,
  match: HeterocycleMatch
) {
  const parentSet = new Set(match.atoms);
  const substituents: Substituent[] = [];
  const suffixCandidates: SuffixCandidate[] = [];
  const oxoLocants: HeterocycleLocant[] = [];
  const thioxoLocants: HeterocycleLocant[] = [];

  for (const parentAtom of match.atoms) {
    const locant = match.locantByAtom.get(parentAtom);
    if (locant === undefined) continue;

    for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
      const other = getOtherAtom(bond, parentAtom);
      if (parentSet.has(other)) continue;
      const atom = parsedMol.atoms[other];
      if (!atom || atom.element === "H") continue;

      if (atom.element === "O" && bond.bondOrder >= 1.5) {
        oxoLocants.push(locant);
        continue;
      }
      if (atom.element === "S" && bond.bondOrder >= 1.5) {
        thioxoLocants.push(locant);
        continue;
      }

      if (atom.element === "C" && bond.bondOrder === 1) {
        const suffix = classifySuffixCandidate(parsedMol, other, parentAtom, locant);
        if (suffix) {
          suffixCandidates.push(suffix);
          continue;
        }
        substituents.push({ name: buildBranchName(parsedMol, other, parentAtom).name, locant });
        continue;
      }

      if (atom.element === "N" && bond.bondOrder === 1) {
        substituents.push({ name: getNitrogenSubstituentPrefix(parsedMol, other, parentAtom), locant });
        continue;
      }

      if (atom.element === "O" && bond.bondOrder === 1) {
        substituents.push({ name: getOxygenPrefix(parsedMol, other, parentAtom), locant });
        continue;
      }

      const halogen = HALOGEN_PREFIXES[atom.element];
      if (halogen) {
        substituents.push({ name: halogen, locant });
      }
    }
  }

  return { substituents, suffixCandidates, oxoLocants, thioxoLocants };
}

/**
 * Returns a retained-parent heterocycle name before the general acyclic feature
 * engine gets a chance to reinterpret aromatic N=C bonds as standalone imines.
 */
export function getHeterocycleNomenclature(
  RDKit: RDKitModule,
  mol: RDKitMol,
  parsedMol: ParsedMol
): HeterocycleNomenclatureResult | null {
  const match = findHeterocycleMatch(RDKit, mol, parsedMol);
  if (!match) return null;

  const { substituents, suffixCandidates, oxoLocants, thioxoLocants } =
    collectHeterocycleSubstituents(parsedMol, match);

  const externalSuffix = renderExternalSuffix(match.template.name, suffixCandidates);
  let suffixBase: string | null = externalSuffix?.name ?? null;
  let mainSuffix: string | null = externalSuffix?.mainSuffix ?? null;

  // Ring carbonyls are part of the heterocyclic parent, so represent them as
  // heterocycle -one/-dione rather than selecting an acyclic "imine" chain.
  if (!suffixBase && oxoLocants.length > 0) {
    const locants = [...oxoLocants].sort((a, b) => locantSortValue(a) - locantSortValue(b));
    suffixBase = `${match.template.stem}-${locants.join(",")}-${getMultiplier(locants.length)}one`;
    mainSuffix = locants.length > 1 ? `-${getMultiplier(locants.length)}one` : "-one";
  } else if (!suffixBase && thioxoLocants.length > 0) {
    const locants = [...thioxoLocants].sort((a, b) => locantSortValue(a) - locantSortValue(b));
    suffixBase = `${match.template.stem}-${locants.join(",")}-${getMultiplier(locants.length)}thione`;
    mainSuffix = locants.length > 1 ? `-${getMultiplier(locants.length)}thione` : "-thione";
  }

  const prefixString = renderSubstituentPrefixes(substituents);
  const parentBase = suffixBase ?? match.template.name;
  const name = prefixString ? `${prefixString}${parentBase}` : parentBase;

  return {
    name,
    parentName: match.template.name,
    mainSuffix,
    confidence: "high",
    explanation:
      `Recognized ${match.template.name} as the retained heterocyclic parent and applied its standard ring numbering before naming external substituents.`,
    limitations:
      oxoLocants.length > 0 || thioxoLocants.length > 0
        ? [
            "Prototropic tautomer H-locants (for example 1H/3H) are not yet emitted; the retained heterocycle parent and substituent locants are preserved.",
          ]
        : [],
  };
}
