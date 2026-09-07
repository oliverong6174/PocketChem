import type {
  ReactionReactantRequirement,
  ReactionRule,
} from "../reactionTypes";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { explainNoReactionForRule, type NoReactionOutcome } from "./noReaction";

export type SequentialConditionOption = {
  ruleId: string;
  title: string;
  reagents: string;
  reagentNote: string;
  family: string;
  priority: number;
  searchText: string;
  additionalReactantLabels: string[];
  autoSuppliedReactantLabels: string[];
  requiresStructuralReactantInput: boolean;
};

export type SequentialSynthesisStep = {
  stepNumber: number;
  ruleId: string;
  title: string;
  reagentLabel: string;
  reagentNote: string;
  reactantSmiles: string;
  productSmiles: string;
  productLabel: string;
  status: "reaction" | "no-reaction";
  explanation: string;
  noReaction: NoReactionOutcome | null;
};

export type SequentialSynthesisBranch = {
  id: string;
  startingSmiles: string;
  finalSmiles: string;
  steps: SequentialSynthesisStep[];
};

export type SequentialSynthesisOptions = {
  branchLimit?: number;
};

/**
 * Fixed reagent structures that the multicatalytic workflow can safely supply
 * without asking the user to draw a second molecule. Variable carbon reagents
 * (Grignards, arbitrary alkoxides, aldehydes, etc.) are deliberately omitted
 * because their carbon skeleton cannot be inferred from a reagent label.
 */
const PRESET_ADDITIONAL_REACTANTS: Readonly<Record<string, string>> = Object.freeze({
  "hydroxide ion": "[OH-]",
  "cyanide ion": "[C-]#N",
  "azide ion": "[N-]=[N+]=N",
  "iodide ion": "[I-]",
  "bromide ion": "[Br-]",
  "chloride ion": "[Cl-]",
  "fluoride ion": "[F-]",
  ammonia: "N",
  water: "O",
  "tert-butoxide ion": "CC(C)(C)[O-]",
  "amide base": "[NH2-]",
  "carbon dioxide": "O=C=O",
});

const ADDITIONAL_REACTANT_SEARCH_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "hydroxide ion": "OH- hydroxide anion",
  "cyanide ion": "CN- cyanide anion",
  "azide ion": "N3- azide anion",
  "iodide ion": "I- iodine ion iodide anion",
  "bromide ion": "Br- bromide anion",
  "chloride ion": "Cl- chloride anion",
  "fluoride ion": "F- fluoride anion",
  "tert-butoxide ion": "t-BuO- tert butoxide anion",
  "amide base": "NH2- amide ion",
});

function normalizeReactantLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function presetSmilesForRequirement(
  requirement: ReactionReactantRequirement,
): string | null {
  return PRESET_ADDITIONAL_REACTANTS[normalizeReactantLabel(requirement.label)] ?? null;
}

function additionalReactantInfo(rule: ReactionRule) {
  const requirements = rule.additionalReactants ?? [];
  const autoSupplied: string[] = [];
  const unresolved: string[] = [];
  const presetSmiles: string[] = [];

  for (const requirement of requirements) {
    const smiles = presetSmilesForRequirement(requirement);
    if (!smiles) {
      unresolved.push(requirement.label);
      continue;
    }

    autoSupplied.push(requirement.label);
    const equivalents = Math.max(1, Math.floor(requirement.equivalents ?? 1));
    for (let copy = 0; copy < equivalents; copy += 1) presetSmiles.push(smiles);
  }

  return {
    labels: requirements.map((requirement) => requirement.label),
    autoSupplied,
    unresolved,
    presetSmiles,
  };
}

/**
 * The selector should expose the entire reaction catalog. A rule that needs an
 * arbitrary second structure is still searchable; the sequence runner reports
 * that the missing structural reactant must be specified instead of silently
 * hiding the reaction from the user.
 */
export function getSequentialConditionOptions(
  rules: ReactionRule[],
): SequentialConditionOption[] {
  return rules
    .map((rule) => {
      const reactantInfo = additionalReactantInfo(rule);
      return {
        ruleId: rule.id,
        title: rule.title,
        reagents: rule.reagents,
        reagentNote: rule.reagentNote,
        family: rule.family,
        priority: rule.priority,
        additionalReactantLabels: reactantInfo.labels,
        autoSuppliedReactantLabels: reactantInfo.autoSupplied,
        requiresStructuralReactantInput:
          rule.transform.type === "conceptOnly" || reactantInfo.unresolved.length > 0,
        searchText: `${rule.title} ${rule.reagents} ${rule.reagentNote} ${rule.family} ${reactantInfo.labels.join(" ")} ${reactantInfo.labels.map((label) => ADDITIONAL_REACTANT_SEARCH_ALIASES[normalizeReactantLabel(label)] ?? "").join(" ")}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}

function uniqueProducts<T extends { productSmiles: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.productSmiles) return false;
    if (seen.has(item.productSmiles)) return false;
    seen.add(item.productSmiles);
    return true;
  });
}

function missingStructuralReactantOutcome(
  rule: ReactionRule,
  unresolvedLabels: string[],
): NoReactionOutcome {
  const labels = unresolvedLabels.join(", ");
  return {
    id: `no-reaction-${rule.id}-missing-coreactant`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation:
      `This catalog reaction needs an additional structural reactant (${labels}). ` +
      "The multicatalytic page can automatically supply fixed small reagents and ions, but it cannot infer an arbitrary carbon-containing co-reactant from the condition name alone.",
    suggestion:
      "Use the one-step reaction page and draw both reactants as disconnected structures when the identity of the second organic reactant matters.",
    category: "missing-site",
    ruleIds: [rule.id],
  };
}

function conceptOnlyOutcome(rule: ReactionRule): NoReactionOutcome {
  return {
    id: `no-reaction-${rule.id}-concept-only`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation:
      rule.transform.type === "conceptOnly"
        ? rule.transform.reason
        : "This rule does not currently have an executable structure transform.",
    suggestion:
      "PocketChem can list this reaction condition, but an exact product requires more structural information than this sequence step currently supplies.",
    category: "mechanistic",
    ruleIds: [rule.id],
  };
}

export async function runSequentialSynthesis(
  startingSmiles: string,
  selectedRuleIds: string[],
  rules: ReactionRule[],
  options: SequentialSynthesisOptions = {},
): Promise<SequentialSynthesisBranch[]> {
  const trimmedStart = startingSmiles.trim();
  if (!trimmedStart || selectedRuleIds.length === 0) return [];

  const branchLimit = Math.max(1, Math.min(12, options.branchLimit ?? 6));
  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));

  let branches: SequentialSynthesisBranch[] = [
    {
      id: "sequence-1",
      startingSmiles: trimmedStart,
      finalSmiles: trimmedStart,
      steps: [],
    },
  ];

  for (let stepIndex = 0; stepIndex < selectedRuleIds.length; stepIndex += 1) {
    const ruleId = selectedRuleIds[stepIndex];
    const rule = ruleMap.get(ruleId);
    if (!rule) continue;

    const reactantInfo = additionalReactantInfo(rule);
    const nextBranches: SequentialSynthesisBranch[] = [];

    for (const branch of branches) {
      const reactantSmiles = branch.finalSmiles;

      if (rule.transform.type === "conceptOnly") {
        const noReaction = conceptOnlyOutcome(rule);
        nextBranches.push({
          ...branch,
          id: `${branch.id}-s${stepIndex + 1}-nr`,
          finalSmiles: reactantSmiles,
          steps: [
            ...branch.steps,
            {
              stepNumber: stepIndex + 1,
              ruleId: rule.id,
              title: rule.title,
              reagentLabel: rule.reagents,
              reagentNote: rule.reagentNote,
              reactantSmiles,
              productSmiles: reactantSmiles,
              productLabel: "NO REACTION",
              status: "no-reaction",
              explanation: noReaction.explanation,
              noReaction,
            },
          ],
        });
        continue;
      }

      if (reactantInfo.unresolved.length > 0) {
        const noReaction = missingStructuralReactantOutcome(rule, reactantInfo.unresolved);
        nextBranches.push({
          ...branch,
          id: `${branch.id}-s${stepIndex + 1}-nr`,
          finalSmiles: reactantSmiles,
          steps: [
            ...branch.steps,
            {
              stepNumber: stepIndex + 1,
              ruleId: rule.id,
              title: rule.title,
              reagentLabel: rule.reagents,
              reagentNote: rule.reagentNote,
              reactantSmiles,
              productSmiles: reactantSmiles,
              productLabel: "NO REACTION",
              status: "no-reaction",
              explanation: noReaction.explanation,
              noReaction,
            },
          ],
        });
        continue;
      }

      const reactionInput = [reactantSmiles, ...reactantInfo.presetSmiles]
        .filter(Boolean)
        .join(".");
      const pathways = uniqueProducts(
        await predictReactionPathwaysFromRules(reactionInput, [], [rule]),
      );

      if (pathways.length === 0) {
        const noReaction = await explainNoReactionForRule(reactantSmiles, rule);
        nextBranches.push({
          ...branch,
          id: `${branch.id}-s${stepIndex + 1}-nr`,
          finalSmiles: reactantSmiles,
          steps: [
            ...branch.steps,
            {
              stepNumber: stepIndex + 1,
              ruleId: rule.id,
              title: rule.title,
              reagentLabel: rule.reagents,
              reagentNote: rule.reagentNote,
              reactantSmiles,
              productSmiles: reactantSmiles,
              productLabel: "NO REACTION",
              status: "no-reaction",
              explanation: noReaction.explanation,
              noReaction,
            },
          ],
        });
        continue;
      }

      for (let productIndex = 0; productIndex < pathways.length; productIndex += 1) {
        const pathway = pathways[productIndex];
        if (!pathway.productSmiles) continue;

        nextBranches.push({
          ...branch,
          id: `${branch.id}-s${stepIndex + 1}-p${productIndex + 1}`,
          finalSmiles: pathway.productSmiles,
          steps: [
            ...branch.steps,
            {
              stepNumber: stepIndex + 1,
              ruleId: rule.id,
              title: pathway.title,
              reagentLabel: pathway.reagentLabel,
              reagentNote: pathway.reagentNote,
              reactantSmiles,
              productSmiles: pathway.productSmiles,
              productLabel:
                pathway.productMixture?.displayName ?? pathway.productLabel,
              status: "reaction",
              explanation: pathway.shortExplanation,
              noReaction: null,
            },
          ],
        });
      }
    }

    const deduped = new Map<string, SequentialSynthesisBranch>();
    for (const branch of nextBranches) {
      const key = `${branch.finalSmiles}::${branch.steps
        .map((step) => `${step.ruleId}:${step.status}`)
        .join("|")}`;
      if (!deduped.has(key)) deduped.set(key, branch);
    }

    branches = [...deduped.values()].slice(0, branchLimit);
    if (branches.length === 0) break;
  }

  return branches.map((branch, index) => ({
    ...branch,
    id: `sequence-${index + 1}`,
  }));
}
