import { getRDKit } from "../../rdkit";
import { resolveReactantRequirement } from "../profiles/reactants";
import type {
  MultistepSynthesisRoute,
  ReactionRule,
  RouteQuality,
  RouteQualityFinding,
  RouteQualityFindingLevel,
  RouteQualityTier,
  SynthesisStep,
} from "../reactionTypes";
import { getCompiledQuerySync } from "./rdkitCaches";

/**
 * Conservative chemical-quality assessment of a replayed route (Stage 9I).
 *
 * Structural replay answers "does PocketChem's reaction model reproduce this route from the
 * supplied materials?". It cannot say whether the route is chemically sensible. This module adds a
 * separate, deterministic tier built only from (a) the rule metadata the registry already
 * declares, (b) the advisory compatibility and selectivity summaries, and (c) a few generic,
 * textbook-level structural checks that apply to any molecule matching the pattern. It invents no
 * yields or probabilities and contains no molecule-specific exceptions.
 *
 * Generic checks, each with its textbook basis:
 *  - atom sourcing: an element in a step's products that appears in neither its reactants, its
 *    rule-supplied reagents nor the rule's reagent text has no documented source (contradiction).
 *    Carbon in excess of the reactants is allowed only when the reagent text names a carbon
 *    reagent. Hydrogen and oxygen are not checked (water, acid, oxidants are too varied).
 *  - activated-arene over-substitution: halogenation of a free arylamine or phenol whose product
 *    still has an open ortho/para position (polyhalogenation; Anslyn & Dougherty ch. 11; OpenStax
 *    Organic Chemistry 24.8 "Reactions of arylamines").
 *  - nitration of a free arylamine (protonation to the meta-directing anilinium, oxidation).
 *  - Friedel-Crafts alkylation: polyalkylation and rearrangement are generic limitations.
 *  - beta-keto (1,3-dicarbonyl) acids as isolated intermediates decarboxylate readily.
 *  - base-mediated alkylation whose alkyl halide carries a beta-carbonyl (E1cB elimination) or an
 *    enolizable carbonyl (proton transfer) competes with substitution.
 *
 * Limits: SMARTS-based, so unusual environments may be missed; absence of a finding is NOT
 * evidence of success. "chemically-supported" requires every step to be assessed and
 * unambiguous, so it is deliberately rare.
 */

export const ROUTE_QUALITY_ASSESSMENT_VERSION = 1;

const TIER_LABEL: Record<RouteQualityTier, string> = {
  "structure-verified": "Structure replay only (no chemical assessment)",
  "chemically-supported": "Chemically supported by declared rules (model check)",
  "plausible-incomplete": "Plausible, incompletely assessed",
  "known-concern": "Known selectivity, stability or condition concern",
  contradicted: "Contradicted or unsupported by the model",
};

export function routeQualityLabel(tier: RouteQualityTier): string {
  return TIER_LABEL[tier];
}

/** Tier order from least to most severe; used to pick the worst finding level. */
const LEVEL_TO_TIER: Record<RouteQualityFindingLevel, RouteQualityTier | null> = {
  contradiction: "contradicted",
  concern: "known-concern",
  incomplete: "plausible-incomplete",
  support: null,
  info: null,
};

// ---------------------------------------------------------------------------
// Element bookkeeping

const ELEMENTS = new Set(
  (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
    "Rb Sr Y Zr Nb Mo Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La W Re Os Ir Pt Au Hg Tl Pb Bi"
  ).split(" "),
);

const SUBSCRIPTS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

/** Heavy-atom element counts of one SMILES string, ignoring hydrogen. */
function smilesElements(smiles: string): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (symbol: string) => {
    const element = symbol.length === 1 ? symbol.toUpperCase() : symbol[0].toUpperCase() + symbol.slice(1);
    if (element === "H") return;
    counts.set(element, (counts.get(element) ?? 0) + 1);
  };
  // Bracket atoms first, so "[Na+]" is sodium and "[nH]" is aromatic nitrogen.
  const withoutBrackets = smiles.replace(/\[(\d*)([A-Z][a-z]?|[cnops]|se|as)[^\]]*\]/g, (_m, _iso, symbol: string) => {
    bump(symbol);
    return "";
  });
  for (const token of withoutBrackets.match(/Cl|Br|[BCNOPSFIcnops]/g) ?? []) bump(token);
  return counts;
}

function mergeCounts(into: Map<string, number>, from: Map<string, number>): void {
  for (const [key, value] of from) into.set(key, (into.get(key) ?? 0) + value);
}

/**
 * Reagent abbreviations and words whose atoms can enter a product but whose letters are not
 * element symbols. Matching is deliberately lenient: it only widens what counts as a documented
 * source, so it can hide an unsourced atom but never invent one.
 */
const ABBREVIATIONS: Record<string, string[]> = {
  Me: ["C"], Et: ["C"], Pr: ["C"], iPr: ["C"], Bu: ["C"], tBu: ["C"], Ph: ["C"], Bn: ["C"], Ac: ["C"], Bz: ["C"],
  Ts: ["C", "S"], Ms: ["C", "S"], Tf: ["C", "S", "F"], TsCl: ["C", "S", "Cl"], MsCl: ["C", "S", "Cl"],
  Boc: ["C"], Cbz: ["C"], Fmoc: ["C"], TMS: ["C", "Si"], TBS: ["C", "Si"], TBDMS: ["C", "Si"],
  NBS: ["Br", "C", "N"], NCS: ["Cl", "C", "N"], NIS: ["I", "C", "N"], DMSO: ["C", "S"], DMF: ["C", "N"],
  DCC: ["C", "N"], DPPA: ["C", "N", "P"], LDA: ["C", "N", "Li"], DIBAL: ["C", "Al"], mCPBA: ["C", "Cl"], PCC: ["C", "Cr", "Cl"],
};
const KEYWORDS: Array<[RegExp, string[]]> = [
  [/phosph/i, ["P"]], [/sulfon|sulfate|sulfur|thio/i, ["S"]], [/tosyl|mesyl/i, ["C", "S"]],
  [/bromin|bromide|bromo/i, ["Br"]], [/chlorin|chloride|chloro/i, ["Cl"]], [/iodin|iodide|iodo/i, ["I"]], [/fluor/i, ["F"]],
  [/cyanide|nitrile/i, ["C", "N"]], [/azide|ammonia|nitrite|hydrazine/i, ["N"]],
  [/carbon dioxide|carbonate/i, ["C"]], [/silyl|silane/i, ["Si"]], [/boron|borane|boryl/i, ["B"]],
];

/** Element symbols named in a reagent string such as "HgSO₄, H₂SO₄, H₂O" or "1) Ph₃P  2) strong base". */
function reagentElements(text: string): Set<string> {
  // Triarylphosphine ligands (Ph3P, PPh3) leave as the phosphine oxide; their phenyls never enter the product.
  const normalised = [...text].map((char) => SUBSCRIPTS[char] ?? char).join("").replace(/Ph3P|PPh3/g, "P");
  const found = new Set<string>();
  for (const word of normalised.match(/[A-Za-z]+/g) ?? []) {
    for (const element of ABBREVIATIONS[word] ?? []) found.add(element);
  }
  for (const [pattern, elements] of KEYWORDS) {
    if (pattern.test(normalised)) for (const element of elements) found.add(element);
  }
  for (const token of normalised.match(/[A-Z][a-z]?/g) ?? []) {
    if (ELEMENTS.has(token)) found.add(token);
    else if (ELEMENTS.has(token[0])) found.add(token[0]);
    for (const element of ABBREVIATIONS[token] ?? []) found.add(element);
  }
  return found;
}

// ---------------------------------------------------------------------------
// SMARTS helper

async function matches(smiles: string[], smarts: string): Promise<boolean> {
  const rdkit = await getRDKit();
  const query = getCompiledQuerySync(rdkit, smarts);
  if (!query) return false;
  for (const part of smiles) {
    const mol = rdkit.get_mol(part);
    if (!mol) continue;
    try {
      const found = JSON.parse(mol.get_substruct_matches(query));
      if (Array.isArray(found) && found.length > 0) return true;
    } catch {
      /* an unparsable match list counts as no match */
    } finally {
      mol.delete();
    }
  }
  return false;
}

/** Free (non-acylated) amino, hydroxy or phenoxide: the strongly activating ring substituents. */
const STRONG_ACTIVATOR =
  "$([NX3;!$(N-[#6]=[O,S,N]);!$(N-S(=O)=O);!$(N-[N,O]);!$([N+])]),$([OX2H1]),$([OX1-])";
const ACTIVATED_ARENE = `c-[${STRONG_ACTIVATOR}]`;
const OPEN_ORTHO = `[cH]:c-[${STRONG_ACTIVATOR}]`;
const OPEN_PARA = `[cH]1:c:c:c(-[${STRONG_ACTIVATOR}]):c:c1`;
const FREE_ARYLAMINE = "c-[NX3;H2,H1;!$(N-[#6]=[O,S,N]);!$(N-S(=O)=O)]";
const BETA_HALO_CARBONYL = "[CX3](=O)[CX4;!H0][CX4][Cl,Br,I]";
const ENOLIZABLE_ELECTROPHILE = "[Cl,Br,I][CX4].[CX3](=O)[CX4;!H0]";
const BETA_KETO_ACID = "[CX3](=O)[CX4,CX3][CX3](=O)[OX2H1,OX1-]";

function finding(
  stepNumber: number | null,
  code: string,
  level: RouteQualityFindingLevel,
  message: string,
): RouteQualityFinding {
  return { stepNumber, code, level, message };
}

// ---------------------------------------------------------------------------
// Step-level checks

async function checkAtomSourcing(step: SynthesisStep, rule: ReactionRule, out: RouteQualityFinding[]) {
  const reactants = new Map<string, number>();
  for (const smiles of step.reactantComponents) mergeCounts(reactants, smilesElements(smiles));
  for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
    if (requirement.presetSmiles) mergeCounts(reactants, smilesElements(requirement.presetSmiles));
  }
  const products = new Map<string, number>();
  for (const smiles of step.productComponents) mergeCounts(products, smilesElements(smiles));
  const documented = reagentElements(`${rule.reagents} ${rule.reagentNote ?? ""} ${step.reagentLabel ?? ""}`);

  const unsourced: string[] = [];
  for (const [element, count] of products) {
    if (element === "O") continue;
    if (element === "C") {
      if (count > (reactants.get("C") ?? 0) && !documented.has("C")) unsourced.push("C");
      continue;
    }
    if ((reactants.get(element) ?? 0) === 0 && !documented.has(element)) unsourced.push(element);
  }
  if (unsourced.length > 0) {
    out.push(
      finding(
        step.stepNumber,
        "unsourced-atoms",
        "contradiction",
        `The product contains ${unsourced.join(", ")} that appear${unsourced.length === 1 ? "s" : ""} in neither the step's reactants nor its documented reagents (${rule.reagents}).`,
      ),
    );
    return;
  }
  const trackedElsewhere = [...documented].filter((element) => element !== "H" && !reactants.has(element) && !products.has(element));
  if (trackedElsewhere.length > 0) {
    out.push(
      finding(
        step.stepNumber,
        "documented-reagents",
        "info",
        `Uses documented reagents (${rule.reagents}) that are not tracked as structural partners (${trackedElsewhere.join(", ")} stay out of the product). Their availability is assumed, not replayed.`,
      ),
    );
  }
}

async function checkStepChemistry(step: SynthesisStep, rule: ReactionRule, out: RouteQualityFinding[]) {
  const reactants = step.reactantComponents;
  const products = step.productComponents;
  const n = step.stepNumber;

  if (rule.id.startsWith("aromatic-halogenation") && (await matches(reactants, ACTIVATED_ARENE))) {
    const openSite = (await matches(products, OPEN_ORTHO)) || (await matches(products, OPEN_PARA));
    if (openSite) {
      out.push(
        finding(
          n,
          "eas-overhalogenation",
          "concern",
          "A free amino or hydroxy group strongly activates the ring; direct halogenation usually continues past monosubstitution because the product still has an open ortho/para position. The monohalogenated product is shown without protection or a documented way to stop at one halogen.",
        ),
      );
    }
  }

  if (rule.id.startsWith("aromatic-nitration") && (await matches(reactants, FREE_ARYLAMINE))) {
    out.push(
      finding(
        n,
        "eas-nitration-free-arylamine",
        "concern",
        "A free arylamine is protonated in nitrating acid (giving the meta-directing anilinium) and is easily oxidised, so direct nitration does not give the simple ortho/para product without protecting the nitrogen.",
      ),
    );
  }

  if (rule.id.startsWith("aromatic-friedel-crafts-alkylation")) {
    out.push(
      finding(
        n,
        "eas-friedel-crafts-alkylation",
        "concern",
        "Friedel–Crafts alkylation is prone to polyalkylation (the product is more nucleophilic than the arene) and carbocation rearrangement; the shown product is one outcome, not the established major one.",
      ),
    );
  }

  const baseMediated = Boolean(rule.conditions?.base) || Boolean(rule.conditions?.organometallic);
  if (baseMediated && rule.id.includes("alkylation")) {
    if (await matches(reactants, BETA_HALO_CARBONYL)) {
      out.push(
        finding(
          n,
          "base-beta-halo-carbonyl",
          "concern",
          "The alkyl halide is a β-halo carbonyl compound; with a base or enolate present it readily eliminates (E1cB) to the α,β-unsaturated carbonyl, competing with the alkylation shown.",
        ),
      );
    } else if (await matches(reactants, ENOLIZABLE_ELECTROPHILE)) {
      out.push(
        finding(
          n,
          "base-enolizable-electrophile",
          "concern",
          "The alkylating agent itself carries an enolizable carbonyl; the base or enolate can deprotonate it (proton transfer, self-condensation) instead of alkylating.",
        ),
      );
    }
  }
}

function checkBetaKetoAcidIntermediates(
  route: MultistepSynthesisRoute,
  ruleById: Map<string, ReactionRule>,
  flaggedMatches: Map<number, boolean>,
  out: RouteQualityFinding[],
) {
  for (const step of route.steps) {
    if (!flaggedMatches.get(step.stepNumber)) continue;
    // The next step that consumes this product is the one that has to deal with the acid.
    const consumer = route.steps.find(
      (later) =>
        later.stepNumber > step.stepNumber &&
        later.reactantComponents.some((smiles) => step.productComponents.includes(smiles)),
    );
    if (!consumer) continue;
    const consumerRule = ruleById.get(consumer.ruleId);
    if (consumerRule?.id.includes("decarboxylation")) continue;
    out.push(
      finding(
        step.stepNumber,
        "unstable-beta-keto-acid",
        "concern",
        `Step ${step.stepNumber} gives a β-keto (1,3-dicarbonyl) acid that is used as an isolated intermediate in step ${consumer.stepNumber}; such acids decarboxylate readily on mild warming, so the intermediate is unlikely to survive as drawn.`,
      ),
    );
  }
}

const MARKOVNIKOV_TYPE = /^(alkene-(hx-addition|acid-hydration|oxymercuration|alkoxymercuration|halohydrin|haloether)|alkyne-mercury-hydration-internal)/;
const EQUALLY_SUBSTITUTED_ALKENE = ["[CX3;D1]=[CX3;D1]", "[CX3;D2]=[CX3;D2]", "[CX3;D3]=[CX3;D3]"];
const EQUALLY_SUBSTITUTED_ALKYNE = "[CX2;D2]#[CX2;D2]";

type UnrankedKind = "regioisomers" | "radical-mixture" | "no-markovnikov-preference" | "competitive" | "unestablished";

/** Why several unranked outcomes matter, from the rule family and the reactant structure only. */
async function unrankedKind(step: SynthesisStep, rule: ReactionRule | undefined, basis: string): Promise<UnrankedKind> {
  if (rule?.id.startsWith("aromatic-") && /^aromatic-(halogenation|nitration|sulfonation|friedel)/.test(rule.id)) {
    return "regioisomers";
  }
  if (rule?.conditions?.radical && /halogenation|bromination|chlorination/.test(rule.id)) return "radical-mixture";
  if (rule && MARKOVNIKOV_TYPE.test(rule.id)) {
    for (const pattern of [...EQUALLY_SUBSTITUTED_ALKENE, EQUALLY_SUBSTITUTED_ALKYNE]) {
      if (await matches(step.reactantComponents, pattern)) return "no-markovnikov-preference";
    }
  }
  return /competitive/.test(basis) ? "competitive" : "unestablished";
}

// ---------------------------------------------------------------------------
// Route-level assembly

export async function assessRouteQuality(
  route: MultistepSynthesisRoute,
  rules: ReactionRule[],
): Promise<RouteQuality> {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const findings: RouteQualityFinding[] = [];
  const structural = route.verification?.status ?? "not-run";

  if (structural === "failed") {
    findings.push(finding(null, "replay-failed", "contradiction", "Structural replay of the route failed."));
  }

  const betaKeto = new Map<number, boolean>();
  for (const step of route.steps) {
    const rule = ruleById.get(step.ruleId);
    if (!rule) {
      findings.push(finding(step.stepNumber, "unknown-rule", "incomplete", `Rule "${step.ruleId}" is not in the registry.`));
      continue;
    }
    await checkAtomSourcing(step, rule, findings);
    await checkStepChemistry(step, rule, findings);
    betaKeto.set(step.stepNumber, await matches(step.productComponents, BETA_KETO_ACID));
  }
  checkBetaKetoAcidIntermediates(route, ruleById, betaKeto, findings);

  const assessedCompat = Boolean(route.compatibility);
  const assessedSelectivity = Boolean(route.selectivity);

  for (const warning of route.compatibility?.warnings ?? []) {
    findings.push(
      finding(
        warning.stepNumber ?? null,
        `compatibility-${warning.kind}`,
        warning.severity === "model-constraint" ? "contradiction" : "concern",
        warning.message,
      ),
    );
  }
  if (route.compatibility && route.compatibility.unassessedRuleIds.length > 0) {
    findings.push(
      finding(
        null,
        "conditions-unassessed",
        "incomplete",
        `No declared reaction conditions for: ${route.compatibility.unassessedRuleIds.join(", ")}. Compatibility with other groups could not be checked.`,
      ),
    );
  }

  for (const item of route.selectivity?.findings ?? []) {
    if (item.class === "unranked") {
      const step = route.steps.find((candidate) => candidate.stepNumber === item.stepNumber);
      const kind = step ? await unrankedKind(step, ruleById.get(item.ruleId), item.basis) : "unestablished";
      if (kind === "regioisomers") {
        findings.push(
          finding(
            item.stepNumber,
            "selectivity-regioisomers",
            "concern",
            "Electrophilic aromatic substitution on a ring with open ortho/para (or several equivalent-class) positions gives regioisomers; none is established as the major product here, so the single product shown would need separation or a directing strategy.",
          ),
        );
      } else if (kind === "radical-mixture") {
        findings.push(
          finding(
            item.stepNumber,
            "selectivity-radical-mixture",
            "concern",
            "Radical halogenation distinguishes C–H bonds only by their class (tertiary > secondary > primary); where several positions of the same class exist it gives a mixture of constitutional isomers, so the single product shown is not an isolable major product.",
          ),
        );
      } else if (kind === "no-markovnikov-preference") {
        findings.push(
          finding(
            item.stepNumber,
            "selectivity-no-markovnikov-preference",
            "concern",
            "Both alkene carbons carry the same degree of substitution, so Markovnikov control gives little preference and a mixture of regioisomers is expected; the single product shown is one of them.",
          ),
        );
      } else if (kind === "competitive") {
        findings.push(finding(item.stepNumber, "selectivity-competitive", "concern", item.basis));
      } else {
        findings.push(finding(item.stepNumber, "selectivity-unranked", "incomplete", item.basis));
      }
    } else if (item.class === "disfavored") {
      findings.push(finding(item.stepNumber, "selectivity-disfavored", "concern", item.basis));
    } else if (item.class === "unassessed") {
      findings.push(finding(item.stepNumber, "selectivity-unassessed", "incomplete", item.basis));
    } else {
      findings.push(finding(item.stepNumber, `selectivity-${item.class}`, "support", item.basis));
    }
  }

  const lineage = route.verification?.targetLineage;
  if (lineage && lineage.unusedSteps.length > 0) {
    findings.push(
      finding(
        null,
        "unused-steps",
        "incomplete",
        `Step${lineage.unusedSteps.length === 1 ? "" : "s"} ${lineage.unusedSteps.join(", ")} do${lineage.unusedSteps.length === 1 ? "es" : ""} not contribute to the target.`,
      ),
    );
  }

  let tier: RouteQualityTier;
  const rank: RouteQualityTier[] = ["contradicted", "known-concern", "plausible-incomplete"];
  const worst = rank.find((candidate) => findings.some((item) => LEVEL_TO_TIER[item.level] === candidate));
  if (worst) tier = worst;
  else if (structural === "not-run" || !assessedCompat || !assessedSelectivity) tier = "structure-verified";
  else tier = "chemically-supported";

  return { assessmentVersion: ROUTE_QUALITY_ASSESSMENT_VERSION, structural, tier, findings };
}
