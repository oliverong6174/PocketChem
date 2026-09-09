import type {
  ReactionDisplayMetadata,
  ReactionReactantRequirement,
  ReactionRule,
} from "../reactionTypes";
import { resolveReactantRequirement } from "../profiles/reactants";
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

export type SequentialSynthesisStepStatus =
  | "reaction"
  | "no-reaction"
  | "needs-input"
  | "unsupported";

export type SequentialSynthesisStep = {
  stepNumber: number;
  ruleId: string;
  title: string;
  reagentLabel: string;
  reagentNote: string;
  reactantSmiles: string;
  productSmiles: string;
  productLabel: string;
  status: SequentialSynthesisStepStatus;
  explanation: string;
  noReaction: NoReactionOutcome | null;
  display: ReactionDisplayMetadata | null;
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

type AdditionalReactantInfo = {
  requirements: ReactionReactantRequirement[];
  labels: string[];
  autoSupplied: string[];
  unresolved: string[];
  presetSmiles: string[];
  searchAliases: string[];
};

function additionalReactantInfo(rule: ReactionRule): AdditionalReactantInfo {
  const requirements = (rule.additionalReactants ?? []).map(resolveReactantRequirement);
  const autoSupplied: string[] = [];
  const unresolved: string[] = [];
  const presetSmiles: string[] = [];
  const searchAliases = new Set<string>();

  for (const requirement of requirements) {
    searchAliases.add(requirement.id ?? "");
    for (const alias of requirement.searchAliases ?? []) searchAliases.add(alias);

    if (requirement.supplyMode === "condition-only") continue;

    if (requirement.supplyMode === "auto" && requirement.presetSmiles) {
      autoSupplied.push(requirement.label);
      const equivalents = Math.max(1, Math.floor(requirement.equivalents ?? 1));
      for (let copy = 0; copy < equivalents; copy += 1) {
        presetSmiles.push(requirement.presetSmiles);
      }
      continue;
    }

    unresolved.push(requirement.label);
  }

  return {
    requirements,
    labels: requirements.map((requirement) => requirement.label),
    autoSupplied,
    unresolved,
    presetSmiles,
    searchAliases: [...searchAliases].filter(Boolean),
  };
}

/**
 * The selector exposes the complete registry. Search aliases come from stable
 * rule/reactant metadata, so changing display labels cannot silently change
 * which condition the multicatalytic page finds or auto-supplies.
 */
export function getSequentialConditionOptions(
  rules: ReactionRule[],
): SequentialConditionOption[] {
  return rules
    .map((rule) => {
      const reactantInfo = additionalReactantInfo(rule);
      const searchParts = [
        rule.title,
        rule.reagents,
        rule.reagentNote,
        rule.family,
        ...(rule.searchAliases ?? []),
        ...reactantInfo.labels,
        ...reactantInfo.searchAliases,
      ];

      return {
        ruleId: rule.id,
        title: rule.title,
        reagents: rule.reagents,
        reagentNote: rule.reagentNote,
        family: rule.family,
        priority: rule.priority,
        additionalReactantLabels: reactantInfo.labels,
        autoSuppliedReactantLabels: reactantInfo.autoSupplied,
        requiresStructuralReactantInput: reactantInfo.unresolved.length > 0,
        searchText: searchParts.join(" ").toLowerCase(),
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

function appendNonReactionStep(
  branch: SequentialSynthesisBranch,
  stepIndex: number,
  rule: ReactionRule,
  status: Exclude<SequentialSynthesisStepStatus, "reaction">,
  explanation: string,
  productLabel: string,
  noReaction: NoReactionOutcome | null,
): SequentialSynthesisBranch {
  const reactantSmiles = branch.finalSmiles;
  return {
    ...branch,
    id: `${branch.id}-s${stepIndex + 1}-${status}`,
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
        productLabel,
        status,
        explanation,
        noReaction,
        display: rule.display ?? null,
      },
    ],
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
        nextBranches.push(
          appendNonReactionStep(
            branch,
            stepIndex,
            rule,
            "unsupported",
            rule.transform.reason,
            "PRODUCT NOT STRUCTURALLY COMPUTED",
            null,
          ),
        );
        continue;
      }

      if (reactantInfo.unresolved.length > 0) {
        const labels = reactantInfo.unresolved.join(", ");
        nextBranches.push(
          appendNonReactionStep(
            branch,
            stepIndex,
            rule,
            "needs-input",
            `This reaction needs an additional structural reactant (${labels}). PocketChem will not invent that structure from a reagent name.`,
            "ADDITIONAL REACTANT REQUIRED",
            null,
          ),
        );
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
        nextBranches.push(
          appendNonReactionStep(
            branch,
            stepIndex,
            rule,
            "no-reaction",
            noReaction.explanation,
            "NO REACTION",
            noReaction,
          ),
        );
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
              display: pathway.display,
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
