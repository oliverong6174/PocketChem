import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { normalizeFunctionalGroupName } from "../../functionalGroups/groupIds";
import type { ParsedMol } from "../types";

/**
 * Retained / conventional parent names that are appropriate when the detected
 * SMARTS match covers the complete heavy-atom graph. This deliberately does
 * not rename substituted versions of these scaffolds; those still go through
 * the parent/substituent engine so locants are not silently discarded.
 */
const WHOLE_MOLECULE_RETAINED_NAMES: Record<string, string> = {
  benzene: "benzene",
  phenol: "phenol",
  anisole: "anisole",
  toluene: "toluene",
  benzaldehyde: "benzaldehyde",
  aniline: "aniline",
  "benzyl alcohol": "benzyl alcohol",
  "benzyl amine": "benzylamine",
  "benzoic acid": "benzoic acid",
  benzamide: "benzamide",

  naphthalene: "naphthalene",
  anthracene: "anthracene",
  phenanthrene: "phenanthrene",
  indane: "indane",
  pyridine: "pyridine",
  pyrrole: "pyrrole",
  furan: "furan",
  thiophene: "thiophene",
  indole: "indole",
  imidazole: "imidazole",
  pyrazole: "pyrazole",
  oxazole: "oxazole",
  isoxazole: "isoxazole",
  thiazole: "thiazole",
  isothiazole: "isothiazole",
  quinoline: "quinoline",
  isoquinoline: "isoquinoline",
  pyrimidine: "pyrimidine",
  purine: "purine",
  benzimidazole: "benzimidazole",
  benzoxazole: "benzoxazole",
  benzothiazole: "benzothiazole",
  tetrazole: "tetrazole",
  triazole: "triazole",

  epoxide: "oxirane",
  oxetane: "oxetane",
  aziridine: "aziridine",

  "alpha lactone": "oxiran-2-one",
  "beta lactone": "oxetan-2-one",
  "gamma lactone": "oxolan-2-one",
  "delta lactone": "oxan-2-one",
  "epsilon lactone": "oxepan-2-one",
  "alpha lactam": "aziridin-2-one",
  "beta lactam": "azetidin-2-one",
  "gamma lactam": "pyrrolidin-2-one",
  "delta lactam": "piperidin-2-one",
  "epsilon lactam": "azepan-2-one",

  urea: "urea",
  guanidine: "guanidine",
  phosphine: "phosphane",
  silane: "silane",
  ketene: "ketene",
  acrolein: "acrolein",
  "acrylic acid": "acrylic acid",
  "crotonic acid": "crotonic acid",
  crotonaldehyde: "crotonaldehyde",
  "cinnamic acid": "cinnamic acid",
  cinnamaldehyde: "cinnamaldehyde",
  chalcone: "chalcone",
  benzoin: "benzoin",

  hydronium: "hydronium",
  "ammonium ion": "ammonium",
  hydroxide: "hydroxide",
  phenoxide: "phenoxide",
  fluoride: "fluoride",
  chloride: "chloride",
  bromide: "bromide",
  iodide: "iodide",
  cyanide: "cyanide",
  "azide anion": "azide",
};

function uniqueMatchedAtomCount(group: FunctionalGroupResult) {
  const atoms = new Set<number>();

  for (const match of group.matches ?? []) {
    for (const atom of match.atoms ?? []) atoms.add(atom);
  }

  return atoms.size;
}

export function getWholeMoleculeRetainedName(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
) {
  const candidates = [
    ...(mainGroup ? [mainGroup] : []),
    ...functionalGroups,
  ];

  const atomCount = parsedMol.atoms.length;

  for (const group of candidates) {
    const retainedName = WHOLE_MOLECULE_RETAINED_NAMES[normalizeFunctionalGroupName(group.name)];
    if (!retainedName) continue;

    // SMARTS matches contain heavy atoms. RDKit molblocks used by the
    // nomenclature engine normally omit implicit H atoms, so equality here is
    // a useful guard against turning substituted scaffolds into bare retained
    // names (e.g. methylpyridine -> pyridine).
    if (uniqueMatchedAtomCount(group) === atomCount) {
      return retainedName;
    }
  }

  return null;
}
