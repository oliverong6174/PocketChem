import type { BranchSubstituent } from "./branchTypes";

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}

function getPrefixSortKey(name: string) {
  return name
    .toLowerCase()
    .replace(/^(di|tri|tetra|penta|hexa|bis|tris)/, "");
}

export function formatBranchSubstituents(
  substituents: BranchSubstituent[]
) {
  const groups = new Map<string, number[]>();

  for (const sub of substituents) {
    if (!sub.locant) continue;

    const existing = groups.get(sub.name) ?? [];
    existing.push(sub.locant);
    groups.set(sub.name, existing);
  }

  return Array.from(groups.entries())
    .map(([name, locants]) => {
      locants.sort((a, b) => a - b);

      return {
        text: `${locants.join(",")}-${getMultiplier(locants.length)}${name}`,
        sortKey: getPrefixSortKey(name),
        firstLocant: locants[0] ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      const alpha = a.sortKey.localeCompare(b.sortKey);
      if (alpha !== 0) return alpha;

      return a.firstLocant - b.firstLocant;
    })
    .map((entry) => entry.text)
    .join("-");
}