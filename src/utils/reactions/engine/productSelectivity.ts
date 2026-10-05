import { getRDKit } from "../../rdkit";
import type {
  ReactionRule,
  ReactionSelectivityAssessment,
  ReactionSitePreference,
} from "../reactionTypes";
import {
  runReactionSmartsWithMultiplicity,
} from "./rdkitReaction";
import {
  canonicalizeStereoStructure,
  filterProductsByRelativeSubstituentFace,
} from "./stereochemistry";

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


type SitePreferenceSelector = (
  reactantSmiles: string,
  products: string[],
  preference: ReactionSitePreference,
) => Promise<string[]>;

const SITE_PREFERENCE_SELECTORS: Partial<
  Record<ReactionSitePreference, SitePreferenceSelector>
> = {
  "most-substituted-alkene": selectProductsByAlkeneSitePreference,
  "least-substituted-alkene": selectProductsByAlkeneSitePreference,
};

/**
 * Dispatch site ranking by structured strategy rather than adding reaction-ID
 * branches to the engine. New site models can register here without changing
 * the rule-execution pipeline. Unknown strategies are deliberately a no-op
 * until their chemistry scorer exists; they must never be misinterpreted as
 * an alkene preference.
 */
export async function selectProductsBySitePreference(
  reactantSmiles: string,
  products: string[],
  preference: ReactionSitePreference,
): Promise<string[]> {
  const selector = SITE_PREFERENCE_SELECTORS[preference];
  return selector
    ? selector(reactantSmiles, products, preference)
    : products;
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


type RadicalCarbonClass = 1 | 2 | 3;

const RADICAL_HALOGENATION_RELATIVE_REACTIVITY: Record<
  "Cl" | "Br",
  Record<RadicalCarbonClass, number>
> = {
  // Approximate textbook relative H-abstraction reactivities. These are
  // chemistry-model constants, not molecule-specific route hardcoding.
  Cl: { 1: 1, 2: 3.8, 3: 5 },
  Br: { 1: 1, 2: 82, 3: 1600 },
};

const RADICAL_SITE_MODELS: Array<{
  carbonClass: RadicalCarbonClass;
  hydrogensPerCarbon: number;
  reactantSmarts: string;
}> = [
  { carbonClass: 3, hydrogensPerCarbon: 1, reactantSmarts: "[C;H1;X4:1]" },
  { carbonClass: 2, hydrogensPerCarbon: 2, reactantSmarts: "[C;H2;X4:1]" },
  { carbonClass: 1, hydrogensPerCarbon: 3, reactantSmarts: "[C;H3;X4:1]" },
  // Methane is treated as a primary-like abstraction class for ranking.
  { carbonClass: 1, hydrogensPerCarbon: 4, reactantSmarts: "[C;H4;X4:1]" },
];

async function radicalHalogenationProductFraction(
  reactantSmiles: string,
  productSmiles: string,
  halogen: "Cl" | "Br",
): Promise<number | null> {
  const target = await canonicalizeStereoStructure(productSmiles);
  if (!target) return null;

  const rates = RADICAL_HALOGENATION_RELATIVE_REACTIVITY[halogen];
  let desiredWeight = 0;
  let totalWeight = 0;

  for (const site of RADICAL_SITE_MODELS) {
    const outcomes = await runReactionSmartsWithMultiplicity(
      reactantSmiles,
      `${site.reactantSmarts}>>[C:1]${halogen}`,
      512,
    );
    const weightPerMatchedCarbon =
      site.hydrogensPerCarbon * rates[site.carbonClass];

    for (const outcome of outcomes) {
      const weightedMultiplicity = outcome.multiplicity * weightPerMatchedCarbon;
      totalWeight += weightedMultiplicity;

      const structure = await canonicalizeStereoStructure(outcome.productSmiles);
      if (structure?.connectivity === target.connectivity) {
        desiredWeight += weightedMultiplicity;
      }
    }
  }

  if (!(totalWeight > 0) || !(desiredWeight > 0)) return null;
  return Math.min(1, Math.max(0, desiredWeight / totalWeight));
}

function radicalProductCarbonClass(
  substitutionScore: number,
): RadicalCarbonClass | null {
  if (substitutionScore >= 3) return 3;
  if (substitutionScore === 2) return 2;
  if (substitutionScore === 1 || substitutionScore === 0) return 1;
  return null;
}

function selectivityPenaltyFromFraction(fraction: number): number {
  // In synthesis planning, a route that depends on isolating one member of a
  // constitutional mixture carries a real purification/selectivity burden.
  // Step count is already charged elsewhere, so this penalty is deliberately
  // strong enough that a short 10-20% shortcut does not automatically outrank
  // a longer route that follows the dominant chemistry.
  if (fraction >= 0.5) return 0;

  const safeFraction = Math.max(0.001, Math.min(0.5, fraction));
  const mixtureBurden = 150;
  const informationPenalty = 700 * Math.log(0.5 / safeFraction);
  return Math.round(mixtureBurden + informationPenalty);
}

function selectivityLevelFromFraction(
  fraction: number,
): ReactionSelectivityAssessment["level"] {
  if (fraction >= 0.5) return "major";
  if (fraction >= 0.2) return "competitive";
  if (fraction >= 0.05) return "minor";
  return "trace";
}

function percentLabel(fraction: number): string {
  const percent = fraction * 100;
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(2)}%`;
}

/**
 * Estimate product-specific selectivity without deleting minor products.
 *
 * The first implemented quantitative model is alkane radical halogenation.
 * It uses the rule's structured `most-stable-radical-site` preference, the
 * halogen identity, C-H class counts in the actual substrate, and approximate
 * textbook abstraction rate ratios. The estimate is intentionally used for
 * ranking, not as an experimental yield prediction.
 */
export async function assessReactionProductSelectivity(
  rule: ReactionRule,
  reactantSmiles: string,
  productSmiles: string,
): Promise<ReactionSelectivityAssessment | null> {
  if (
    rule.selectivityProfile?.sitePreference !== "most-stable-radical-site" ||
    rule.transform.type !== "customHandler" ||
    rule.transform.handler !== "radical" ||
    rule.transform.options?.mode !== "alkaneHalogenation"
  ) {
    return null;
  }

  const halogen = rule.transform.options?.halogen;
  if (halogen !== "Cl" && halogen !== "Br") return null;

  const substitutionScore = await halogenBearingCarbonSubstitutionScore(
    productSmiles,
    halogen,
  );
  const productClass = radicalProductCarbonClass(substitutionScore);
  if (!productClass) return null;

  const estimatedFraction = await radicalHalogenationProductFraction(
    reactantSmiles,
    productSmiles,
    halogen,
  );
  if (estimatedFraction === null) return null;

  const level = selectivityLevelFromFraction(estimatedFraction);
  const planningPenalty = selectivityPenaltyFromFraction(estimatedFraction);
  const className =
    productClass === 3 ? "tertiary" : productClass === 2 ? "secondary" : "primary";
  const labelPrefix =
    level === "major"
      ? "Major"
      : level === "competitive"
        ? "Competitive"
        : level === "minor"
          ? "Minor"
          : "Trace";

  return {
    level,
    estimatedFraction,
    planningPenalty,
    label: `${labelPrefix} product (~${percentLabel(estimatedFraction)})`,
    basis:
      `${halogen === "Br" ? "Bromination" : "Chlorination"} at a ${className} C-H site; ` +
      "estimated from symmetry/site degeneracy and standard relative radical-abstraction reactivities.",
  };
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

async function applyMechanismProductPostconditions(
  rule: ReactionRule,
  products: string[],
): Promise<string[]> {
  let selected = [...products];
  const relativeStereo = rule.mechanismProfile?.productPostconditions?.relativeStereo ?? [];

  for (const condition of relativeStereo) {
    selected = await filterProductsByRelativeSubstituentFace(
      selected,
      {
        smarts: condition.smarts,
        firstBond: condition.firstBond,
        secondBond: condition.secondBond,
      },
      condition.relationship === "syn" ? "same" : "opposite",
    );
  }

  return selected;
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
    selected = await selectProductsBySitePreference(
      reactantSmiles,
      selected,
      profile.sitePreference,
    );
  }

  // Mechanistic postconditions are applied before mixture handling so a rule
  // can never label an invalid stereoisomer as an "expected mixture" member.
  selected = await applyMechanismProductPostconditions(rule, selected);

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
