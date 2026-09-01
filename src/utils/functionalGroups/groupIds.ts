/**
 * Canonical, display-independent identifiers for functional-group names.
 *
 * Pattern display names remain human-readable ("Primary alcohol",
 * "Nitrate ester", etc.). Nomenclature code should compare these canonical
 * IDs instead of repeating ad-hoc lowercase/string-normalization logic.
 */
export type FunctionalGroupId = string;

const EXPLICIT_IDS: Record<string, FunctionalGroupId> = {
  "peroxyacid": "peroxyAcid",
  "peroxy acid": "peroxyAcid",
  "carboxylic acid": "carboxylicAcid",
  "acid anhydride": "acidAnhydride",
  "acid chloride": "acidHalide",
  "acyl halide": "acidHalide",
  "acyl azide": "acylAzide",
  "primary alcohol": "primaryAlcohol",
  "secondary alcohol": "secondaryAlcohol",
  "tertiary alcohol": "tertiaryAlcohol",
  "primary amine": "primaryAmine",
  "secondary amine": "secondaryAmine",
  "tertiary amine": "tertiaryAmine",
  "primary amide": "primaryAmide",
  "secondary amide": "secondaryAmide",
  "tertiary amide": "tertiaryAmide",
  "nitrate ester": "nitrateEster",
  "sulfonate ester": "sulfonateEster",
  "phosphate ester": "phosphateEster",
  "silyl ether": "silylEther",
  "n-oxide": "nOxide",
  "quaternary ammonium": "quaternaryAmmonium",
  "ammonium ion": "ammoniumIon",
  "oxonium ion": "oxoniumIon",
  "sulfonium ion": "sulfoniumIon",
  "phosphonium ion": "phosphoniumIon",
};

export function normalizeFunctionalGroupName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

export function toFunctionalGroupId(name: string): FunctionalGroupId {
  const normalized = normalizeFunctionalGroupName(name);
  const explicit = EXPLICIT_IDS[normalized];
  if (explicit) return explicit;

  return normalized
    .replace(/[^a-z0-9]+(.)?/g, (_match, next: string | undefined) =>
      next ? next.toUpperCase() : ""
    )
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}
