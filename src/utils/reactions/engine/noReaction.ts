import { getRDKit } from "../../rdkit";
import type { ReactionRule } from "../reactionTypes";

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

const CASES: NoReactionCaseDefinition[] = [
  {
    id: "tertiary-alcohol-oxidation",
    smarts: "[C;X4;H0]([O;H1])([#6])([#6])[#6]",
    title: "NO REACTION — Tertiary alcohol oxidation",
    reagentLabel: "PCC, DMP, Jones reagent, NaOCl, or KMnO₄",
    explanation:
      "A tertiary alcohol has no hydrogen on the carbon bearing OH. The normal alcohol-to-carbonyl oxidation pathway therefore cannot occur without breaking a C–C bond.",
    suggestion:
      "Use a reaction designed for C–C cleavage if that is actually the goal; ordinary alcohol oxidation reagents do not simply give a ketone here.",
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
      "haloalkane-e2-zaitsev",
      "haloalkane-e2-hofmann",
      "haloalkane-e2",
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
      "haloalkane-sn2",
      "haloalkane-sn2-primary",
      "haloalkane-sn2-secondary",
      "alcohol-williamson-ether",
      "terminal-alkyne-alkylation",
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

export async function predictNoReactionOutcomes(
  smiles: string,
  successfulRuleIds: Iterable<string> = [],
): Promise<NoReactionOutcome[]> {
  const successful = new Set(successfulRuleIds);
  const matched = await matchingCaseIds(smiles);

  return CASES.filter(
    (definition) =>
      matched.has(definition.id) &&
      !definition.ruleIds.some((ruleId) => successful.has(ruleId)),
  ).map(toOutcome);
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

  if (specific) {
    return toOutcome(specific);
  }

  return {
    id: `no-reaction-${rule.id}`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation:
      "The current molecule does not contain the reactive structural feature required by this condition, so PocketChem predicts no reaction for this step.",
    suggestion:
      "Check that the intended functional group is present before applying this reagent sequence.",
    category: "missing-site",
    ruleIds: [rule.id],
  };
}
