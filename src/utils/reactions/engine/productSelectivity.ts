import { getRDKit } from "../../rdkit";
import type {
  ReactionRule,
  ReactionSelectivityAssessment,
  ReactionSitePreference,
} from "../reactionTypes";
import {
  runReactionSmarts,
  runReactionSmartsWithMultiplicity,
} from "./rdkitReaction";
import { scoreEasProducts } from "./aromaticSiteSelection";
import {
  canonicalizeStereoStructure,
  filterProductsByRelativeSubstituentFace,
} from "./stereochemistry";
import { elimination } from "./handlers/elimination";

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
async function smartsMatches(smiles: string, smarts: string): Promise<boolean> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  const query = rdkit.get_qmol(smarts);
  try {
    if (!mol || !query) return false;
    const match = mol.get_substruct_match?.(query);
    return typeof match === "string" && match !== "{}" && match !== "";
  } catch {
    return false;
  } finally {
    query?.delete?.();
    mol?.delete?.();
  }
}

/**
 * Qualitative, referenced preferences declared on the rule (ProductPreference). The first
 * preference whose structural condition holds and whose product pattern matches decides; a
 * product no preference describes returns null and stays unranked. No fraction is invented.
 */
async function assessDeclaredPreference(
  rule: ReactionRule,
  reactants: string[],
  productSmiles: string,
): Promise<ReactionSelectivityAssessment | null> {
  for (const preference of rule.productPreferences ?? []) {
    let applies = true;
    for (const smarts of preference.whenReactantSmarts) {
      let found = false;
      for (const reactant of reactants) {
        if (await smartsMatches(reactant, smarts)) {
          found = true;
          break;
        }
      }
      if (!found) {
        applies = false;
        break;
      }
    }
    if (!applies) continue;
    for (const smarts of preference.unlessReactantSmarts ?? []) {
      for (const reactant of reactants) {
        if (await smartsMatches(reactant, smarts)) applies = false;
      }
    }
    if (!applies) continue;
    if (!(await smartsMatches(productSmiles, preference.productSmarts))) continue;
    return {
      level: preference.level,
      estimatedFraction: null,
      planningPenalty: preference.level === "minor" ? 40 : 0,
      label: preference.level === "major" ? "Major product (qualitative)" : "Minor product (qualitative)",
      basis: `${preference.basis} Source: ${preference.references.join("; ")} Qualitative preference, not a measured ratio.`,
    };
  }
  return null;
}

const easSiblingCache = new Map<string, Promise<{ keys: string[]; scores: Array<number | null> }>>();

/**
 * Qualitative ranking of the ring positions of a Friedel-Crafts step by directing effects. The
 * siblings are every product the rule's own template gives for these reactants. A ring the simple
 * model does not cover (fused, no benzene ring) is not ranked at all.
 */
async function assessEasDirecting(
  rule: ReactionRule,
  reactants: string[],
  productSmiles: string,
): Promise<ReactionSelectivityAssessment | null> {
  const installed = rule.selectivityProfile?.easDirecting;
  if (!installed || rule.transform.type !== "reactionSmarts" || reactants.length < 2) return null;
  const rearranging = installed === "alkyl" ? await primaryHalideCanRearrange(reactants) : false;
  if (rearranging) {
    // A primary alkyl halide can alkylate directly or after a hydride/alkyl shift; the split depends on temperature, catalyst and
    // reaction time, so no single product (and no ring position of one) may be called major.
    return {
      level: "competitive",
      estimatedFraction: null,
      planningPenalty: 10,
      label: "Condition-dependent (rearrangement possible)",
      basis:
        "A primary alkyl halide with AlCl\u2083 can alkylate without rearrangement or after a 1,2-hydride shift to a more stable carbocation. The direct and rearranged products are both reported and neither is ranked, because the ratio depends on temperature, catalyst loading and time (Wade, Organic Chemistry, Friedel-Crafts alkylation: rearrangements; not re-read in this stage). Ring-position preferences are not ranked for the same reason.",
    };
  }
  const cacheKey = `${rule.id}|${reactants.join(".")}`;
  let pending = easSiblingCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const siblings = await runReactionSmarts(reactants, (rule.transform as { smarts: string }).smarts, 24);
      const keys: string[] = [];
      for (const sibling of siblings) keys.push((await canonicalizeStereoStructure(sibling))?.isomeric ?? sibling);
      return { keys, scores: await scoreEasProducts(reactants[0], siblings, installed) };
    })();
    if (easSiblingCache.size > 200) easSiblingCache.clear();
    easSiblingCache.set(cacheKey, pending);
  }
  const { keys, scores } = await pending;
  if (keys.length < 2 || scores.some((score) => score === null)) return null;
  const own = (await canonicalizeStereoStructure(productSmiles))?.isomeric ?? productSmiles;
  const index = keys.indexOf(own);
  if (index < 0) return null;
  const sterics = await bulkyElectrophileOrthoPenalty(installed, reactants, productSmiles);
  const numeric = scores as number[];
  const best = Math.max(...numeric);
  const ties = numeric.filter((score) => Math.abs(score - best) < 1e-6).length;
  const gap = best - numeric[index];
  const basisTail =
    "Estimated from the substituents' directing effects only: this ranks ring positions of one alkyl group, not direct versus carbocation-rearranged products (listed separately and left unranked). The ortho/para ratio, steric effects and polyalkylation are not modeled.";
  if (sterics) {
    return { level: "minor", estimatedFraction: null, planningPenalty: 40, label: "Disfavored ring position (steric, qualitative)", basis: sterics };
  }
  if (gap < 1e-6 && ties === 1) {
    return { level: "major", estimatedFraction: null, planningPenalty: 0, label: "Favored ring position (qualitative)", basis: `Most activated position for substitution. ${basisTail}` };
  }
  if (gap <= 1.0) {
    return { level: "competitive", estimatedFraction: null, planningPenalty: 10, label: "Competitive ring position (qualitative)", basis: `Similarly activated as the best position. ${basisTail}` };
  }
  return { level: "minor", estimatedFraction: null, planningPenalty: 40, label: "Disfavored ring position (qualitative)", basis: `Clearly less activated than the best position. ${basisTail}` };
}

/** Two adjacent substituted benzene-ring carbons: only an ortho substitution creates this from a monosubstituted reactant. */
const ORTHO_PAIR = "[c;R1;$(c-!@[!#1])]:[c;R1;$(c-!@[!#1])]";
const BULKY_ELECTROPHILE_HALIDE = "[CX4;H0]([Cl,Br,I])([#6])([#6])[#6]";
const BULKY_ELECTROPHILE_REFERENCE =
  "Ortho attack next to an existing ring substituent is sterically disfavored for bulky electrophiles (acylium ions, tert-alkyl cations), and para attack dominates; for example Friedel-Crafts acylation of toluene is essentially all para (Clayden, Greeves and Warren, Organic Chemistry 2nd ed., ch. 21; Carey and Sundberg, Advanced Organic Chemistry A, ch. 10; not re-read in this stage). Qualitative only: no ratio is given. Under thermodynamic control (long times, excess AlCl\u2083) tert-butylation isomerizes toward the meta product, which this model does not cover.";

async function bulkyElectrophileOrthoPenalty(installed: "alkyl" | "acyl", reactants: string[], productSmiles: string): Promise<string | null> {
  const bulky =
    installed === "acyl" ||
    (await (async () => {
      for (const reactant of reactants.slice(1)) if (await smartsMatches(reactant, BULKY_ELECTROPHILE_HALIDE)) return true;
      return false;
    })());
  if (!bulky) return null;
  // Only a monosubstituted benzene has the simple ortho-vs-para choice; in polysubstituted rings the position may be para to another group.
  if ((await countMatches(reactants[0], "[cH]")) !== 5 || (await countMatches(reactants[0], "c")) !== 6) return null;
  return (await smartsMatches(productSmiles, ORTHO_PAIR)) ? BULKY_ELECTROPHILE_REFERENCE : null;
}

async function primaryHalideCanRearrange(reactants: string[]): Promise<boolean> {
  for (const reactant of reactants.slice(1)) {
    // CH2(X) attached to a carbon that bears a hydrogen (hydride shift available), not benzylic/allylic.
    if (await smartsMatches(reactant, "[CH2;!$(C-c);!$(C-C=C)]([Cl,Br,I])[CX4;H1,H2]")) return true;
  }
  return false;
}

const ELIMINATION_REFERENCES = {
  smallBase:
    "Zaitsev rule: with small strong bases (hydroxide, methoxide, ethoxide) E2 gives mainly the more substituted alkene (LibreTexts, Elimination by the E2 mechanism; UCLA Illustrated Glossary of Organic Chemistry, Hofmann's rule: 2-bromo-2-methylbutane with methoxide gives 2-methylbut-2-ene as the major product; Reusch, MSU: 2-bromo-2,3-dimethylbutane with methoxide gives 80% of the tetrasubstituted alkene).",
  bulkyBase:
    "Bulky bases such as tert-butoxide tend to give higher yields of the less substituted alkene (LibreTexts, Elimination by the E2 mechanism); for tertiary halides this is the major product: 2-bromo-2-methylbutane gives 2-methylbut-1-ene (UCLA glossary) and 2-bromo-2,3-dimethylbutane gives about 75% of 2,3-dimethylbut-1-ene (Reusch, MSU).",
};

/** Alkene bonds conjugated with an aryl group, carbonyl, nitrile or another alkene: substitution count alone does not rank these. */
const CONJUGATED_ALKENE = "[CX3]=[CX3]-[$(c),$([CX3]=O),$(C#N),$([CX3]=[CX3])]";

/**
 * Qualitative Zaitsev/Hofmann ranking of the constitutional alkenes an E1/E2 rule offers. The rule's own
 * outcomes are the siblings. Returns null (unranked) whenever the principle does not safely apply: one
 * constitution only, the leaving group on a ring carbon (anti-periplanar access decides), or alkenes that differ
 * in conjugation. Fractions are never invented; E/Z geometry within one constitution is not ranked here.
 */
async function assessEliminationRegiochemistry(
  rule: ReactionRule,
  substrate: string,
  productSmiles: string,
): Promise<ReactionSelectivityAssessment | null> {
  const mode = rule.selectivityProfile?.regiochemistry?.mode;
  const transform = rule.transform;
  if ((mode !== "zaitsev" && mode !== "hofmann") || transform.type !== "customHandler" || transform.handler !== "elimination") {
    return null;
  }
  const options = transform.options;
  if (options.mode !== "e1" && options.mode !== "e2" && options.mode !== "betaElimination") return null;
  if (await smartsMatches(substrate, "[C;R]-[Cl,Br,I,OX2H]")) return null;

  const siblings = await elimination(substrate, options);
  const groups = new Map<string, { score: number; conjugated: boolean }>();
  const baseline = await totalAlkeneSubstitutionScore(substrate);
  for (const sibling of siblings) {
    const key = (await canonicalizeStereoStructure(sibling))?.connectivity;
    if (!key || groups.has(key)) continue;
    groups.set(key, {
      score: (await totalAlkeneSubstitutionScore(sibling)) - baseline,
      conjugated: await smartsMatches(sibling, CONJUGATED_ALKENE),
    });
  }
  const own = groups.get((await canonicalizeStereoStructure(productSmiles))?.connectivity ?? "");
  if (!own || groups.size < 2) return null;
  const all = [...groups.values()];
  if (all.some((entry) => entry.conjugated !== all[0].conjugated)) return null;

  const scores = all.map((entry) => entry.score);
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  const tail = " Qualitative preference, not a measured ratio; E/Z geometry within a constitution is not ranked.";
  if (high === low) {
    return { level: "competitive", estimatedFraction: null, planningPenalty: 10, label: "Competitive alkene (qualitative)", basis: `The alkenes are equally substituted.${tail}` };
  }
  if (mode === "zaitsev") {
    return own.score === high
      ? { level: "major", estimatedFraction: null, planningPenalty: 0, label: "Major product (qualitative)", basis: `${ELIMINATION_REFERENCES.smallBase} This is the more substituted alkene.${tail}` }
      : { level: "minor", estimatedFraction: null, planningPenalty: 40, label: "Minor product (qualitative)", basis: `${ELIMINATION_REFERENCES.smallBase} This is a less substituted alkene.${tail}` };
  }
  // Hofmann (bulky base): the documented major-product cases are tertiary halides; elsewhere both stay competitive.
  const tertiary = await smartsMatches(substrate, "[C;H0;X4]-[Cl,Br,I,OX2H]");
  if (tertiary && own.score === low) {
    return { level: "major", estimatedFraction: null, planningPenalty: 0, label: "Major product (qualitative)", basis: `${ELIMINATION_REFERENCES.bulkyBase} This is the less substituted alkene from a tertiary halide.${tail}` };
  }
  return {
    level: "competitive",
    estimatedFraction: null,
    planningPenalty: 10,
    label: "Competitive alkene (qualitative)",
    basis: `${ELIMINATION_REFERENCES.bulkyBase} ${tertiary ? "This is the more substituted alkene, which remains a significant product." : "The documented major-product cases are tertiary halides; for this substrate neither alkene is ranked as major."}${tail}`,
  };
}

const SN_E_REFERENCE =
  "Substitution versus elimination follows the substrate class and the reagent class (Wade, Organic Chemistry, ch. 6-7 summary of SN2/E2 competition; Clayden, Greeves and Warren, ch. 17; not re-read in this stage). It is qualitative: solvent, temperature and the exact base change the ratio, and no fraction is given.";

type HalideClass = "methyl" | "primary" | "secondary" | "tertiary";

/** Class of the single sp3 carbon bearing a halogen, or null when the substrate is outside the simple textbook cases. */
async function simpleHalideClass(reactants: string[]): Promise<HalideClass | null> {
  for (const reactant of reactants) {
    if (!(await smartsMatches(reactant, "[CX4][Cl,Br,I]"))) continue;
    if (await smartsMatches(reactant, "[CX4]([Cl,Br,I])-[$([#6]=*),$(c),$(C#*)]")) return null; // allylic, benzylic, alpha-carbonyl
    if (await smartsMatches(reactant, "[CX4]([Cl,Br,I])[CX4]([Cl,Br,I])") || (await countMatches(reactant, "[CX4][Cl,Br,I]")) > 1) return null;
    if (await smartsMatches(reactant, "[CH3][Cl,Br,I]")) return "methyl";
    if (await smartsMatches(reactant, "[CH2]([Cl,Br,I])[CX4;!H3;!H2]")) return null; // beta-branched primary: SN2 hindered, E2 enhanced
    if (await smartsMatches(reactant, "[CX4;H2]([Cl,Br,I])[#6]")) return "primary";
    if (await smartsMatches(reactant, "[CX4;H1]([Cl,Br,I])([#6])[#6]")) return "secondary";
    if (await smartsMatches(reactant, "[CX4;H0]([Cl,Br,I])([#6])([#6])[#6]")) return "tertiary";
    return null;
  }
  return null;
}

async function countMatches(smiles: string, smarts: string): Promise<number> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  const query = rdkit.get_qmol(smarts);
  try {
    if (!mol || !query) return 0;
    const raw = mol.get_substruct_matches?.(query);
    return typeof raw === "string" ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  } finally {
    query?.delete?.();
    mol?.delete?.();
  }
}

/**
 * Qualitative SN2-versus-E2 comparison for simple haloalkanes. Returns null (unassessed) for allylic, benzylic,
 * alpha-carbonyl, beta-branched primary, polyhalogenated and ring-fused cases, and for any reagent class not declared on the rule.
 */
async function assessSubstitutionElimination(rule: ReactionRule, reactants: string[]): Promise<ReactionSelectivityAssessment | null> {
  const declared = rule.selectivityProfile?.substitutionElimination;
  if (!declared) return null;
  const cls = await simpleHalideClass(reactants);
  if (!cls) return null;
  const { pathway, reagent } = declared;
  const make = (level: "major" | "competitive" | "minor", why: string): ReactionSelectivityAssessment => ({
    level,
    estimatedFraction: null,
    planningPenalty: level === "minor" ? 40 : level === "competitive" ? 10 : 0,
    label: level === "major" ? "Major pathway (qualitative)" : level === "minor" ? "Minor pathway (qualitative)" : "Competitive pathway (qualitative)",
    basis: `${why} ${SN_E_REFERENCE}`,
  });
  const where = `${cls} halide`;
  // No competing pathway exists for a methyl halide (no beta hydrogen) or for a tertiary halide (no SN2): a lone outcome is not ranked.
  if (cls === "methyl") return null;
  if (reagent === "nucleophile") {
    // weakly basic, good nucleophile: SN2 on primary and secondary, no E2 offered by these rules
    return pathway === "sn2" && cls !== "tertiary" ? make("major", `A weakly basic nucleophile on a ${where} favors SN2 over E2.`) : null;
  }
  if (reagent === "bulky-base") {
    return pathway === "e2" ? make("major", `A bulky strong base on a ${where} favors elimination because it is too hindered to attack carbon.`) : null;
  }
  // hydroxide or small alkoxide: strong base and good nucleophile
  if (cls === "primary") {
    return pathway === "sn2"
      ? make("major", `Hydroxide/alkoxide on an unhindered ${where} gives mainly SN2; E2 is the minor pathway.`)
      : make("minor", `Hydroxide/alkoxide on an unhindered ${where} gives mainly SN2; elimination is the minor pathway. Heat or a hindered base raises the E2 share.`);
  }
  if (cls === "secondary") {
    if (reagent === "alkoxide") {
      return pathway === "e2"
        ? make("major", "A strong alkoxide base on a secondary halide gives mainly E2.")
        : make("minor", "A strong alkoxide base on a secondary halide gives mainly E2; SN2 is the minor pathway.");
    }
    return make("competitive", "Hydroxide on a secondary halide gives both SN2 and E2, and the balance depends on solvent and temperature, so neither is ranked.");
  }
  return null; // tertiary: E2 is the only pathway these rules offer, so it is not ranked against anything
}

async function constitutionalAlkeneCount(rule: ReactionRule, substrate: string): Promise<number> {
  const transform = rule.transform;
  if (transform.type !== "customHandler" || transform.handler !== "elimination") return 1;
  const keys = new Set<string>();
  for (const sibling of await elimination(substrate, transform.options)) {
    const key = (await canonicalizeStereoStructure(sibling))?.connectivity;
    if (key) keys.add(key);
  }
  return keys.size;
}

export async function assessReactionProductSelectivity(
  rule: ReactionRule,
  reactantSmiles: string,
  productSmiles: string,
  allReactantSmiles: string[] = [reactantSmiles],
): Promise<ReactionSelectivityAssessment | null> {
  if (rule.selectivityProfile?.easDirecting) {
    return assessEasDirecting(rule, allReactantSmiles, productSmiles);
  }
  if (rule.selectivityProfile?.substitutionElimination) {
    const pathway = await assessSubstitutionElimination(rule, allReactantSmiles);
    if (rule.selectivityProfile.substitutionElimination.pathway === "e2") {
      // Alkene-level ranking (Zaitsev/Hofmann among the constitutional alkenes) is the finer statement and is kept when it exists.
      // The pathway verdict can only demote it (E2 is the minor pathway), never promote a competitive or minor alkene to major.
      const alkene = await assessEliminationRegiochemistry(rule, reactantSmiles, productSmiles);
      if (alkene) {
        if (pathway?.level === "minor" && alkene.level !== "minor") {
          return { ...alkene, level: "minor", planningPenalty: 40, label: "Minor pathway (qualitative)", basis: `${pathway.basis} ${alkene.basis}` };
        }
        return alkene;
      }
      // The alkene ranking was withheld on purpose (ring substrate, conjugation difference) or there is one alkene. With several
      // constitutional alkenes the pathway verdict would label each of them, which says nothing about which alkene: leave them unranked.
      if ((await constitutionalAlkeneCount(rule, reactantSmiles)) > 1) return null;
    }
    return pathway;
  }
  if (rule.selectivityProfile?.regiochemistry?.mode === "zaitsev" || rule.selectivityProfile?.regiochemistry?.mode === "hofmann") {
    return assessEliminationRegiochemistry(rule, reactantSmiles, productSmiles);
  }
  if (rule.productPreferences?.length) {
    return assessDeclaredPreference(rule, allReactantSmiles, productSmiles);
  }
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

  if (profile?.keepConstitutionalAlternatives && selected.length > 1) {
    if (!profile.stereochemistry?.stereoselective) return selected;
    // One product per constitution (the first, which the handler orders E before Z); constitutions are all kept.
    const seen = new Set<string>();
    const perConstitution: string[] = [];
    for (const product of selected) {
      const key = (await canonicalizeStereoStructure(product))?.connectivity ?? product;
      if (seen.has(key)) continue;
      seen.add(key);
      perConstitution.push(product);
    }
    return perConstitution;
  }

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
