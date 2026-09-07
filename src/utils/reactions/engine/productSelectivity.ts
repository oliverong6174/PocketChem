import { getRDKit } from "../../rdkit";
import type { ReactionRule, ReactionSitePreference } from "../reactionTypes";
import { canonicalizeStereoStructure } from "./stereochemistry";

type Histogram = Map<number, number>;

type ScoredProduct = {
  product: string;
  score: number | null;
};

function parseMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (Array.isArray(entry)) {
          return entry.map(Number).filter(Number.isFinite);
        }
        if (entry && typeof entry === "object" && Array.isArray((entry as { atoms?: unknown[] }).atoms)) {
          return (entry as { atoms: unknown[] }).atoms.map(Number).filter(Number.isFinite);
        }
        return [];
      })
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

const ALKENE_SUBSTITUTION_QUERIES: Array<{ score: number; smarts: string }> = [
  { score: 4, smarts: "[C;H0]=[C;H0]" },
  { score: 3, smarts: "[C;H0]=[C;H1]" },
  { score: 2, smarts: "[C;H0]=[C;H2]" },
  { score: 2, smarts: "[C;H1]=[C;H1]" },
  { score: 1, smarts: "[C;H1]=[C;H2]" },
  { score: 0, smarts: "[C;H2]=[C;H2]" },
];

async function alkeneSubstitutionHistogram(smiles: string): Promise<Histogram> {
  const histogram: Histogram = new Map();
  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(smiles);
  if (!molecule) return histogram;

  try {
    const seenBonds = new Set<string>();

    for (const querySpec of ALKENE_SUBSTITUTION_QUERIES) {
      const query = rdkit.get_qmol(querySpec.smarts);
      if (!query) continue;

      try {
        const matches = parseMatches(molecule.get_substruct_matches?.(query) ?? "[]");
        for (const match of matches) {
          if (match.length < 2) continue;
          const [first, second] = match;
          const key = first < second ? `${first}-${second}` : `${second}-${first}`;
          if (seenBonds.has(key)) continue;
          seenBonds.add(key);
          histogram.set(querySpec.score, (histogram.get(querySpec.score) ?? 0) + 1);
        }
      } finally {
        query.delete?.();
      }
    }
  } finally {
    molecule.delete?.();
  }

  return histogram;
}

function removedAlkeneScores(reactant: Histogram, product: Histogram): number[] {
  const removed: number[] = [];
  for (let score = 0; score <= 4; score += 1) {
    const difference = (reactant.get(score) ?? 0) - (product.get(score) ?? 0);
    for (let count = 0; count < Math.max(0, difference); count += 1) {
      removed.push(score);
    }
  }
  return removed;
}

/**
 * Returns the substitution level of the alkene site consumed by a one-site
 * transformation.  If the reaction changes several C=C bonds at once, null is
 * returned rather than pretending a site preference is known.
 */
export async function consumedAlkeneSubstitutionScore(
  reactantSmiles: string,
  productSmiles: string,
): Promise<number | null> {
  const [reactantHistogram, productHistogram] = await Promise.all([
    alkeneSubstitutionHistogram(reactantSmiles),
    alkeneSubstitutionHistogram(productSmiles),
  ]);
  const removed = removedAlkeneScores(reactantHistogram, productHistogram);
  return removed.length === 1 ? removed[0] : null;
}

export async function totalAlkeneSubstitutionScore(smiles: string): Promise<number> {
  const histogram = await alkeneSubstitutionHistogram(smiles);
  let total = 0;
  for (const [score, count] of histogram) total += score * count;
  return total;
}

/**
 * Site-selectivity filter shared by every reaction family.  It compares the
 * alkene substitution level actually consumed by each generated product and
 * removes only products that are unambiguously lower-ranked. Ties are retained
 * because equal-substitution sites can be genuinely competitive.
 */
export async function selectProductsByAlkeneSitePreference(
  reactantSmiles: string,
  products: string[],
  preference: ReactionSitePreference,
): Promise<string[]> {
  if (products.length <= 1) return products;

  const scored: ScoredProduct[] = await Promise.all(
    products.map(async (product) => ({
      product,
      score: await consumedAlkeneSubstitutionScore(reactantSmiles, product),
    })),
  );
  const known = scored.filter((item) => item.score !== null) as Array<{
    product: string;
    score: number;
  }>;
  if (known.length === 0) return products;

  const target = preference === "most-substituted-alkene"
    ? Math.max(...known.map((item) => item.score))
    : Math.min(...known.map((item) => item.score));

  const preferred = known
    .filter((item) => item.score === target)
    .map((item) => item.product);

  return preferred.length > 0 ? preferred : products;
}

export async function halogenBearingCarbonSubstitutionScore(
  smiles: string,
  halogen: "Cl" | "Br" | "I",
): Promise<number> {
  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(smiles);
  if (!molecule) return -1;

  const queries = [
    { score: 3, smarts: `[C;H0]([${halogen}])` },
    { score: 2, smarts: `[C;H1]([${halogen}])` },
    { score: 1, smarts: `[C;H2]([${halogen}])` },
    { score: 0, smarts: `[C;H3]([${halogen}])` },
  ];

  try {
    for (const querySpec of queries) {
      const query = rdkit.get_qmol(querySpec.smarts);
      try {
        if (query && molecule.get_substruct_match(query) !== "{}") {
          return querySpec.score;
        }
      } finally {
        query?.delete?.();
      }
    }
    return -1;
  } finally {
    molecule.delete?.();
  }
}

async function sameConnectivityProducts(products: string[]): Promise<string[]> {
  if (products.length <= 1) return products;

  const structures = await Promise.all(
    products.map(async (product) => ({
      product,
      structure: await canonicalizeStereoStructure(product),
    })),
  );
  const firstConnectivity = structures.find((item) => item.structure)?.structure?.connectivity;
  if (!firstConnectivity) return products.slice(0, 1);

  return structures
    .filter((item) => item.structure?.connectivity === firstConnectivity)
    .map((item) => item.product);
}

/**
 * Final rule-level selectivity pass. This is intentionally conservative:
 * genuine expected mixtures are never collapsed. `majorProductOnly` is used
 * only by rules whose handler/ranking logic deliberately orders the major
 * connectivity first. Stereo members of that connectivity are retained unless
 * the rule is explicitly stereoselective.
 */
export async function applyRuleProductSelectivity(
  rule: ReactionRule,
  reactantSmiles: string,
  products: string[],
): Promise<string[]> {
  let selected = [...products];
  const profile = rule.selectivityProfile;

  if (profile?.sitePreference) {
    selected = await selectProductsByAlkeneSitePreference(
      reactantSmiles,
      selected,
      profile.sitePreference,
    );
  }

  if (profile?.mixture === "expected") return selected;

  // `mixture: "single"` is now enforced, not merely descriptive metadata.
  // A rule that promises one major product must not leak lower-ranked RDKit
  // atom-map orientations into the UI. `majorProductOnly` provides the same
  // behavior for rules that still acknowledge a possible minor mixture.
  if ((profile?.majorProductOnly || profile?.mixture === "single") && selected.length > 1) {
    selected = await sameConnectivityProducts(selected);

    if (
      (profile.stereochemistry?.stereoselective || profile?.mixture === "single") &&
      selected.length > 1
    ) {
      selected = selected.slice(0, 1);
    }
  }

  return selected;
}
