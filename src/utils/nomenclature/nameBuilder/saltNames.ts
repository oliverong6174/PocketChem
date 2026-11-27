import type { NomenclatureResult } from "../types";

/**
 * Names for simple salts: a monatomic or ammonium cation with monatomic anions, or with one organic anion that the ordinary builders have
 * already named (sodium ethanoate). Before this, the builders read "CC(=O)[O-].[Na+]" as the anion alone and dropped the cation with a
 * High-confidence name. IUPAC 2013 P-73 / IR-5.4: cation first, then anion; names of ions are not hyphenated or bracketed; a repeated
 * ion takes di-/tri-.
 *
 * Narrow on purpose. Organic cations (quaternary ammonium, sulfonium...), oxo-anions and polyatomic inorganic ions are not named here;
 * the caller leaves those to the existing "unsupported" handling.
 */

type Ion = { name: string; common?: string; charge: number };

const CATIONS: Record<string, Ion> = {
  "[Na+]": { name: "sodium", charge: 1 },
  "[K+]": { name: "potassium", charge: 1 },
  "[Li+]": { name: "lithium", charge: 1 },
  "[Cs+]": { name: "caesium", common: "cesium", charge: 1 },
  "[Rb+]": { name: "rubidium", charge: 1 },
  "[Ag+]": { name: "silver", charge: 1 },
  "[NH4+]": { name: "azanium", common: "ammonium", charge: 1 },
  "[Mg+2]": { name: "magnesium", charge: 2 },
  "[Ca+2]": { name: "calcium", charge: 2 },
  "[Zn+2]": { name: "zinc", charge: 2 },
  "[Ba+2]": { name: "barium", charge: 2 },
};

const ANIONS: Record<string, Ion> = {
  "[Cl-]": { name: "chloride", charge: -1 },
  "[Br-]": { name: "bromide", charge: -1 },
  "[I-]": { name: "iodide", charge: -1 },
  "[F-]": { name: "fluoride", charge: -1 },
  "[OH-]": { name: "hydroxide", charge: -1 },
};

const MULTIPLIER: Record<number, string> = { 1: "", 2: "di", 3: "tri", 4: "tetra" };

export type SaltName = { name: string; commonName: string | null };

function countComponents(smiles: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const part of smiles.split(".")) counts.set(part, (counts.get(part) ?? 0) + 1);
  return counts;
}

/**
 * `organicName` is the ordinary builders' name for the structure (they name the organic anion and ignore the counter-ion), or null when
 * the structure has no organic component.
 */
export function getSimpleSaltName(canonicalSmiles: string | null, organicName: NomenclatureResult | null): SaltName | null {
  if (!canonicalSmiles || !canonicalSmiles.includes(".")) return null;
  const counts = countComponents(canonicalSmiles);

  const cations: Array<[Ion, number]> = [];
  const anions: Array<[Ion, number]> = [];
  const unknown: Array<[string, number]> = [];
  for (const [smiles, count] of counts) {
    if (CATIONS[smiles]) cations.push([CATIONS[smiles], count]);
    else if (ANIONS[smiles]) anions.push([ANIONS[smiles], count]);
    else unknown.push([smiles, count]);
  }
  if (cations.length === 0) return null;

  let anionPart: string[];
  let anionCommon: string[] | null = null;
  let organicCharge = 0;
  if (unknown.length === 0) {
    if (anions.length === 0) return null;
    anionPart = anions.map(([ion, count]) => `${MULTIPLIER[count] ?? ""}${ion.name}`);
  } else if (unknown.length === 1 && anions.length === 0) {
    // One organic anion with metal/ammonium cations: it must be a single, singly charged carboxylate-type anion named by the builders.
    const [smiles, count] = unknown[0];
    const negative = (smiles.match(/-/g) ?? []).length;
    const positive = (smiles.match(/\+/g) ?? []).length;
    if (!organicName || organicName.namingStatus === "unsupported" || negative !== 1 || positive !== 0) return null;
    organicCharge = -1 * count;
    const base = organicName.estimatedName;
    if (!/(?:ate|ide|olate|thiolate)$/.test(base)) return null; // only names that already read as an anion
    anionPart = [count > 1 ? `${MULTIPLIER[count] ?? ""}${base}` : base];
    const common = organicName.commonName;
    anionCommon = common && common !== base ? [count > 1 ? `${MULTIPLIER[count] ?? ""}${common}` : common] : null;
  } else {
    return null;
  }

  const positiveTotal = cations.reduce((sum, [ion, count]) => sum + ion.charge * count, 0);
  const negativeTotal = anions.reduce((sum, [ion, count]) => sum + ion.charge * count, 0) + organicCharge;
  if (positiveTotal + negativeTotal !== 0) return null; // not a neutral salt as written

  const cationNames = cations
    .sort((a, b) => a[0].name.localeCompare(b[0].name))
    .map(([ion, count]) => `${MULTIPLIER[count] ?? ""}${ion.name}`);
  const cationCommon = cations.map(([ion, count]) => `${MULTIPLIER[count] ?? ""}${ion.common ?? ion.name}`);
  const name = `${cationNames.join(" ")} ${anionPart.join(" ")}`;
  const commonAnion = anionCommon ?? (cationCommon.join(" ") !== cationNames.join(" ") ? anionPart : null);
  const commonName = commonAnion ? `${cationCommon.join(" ")} ${commonAnion.join(" ")}` : null;
  return { name, commonName: commonName && commonName !== name ? commonName : null };
}
