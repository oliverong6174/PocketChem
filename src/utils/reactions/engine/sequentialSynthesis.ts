import type { ReactionRule } from "../reactionTypes";
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

function executableWithoutStructuralCoreactant(rule: ReactionRule): boolean {
  return (
    (rule.additionalReactants?.length ?? 0) === 0 &&
    rule.transform.type !== "conceptOnly"
  );
}

export function getSequentialConditionOptions(
  rules: ReactionRule[],
): SequentialConditionOption[] {
  return rules
    .filter(executableWithoutStructuralCoreactant)
    .map((rule) => ({
      ruleId: rule.id,
      title: rule.title,
      reagents: rule.reagents,
      reagentNote: rule.reagentNote,
      family: rule.family,
      priority: rule.priority,
      searchText: `${rule.title} ${rule.reagents} ${rule.reagentNote} ${rule.family}`.toLowerCase(),
    }))
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
    if (!rule || !executableWithoutStructuralCoreactant(rule)) continue;

    const nextBranches: SequentialSynthesisBranch[] = [];

    for (const branch of branches) {
      const reactantSmiles = branch.finalSmiles;
      const pathways = uniqueProducts(
        await predictReactionPathwaysFromRules(reactantSmiles, [], [rule]),
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
