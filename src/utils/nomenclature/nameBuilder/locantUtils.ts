export type NomenclatureLocant = number | string;

const HETEROATOM_LOCANT_ORDER: Record<string, number> = {
  N: -4,
  O: -3,
  S: -2,
  P: -1,
};

export function getLocantSortValue(locant: NomenclatureLocant) {
  if (typeof locant === "number") return locant;

  const normalized = locant.trim().toUpperCase();
  if (normalized in HETEROATOM_LOCANT_ORDER) {
    return HETEROATOM_LOCANT_ORDER[normalized];
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

export function compareNomenclatureLocants(
  a: NomenclatureLocant,
  b: NomenclatureLocant
) {
  const valueA = getLocantSortValue(a);
  const valueB = getLocantSortValue(b);

  if (valueA !== valueB) return valueA - valueB;
  return String(a).localeCompare(String(b));
}
