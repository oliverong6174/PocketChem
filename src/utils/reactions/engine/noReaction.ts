import { getRDKit } from "../../rdkit";
import type { FunctionalGroupResult } from "../../functionalGroups";
import type { ReactionRule } from "../reactionTypes";
import { ruleMatchesReactant } from "./ruleMatcher";
import { splitReactionComponents } from "./reactionInput";
import {
  GRIGNARD_OR_ORGANOLITHIUM_LONG_LABEL,
  GRIGNARD_OR_ORGANOLITHIUM_SHORT_LABEL,
  GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS,
} from "../organometallic";

export type NoReactionOutcome = {
  id: string;
  title: string;
  reagentLabel: string;
  explanation: string;
  suggestion?: string;
  category: "steric" | "missing-site" | "electronic" | "mechanistic";
  ruleIds: string[];
};

type NoReactionCaseDefinition = {
  id: string;
  smarts: string;
  title: string;
  reagentLabel: string;
  explanation: string;
  suggestion?: string;
  category: NoReactionOutcome["category"];
  ruleIds: string[];
};

function substructureMatchCount(mol: any, query: any): number {
  if (!mol || !query) return 0;
  try {
    const raw = mol.get_substruct_matches?.(query);
    if (typeof raw !== "string" || !raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

async function nonConjugatedDieneDielsAlderOutcome(
  smiles: string,
  successfulRuleIds: Set<string>,
): Promise<NoReactionOutcome | null> {
  if (successfulRuleIds.has("diene-diels-alder")) return null;

  const components = splitReactionComponents(smiles);
  if (components.length < 2) return null;

  const rdkit = await getRDKit();
  let alkeneQuery: any = null;
  let alkyneQuery: any = null;
  let conjugatedDieneQuery: any = null;

  try {
    alkeneQuery = rdkit.get_qmol("[C;!a]=[C;!a]");
    alkyneQuery = rdkit.get_qmol("[C]#[C]");
    conjugatedDieneQuery = rdkit.get_qmol("[C;!a]=[C;!a]-[C;!a]=[C;!a]");

    const componentInfo: Array<{
      alkeneCount: number;
      hasAlkyne: boolean;
      hasConjugatedDiene: boolean;
    }> = [];

    for (const component of components) {
      const mol = rdkit.get_mol(component);
      if (!mol) {
        componentInfo.push({ alkeneCount: 0, hasAlkyne: false, hasConjugatedDiene: false });
        continue;
      }

      try {
        componentInfo.push({
          alkeneCount: substructureMatchCount(mol, alkeneQuery),
          hasAlkyne: substructureMatchCount(mol, alkyneQuery) > 0,
          hasConjugatedDiene: substructureMatchCount(mol, conjugatedDieneQuery) > 0,
        });
      } finally {
        mol.delete?.();
      }
    }

    const nonConjugatedDieneIndexes = componentInfo
      .map((info, index) => ({ info, index }))
      .filter(({ info }) => info.alkeneCount >= 2 && !info.hasConjugatedDiene)
      .map(({ index }) => index);

    if (nonConjugatedDieneIndexes.length === 0) return null;

    const hasSeparateDienophile = nonConjugatedDieneIndexes.some((dieneIndex) =>
      componentInfo.some(
        (info, index) =>
          index !== dieneIndex && (info.alkeneCount >= 1 || info.hasAlkyne),
      ),
    );

    if (!hasSeparateDienophile) return null;

    return {
      id: "diels-alder-nonconjugated-diene",
      title: "NO REACTION — Diels–Alder requires a conjugated 1,3-diene",
      reagentLabel: "heat",
      explanation:
        "One drawn component contains multiple C=C bonds, but they are not arranged as a conjugated C=C–C=C diene. A standard thermal Diels–Alder reaction cannot use a nonconjugated diene directly, even when a valid alkene or alkyne dienophile is also present.",
      suggestion:
        "Use a true conjugated 1,3-diene (able to adopt s-cis geometry) with the dienophile. If the intended structure was a 1,3-diene, correct the double-bond placement rather than forcing a Diels–Alder product from the nonconjugated isomer.",
      category: "mechanistic",
      ruleIds: ["diene-diels-alder", "diene-diels-alder-alkyne"],
    };
  } finally {
    alkeneQuery?.delete?.();
    alkyneQuery?.delete?.();
    conjugatedDieneQuery?.delete?.();
  }
}

async function organometallicWithUnactivatedPiSystemOutcome(
  smiles: string,
): Promise<NoReactionOutcome | null> {
  const components = splitReactionComponents(smiles);
  if (components.length < 2) return null;

  const rdkit = await getRDKit();
  let organometallicQuery: any = null;
  let alkeneQuery: any = null;
  let carbonylQuery: any = null;
  let nitrileQuery: any = null;
  let epoxideQuery: any = null;

  try {
    // Reaction input normalization converts common ionic Ketcher forms into
    // bonded R-Mg-X / R-Li structures first.  Match only standard classroom
    // Grignards (X = Cl, Br, I) and organolithiums here; do not classify an
    // arbitrary C-Mg bond or magnesium salt as a Grignard reagent.
    organometallicQuery = rdkit.get_qmol(GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS);
    alkeneQuery = rdkit.get_qmol("[C;!a]=[C;!a]");
    carbonylQuery = rdkit.get_qmol("[C,c]=[O]");
    nitrileQuery = rdkit.get_qmol("[C]#[N]");
    epoxideQuery = rdkit.get_qmol("[O;r3]1[C;r3][C;r3]1");

    let hasOrganometallic = false;
    let hasUnactivatedPiBond = false;
    let hasClassicalElectrophile = false;

    for (const component of components) {
      const mol = rdkit.get_mol(component);
      if (!mol) continue;

      try {
        hasOrganometallic ||= Boolean(
          organometallicQuery && mol.get_substruct_match(organometallicQuery) !== "{}",
        );

        hasUnactivatedPiBond ||= Boolean(
          alkeneQuery && mol.get_substruct_match(alkeneQuery) !== "{}",
        );
        hasClassicalElectrophile ||= Boolean(
          (carbonylQuery && mol.get_substruct_match(carbonylQuery) !== "{}") ||
          (nitrileQuery && mol.get_substruct_match(nitrileQuery) !== "{}") ||
          (epoxideQuery && mol.get_substruct_match(epoxideQuery) !== "{}")
        );
      } finally {
        mol.delete?.();
      }
    }

    if (!hasOrganometallic || !hasUnactivatedPiBond || hasClassicalElectrophile) {
      return null;
    }

    return {
      id: "organometallic-unactivated-alkene-diene",
      title: "NO REACTION — Grignard/organolithium with an unactivated alkene or diene",
      reagentLabel: GRIGNARD_OR_ORGANOLITHIUM_SHORT_LABEL,
      explanation:
        `${GRIGNARD_OR_ORGANOLITHIUM_LONG_LABEL} does not add across an ordinary unactivated C=C bond in standard O-Chem chemistry. These carbon nucleophiles need an electrophilic site such as a carbonyl, nitrile, epoxide, CO₂, or related polarized functional group.`,
      suggestion:
        "Use a classical electrophile such as a carbonyl, nitrile, epoxide, ester/acyl derivative, or CO₂. For an alkene, a valid multistep route is 1) 1 equiv mCPBA to make an epoxide, 2) RMgCl/RMgBr/RMgI or RLi, 3) H₃O⁺; PocketChem supports that sequence separately from direct organometallic addition to C=C.",
      category: "electronic",
      ruleIds: [],
    };
  } finally {
    organometallicQuery?.delete?.();
    alkeneQuery?.delete?.();
    carbonylQuery?.delete?.();
    nitrileQuery?.delete?.();
    epoxideQuery?.delete?.();
  }
}

const CASES: NoReactionCaseDefinition[] = [
  {
    id: "vicinal-diol-generic-e1",
    smarts: "[C;X4]([OH])-[C;X4]([OH])",
    title: "NO REACTION — Generic alcohol E1 dehydration of a vicinal diol",
    reagentLabel: "Concentrated H₂SO₄ or H₃PO₄, heat",
    explanation:
      "This substrate contains adjacent alcohols. Under strongly acidic, heated conditions PocketChem routes a vicinal diol through the pinacol rearrangement pathway rather than treating one OH as an ordinary isolated alcohol for generic E1 dehydration.",
    suggestion:
      "Use the Pinacol Rearrangement condition. PocketChem ranks hydride, aryl, alkyl, and ring-bond migration according to the actual substrate instead of assuming every cyclic vicinal diol contracts the ring.",
    category: "mechanistic",
    ruleIds: ["alcohol-dehydration-alkene", "alcohol-dehydration-primary"],
  },
  {
    id: "tertiary-alcohol-oxidation",
    smarts: "[C;X4;H0]([O;H1])([#6])([#6])[#6]",
    title: "NO REACTION — Tertiary alcohol oxidation",
    reagentLabel: "PCC, DMP, Jones reagent, NaOCl, or KMnO₄",
    explanation:
      "A tertiary alcohol has no hydrogen on the carbon bearing OH. The normal alcohol-to-carbonyl oxidation pathway therefore cannot occur without breaking a C–C bond.",
    suggestion:
      "Use a reaction designed for C–C cleavage if that is actually the goal; ordinary alcohol oxidation reagents do not simply give a ketone or carboxylic acid here.",
    category: "mechanistic",
    ruleIds: [
      "primary-alcohol-mild-oxidation",
      "primary-alcohol-strong-oxidation",
      "secondary-alcohol-oxidation-pcc",
      "secondary-alcohol-oxidation-dmp",
      "secondary-alcohol-oxidation-jones",
      "secondary-alcohol-oxidation-naocl",
      "secondary-alcohol-oxidation-kmno4",
      "benzylic-allylic-alcohol-oxidation",
    ],
  },
  {
    id: "tertiary-alcohol-sn2-reagents",
    smarts: "[C;X4;H0]([O;H1])([#6])([#6])[#6]",
    title: "NO REACTION — Tertiary alcohol under SN2 alcohol-conversion conditions",
    reagentLabel: "PBr₃ or SOCl₂/pyridine",
    explanation:
      "These conditions rely on backside substitution at the carbon bearing oxygen. A tertiary carbon is too sterically hindered for the required SN2 displacement.",
    suggestion:
      "Use HX/Lucas-type conditions when a tertiary alkyl halide is desired, while remembering that elimination or rearrangement can compete under carbocation-forming conditions.",
    category: "steric",
    ruleIds: ["alcohol-pbr3", "alcohol-socl2"],
  },
  {
    id: "primary-alcohol-lucas-room-temperature",
    smarts: "[CH2][OH]",
    title: "NO REACTION — Primary alcohol with Lucas reagent at room temperature",
    reagentLabel: "Concentrated HCl, ZnCl₂",
    explanation:
      "An ordinary primary alcohol does not form a sufficiently stable carbocation under the room-temperature Lucas test, so no immediate alkyl-chloride/turbidity reaction is expected. Primary alcohols are therefore classified as very slow or no reaction on the Lucas-test timescale.",
    suggestion:
      "Heating can promote substitution for some primary alcohols, or use SOCl₂/PCl₃ when a clean primary alkyl chloride is the synthetic goal.",
    category: "mechanistic",
    ruleIds: ["alcohol-lucas-reagent"],
  },
  {
    id: "internal-alkyne-deprotonation",
    smarts: "[#6][C]#[C][#6]",
    title: "NO REACTION — Internal alkyne deprotonation",
    reagentLabel: "NaNH₂, NH₃(l)",
    explanation:
      "Only terminal alkynes possess the acidic sp C–H proton required to form an acetylide ion. An internal alkyne has no terminal alkyne hydrogen to remove.",
    category: "missing-site",
    ruleIds: ["terminal-alkyne-deprotonation", "terminal-alkyne-deuterium-exchange"],
  },
  {
    id: "benzylic-oxidation-no-h",
    smarts: "[c][C;X4;H0]([#6])([#6])[#6]",
    title: "NO REACTION — Benzylic oxidation without a benzylic H",
    reagentLabel: "1) KMnO₄, OH⁻, heat  2) H₃O⁺",
    explanation:
      "Strong side-chain oxidation requires at least one hydrogen on the benzylic carbon. A fully substituted benzylic carbon cannot enter the usual oxidation pathway.",
    category: "missing-site",
    ruleIds: ["benzylic-oxidation"],
  },
  {
    id: "benzylic-halogenation-no-h",
    smarts: "[c][C;X4;H0]([#6])([#6])[#6]",
    title: "NO REACTION — Benzylic radical halogenation without a benzylic H",
    reagentLabel: "NXS, hν or radical initiator",
    explanation:
      "Benzylic radical halogenation begins by abstracting a benzylic hydrogen. If the benzylic carbon has no hydrogen, that radical cannot be formed at that site.",
    category: "missing-site",
    ruleIds: ["benzylic-bromination"],
  },
  {
    id: "methyl-halide-e2",
    smarts: "[CH3][Cl,Br,I]",
    title: "NO REACTION — E2 elimination of a methyl halide",
    reagentLabel: "Strong base / E2 conditions",
    explanation:
      "E2 elimination requires a β-carbon bearing a β-hydrogen. A methyl halide has no β-carbon, so an alkene cannot form by E2.",
    suggestion: "Methyl halides instead undergo SN2 very readily with suitable nucleophiles.",
    category: "missing-site",
    ruleIds: [
      "haloalkane-e2-hydroxide",
      "haloalkane-e2-zaitsev",
      "haloalkane-e2-hofmann",
      "haloalkane-e2-amide-base",
    ],
  },
  {
    id: "tertiary-halide-sn2",
    smarts: "[C;X4;H0]([#6])([#6])([#6])[Cl,Br,I]",
    title: "NO REACTION — SN2 at a tertiary alkyl halide",
    reagentLabel: "Strong nucleophile / SN2 conditions",
    explanation:
      "A tertiary electrophilic carbon is too sterically crowded for backside attack, so a normal SN2 displacement is blocked.",
    suggestion:
      "Depending on the reagent and solvent, E2 or SN1/E1 chemistry is usually more plausible.",
    category: "steric",
    ruleIds: [
      "haloalkane-sn2-hydroxide",
      "haloalkane-sn2-cyanide",
      "haloalkane-sn2-azide",
      "haloalkane-sn2-iodide",
      "haloalkane-sn2-ammonia",
      "haloalkane-williamson-ether",
      "haloalkane-acetylide-alkylation",
    ],
  },
  {
    id: "friedel-crafts-nitroarene",
    smarts: "[c][N+](=O)[O-]",
    title: "NO REACTION — Friedel–Crafts on a strongly deactivated nitroarene",
    reagentLabel: "Friedel–Crafts alkylation/acylation conditions",
    explanation:
      "A nitro group strongly withdraws electron density from the aromatic ring, making the ring too deactivated for ordinary Friedel–Crafts substitution.",
    category: "electronic",
    ruleIds: ["aromatic-friedel-crafts-alkylation", "aromatic-friedel-crafts-acylation"],
  },
  {
    id: "friedel-crafts-aniline",
    smarts: "[c][N;H1,H2;+0]",
    title: "NO REACTION — Unprotected aniline under AlCl₃ Friedel–Crafts conditions",
    reagentLabel: "AlCl₃ / Friedel–Crafts conditions",
    explanation:
      "The amine strongly coordinates to AlCl₃. This ties up the Lewis acid and converts the amino substituent into a strongly deactivating complex, so ordinary Friedel–Crafts alkylation or acylation is not reliable.",
    suggestion: "Protect the amine before attempting Friedel–Crafts chemistry.",
    category: "electronic",
    ruleIds: ["aromatic-friedel-crafts-alkylation", "aromatic-friedel-crafts-acylation"],
  },
];

const FAMILY_GROUP_KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "acid-chlorides": ["acid chloride", "acyl halide"],
  alcohols: ["alcohol"],
  aldehydes: ["aldehyde"],
  alkanes: ["alkane"],
  alkenes: ["alkene"],
  alkynes: ["alkyne"],
  amides: ["amide"],
  amines: ["amine"],
  anhydrides: ["anhydride"],
  aromatics: ["benzene", "aromatic", "arene", "phenol", "aniline", "aryl", "naphthalene", "anthracene", "phenanthrene"],
  "carbonyl-derivatives": ["imine", "oxime", "hydrazone", "acetal", "hemiacetal"],
  "carboxylic-acids": ["carboxylic acid"],
  couplings: ["aryl halide", "vinyl halide", "boronic", "terminal alkyne"],
  diazonium: ["diazonium"],
  dienes: ["diene"],
  enolates: ["aldehyde", "ketone", "ester", "enolate"],
  epoxides: ["epoxide"],
  esters: ["ester"],
  ethers: ["ether"],
  haloalkanes: ["haloalkane", "alkyl halide", "allylic halide", "benzyl halide"],
  ketones: ["ketone"],
  nitriles: ["nitrile"],
  phenols: ["phenol"],
  sulfur: ["thiol", "thiolate", "thioether", "disulfide", "sulfoxide", "sulfone"],
});

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectedNames(functionalGroups: FunctionalGroupResult[]): string[] {
  const names = new Set<string>();
  for (const group of functionalGroups) {
    names.add(normalizeName(group.name));
    for (const equivalent of group.equivalentNames ?? []) names.add(normalizeName(equivalent));
  }
  return [...names];
}

function familyIsRelevant(rule: ReactionRule, functionalGroups: FunctionalGroupResult[]): boolean {
  const names = detectedNames(functionalGroups);
  const keywords = FAMILY_GROUP_KEYWORDS[rule.family] ?? [];
  if (keywords.length > 0 && names.some((name) => keywords.some((keyword) => name.includes(keyword)))) {
    return true;
  }

  const triggerNames = [
    ...(rule.trigger.functionalGroups ?? []),
    ...(rule.trigger.anyFunctionalGroups ?? []),
    ...(rule.trigger.allFunctionalGroups ?? []),
  ].map(normalizeName);

  return triggerNames.some((required) => names.some((name) => name === required));
}

function toOutcome(definition: NoReactionCaseDefinition): NoReactionOutcome {
  return {
    id: definition.id,
    title: definition.title,
    reagentLabel: definition.reagentLabel,
    explanation: definition.explanation,
    suggestion: definition.suggestion,
    category: definition.category,
    ruleIds: definition.ruleIds,
  };
}

function toRuleSpecificOutcome(
  definition: NoReactionCaseDefinition,
  rule: ReactionRule,
): NoReactionOutcome {
  return {
    id: `${definition.id}--${rule.id}`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation: definition.explanation,
    suggestion: definition.suggestion,
    category: definition.category,
    ruleIds: [rule.id],
  };
}

async function matchingCaseIds(smiles: string): Promise<Set<string>> {
  const matches = new Set<string>();
  const trimmed = smiles.trim();
  if (!trimmed || trimmed.includes(".")) return matches;

  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(trimmed);
  if (!mol) return matches;

  try {
    for (const definition of CASES) {
      let query: any = null;
      try {
        query = rdkit.get_qmol(definition.smarts);
        if (query && mol.get_substruct_match(query) !== "{}") {
          matches.add(definition.id);
        }
      } catch (error) {
        console.warn("No-reaction SMARTS failed:", definition.id, error);
      } finally {
        query?.delete?.();
      }
    }
  } finally {
    mol.delete?.();
  }

  return matches;
}

function genericNoReactionOutcome(
  rule: ReactionRule,
  functionalGroups: FunctionalGroupResult[],
): NoReactionOutcome {
  const names = detectedNames(functionalGroups);
  const requiredNames = [
    ...(rule.trigger.functionalGroups ?? []),
    ...(rule.trigger.anyFunctionalGroups ?? []),
    ...(rule.trigger.allFunctionalGroups ?? []),
  ];
  const excludedNames = rule.trigger.excludedFunctionalGroups ?? [];
  const matchedExcluded = excludedNames.find((excluded) =>
    names.includes(normalizeName(excluded)),
  );

  let explanation: string;
  if (matchedExcluded) {
    explanation =
      `${rule.title} does not apply because this substrate contains ${matchedExcluded}, ` +
      "which is explicitly excluded by the reaction rule for these conditions.";
  } else if (requiredNames.length > 0) {
    const current = names.length > 0 ? names.slice(0, 4).join(", ") : "the current substrate class";
    explanation =
      `These conditions require ${requiredNames.join(" or ")}. ` +
      `The current molecule is classified as ${current}, so it does not satisfy the substrate requirement for this reaction.`;
  } else {
    explanation =
      "The relevant functional-group family is present, but this molecule lacks the specific structural arrangement required by this rule (for example the needed substitution pattern, hydrogen, or accessible reaction site).";
  }

  return {
    id: `no-reaction-${rule.id}`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation,
    suggestion:
      "Choose a condition whose substrate requirements match the functional-group class and substitution pattern of the molecule you drew.",
    category: "missing-site",
    ruleIds: [rule.id],
  };
}

/**
 * Returns explicit no-reaction cards for chemically related catalog rules that
 * fail on the current substrate. Specific mechanistic/steric cases win over the
 * generic trigger explanation. Unrelated reaction families are not shown.
 */
export async function predictNoReactionOutcomes(
  smiles: string,
  successfulRuleIds: Iterable<string> = [],
  rules: ReactionRule[] = [],
  functionalGroups: FunctionalGroupResult[] = [],
): Promise<NoReactionOutcome[]> {
  const successful = new Set(successfulRuleIds);

  // Multi-reactant inputs need a chemically explicit result too. In
  // particular, a hydrocarbon alkene/diene + a standard Grignard/RLi should not silently
  // disappear or be mistaken for a broken organometallic parser: it is a true
  // NO REACTION under ordinary O-Chem conditions.
  const multiReactantOutcomes: NoReactionOutcome[] = [];

  const organometallicNoReaction =
    await organometallicWithUnactivatedPiSystemOutcome(smiles);
  if (organometallicNoReaction) multiReactantOutcomes.push(organometallicNoReaction);

  const dielsAlderNoReaction = await nonConjugatedDieneDielsAlderOutcome(
    smiles,
    successful,
  );
  if (dielsAlderNoReaction) multiReactantOutcomes.push(dielsAlderNoReaction);

  if (multiReactantOutcomes.length > 0) return multiReactantOutcomes;

  const matchedCases = await matchingCaseIds(smiles);

  // Backward-compatible behavior for callers that do not provide the registry.
  if (rules.length === 0) {
    return CASES.filter(
      (definition) =>
        matchedCases.has(definition.id) &&
        !definition.ruleIds.some((ruleId) => successful.has(ruleId)),
    ).map(toOutcome);
  }

  const outcomes: NoReactionOutcome[] = [];

  for (const rule of rules) {
    if (successful.has(rule.id)) continue;
    if (rule.transform.type === "conceptOnly") continue;
    if (!familyIsRelevant(rule, functionalGroups)) continue;

    const specific = CASES.find(
      (definition) => matchedCases.has(definition.id) && definition.ruleIds.includes(rule.id),
    );

    // A known steric/mechanistic block is useful even when the catalog rule
    // normally consumes a second reagent (for example I- with a tertiary
    // alkyl halide). Show the chemically meaningful NO REACTION instead of
    // hiding the condition merely because its nucleophile is a co-reactant.
    if (specific) {
      outcomes.push(toRuleSpecificOutcome(specific, rule));
      continue;
    }

    // For arbitrary multi-reactant chemistry, absence of the second structure
    // is an input requirement rather than a chemical no-reaction prediction.
    if ((rule.additionalReactants?.length ?? 0) > 0) continue;

    // If the trigger actually matches, absence of a generated product is an
    // engine/product-generation issue, not a chemical NO REACTION prediction.
    if (await ruleMatchesReactant(rule, smiles, functionalGroups)) continue;

    outcomes.push(genericNoReactionOutcome(rule, functionalGroups));
  }

  return outcomes.sort((a, b) => {
    const aRule = rules.find((rule) => rule.id === a.ruleIds[0]);
    const bRule = rules.find((rule) => rule.id === b.ruleIds[0]);
    return (aRule?.priority ?? 9999) - (bRule?.priority ?? 9999) || a.title.localeCompare(b.title);
  });
}

export async function explainNoReactionForRule(
  smiles: string,
  rule: ReactionRule,
): Promise<NoReactionOutcome> {
  const matched = await matchingCaseIds(smiles);
  const specific = CASES.find(
    (definition) =>
      matched.has(definition.id) && definition.ruleIds.includes(rule.id),
  );

  if (specific) return toRuleSpecificOutcome(specific, rule);

  return {
    id: `no-reaction-${rule.id}`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation:
      "The current molecule does not satisfy the structural substrate requirements for this condition, so PocketChem predicts no reaction for this step.",
    suggestion:
      "Check the required functional group, substitution pattern, reactive hydrogen, and steric accessibility for this reaction.",
    category: "missing-site",
    ruleIds: [rule.id],
  };
}
