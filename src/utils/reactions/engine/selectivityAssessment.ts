/**
 * Advisory product-selectivity assessment for a verified route (Stage 9B-1).
 *
 * Structural replay says a step's product follows from its reactants. It does not say the
 * rule's outcome is the one that dominates in practice. This module records, per step and
 * from information the engine already has, whether the outcome is supported as major,
 * documented as disfavored, one of several unranked outcomes, or unassessed. It invents no
 * probabilities and no yields: the only numeric input is a rule's own selectivityAssessment.
 * Like compatibility, it is advisory and never changes whether replay passed.
 */
import type {
  MultistepSynthesisRoute,
  ReactionRule,
  ReactionSelectivityAssessment,
  RouteSelectivity,
  StepSelectivityClass,
  StepSelectivityFinding,
  SynthesisStep,
} from "../reactionTypes";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { canonicalizeStereoStructure } from "./stereochemistry";

const CLASSES: StepSelectivityClass[] = ["major", "single-outcome", "disfavored", "unranked", "unassessed"];

export function emptySelectivityCounts(): Record<StepSelectivityClass, number> {
  return Object.fromEntries(CLASSES.map((name) => [name, 0])) as Record<StepSelectivityClass, number>;
}

async function connectivityOf(smiles: string): Promise<string | null> {
  try {
    return (await canonicalizeStereoStructure(smiles))?.connectivity ?? null;
  } catch {
    return null;
  }
}

const outcomeCache = new Map<string, Promise<string[] | null>>();

/** Distinct constitutional product outcomes the rule offers for these exact reactants. */
function constitutionalOutcomes(rule: ReactionRule, reactantSmiles: string): Promise<string[] | null> {
  const key = `${rule.id}::${reactantSmiles}`;
  let pending = outcomeCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const pathways = await predictReactionPathwaysFromRules(reactantSmiles, [], [rule], { planning: true });
        const keys = new Set<string>();
        for (const pathway of pathways) {
          if (!pathway.productSmiles) continue;
          const connectivity = await connectivityOf(pathway.productSmiles);
          if (connectivity) keys.add(connectivity);
        }
        return [...keys];
      } catch {
        return null;
      }
    })();
    if (outcomeCache.size > 500) outcomeCache.clear();
    outcomeCache.set(key, pending);
  }
  return pending;
}

/**
 * Classifies one step from its rule's own numeric estimate and the number of distinct
 * constitutional outcomes the engine offered. `alternatives` is null when the outcomes could
 * not be reproduced (unassessed). Shared by route assessment and the reaction workspace.
 */
export function classifyStepSelectivity(args: {
  stepNumber: number;
  ruleId: string;
  rule: ReactionRule | undefined;
  dynamic: ReactionSelectivityAssessment | null | undefined;
  limitations?: string[];
  alternatives: number | null;
}): StepSelectivityFinding {
  const { rule, dynamic, alternatives } = args;
  const base = {
    stepNumber: args.stepNumber,
    ruleId: args.ruleId,
    representative: rule?.productStatus === "representative",
    limitations: [...(rule?.limitations ?? args.limitations ?? [])],
  };
  if (dynamic && (dynamic.level === "minor" || dynamic.level === "trace")) {
    return { ...base, class: "disfavored", alternatives: null, basis: `${dynamic.label}. ${dynamic.basis}` };
  }
  if (dynamic && dynamic.level === "major") {
    return { ...base, class: "major", alternatives: null, basis: `${dynamic.label}. ${dynamic.basis}` };
  }
  if (!rule) return { ...base, class: "unassessed", alternatives: null, basis: "The reaction rule is not in the registry." };
  if (alternatives === null) {
    return { ...base, class: "unassessed", alternatives: null, basis: "The step's outcomes could not be reproduced for comparison." };
  }
  if (alternatives === 1) {
    return {
      ...base,
      class: "single-outcome",
      alternatives: 1,
      basis: "The engine offers one constitutional outcome for these reactants; it was not ranked against alternatives.",
    };
  }
  const competitive = dynamic?.level === "competitive" ? ` Estimated as competitive (${dynamic.label}).` : "";
  return {
    ...base,
    class: "unranked",
    alternatives,
    basis: `The engine offers ${alternatives} constitutional outcomes for these reactants and does not rank them; this route uses one of them.${competitive}`,
  };
}

export async function assessStepSelectivity(
  step: SynthesisStep,
  rule: ReactionRule | undefined,
): Promise<StepSelectivityFinding> {
  const dynamic = step.selectivityAssessment;
  const decided = dynamic && (dynamic.level === "minor" || dynamic.level === "trace" || dynamic.level === "major");
  let alternatives: number | null = null;
  if (rule && !decided) {
    const outcomes = await constitutionalOutcomes(rule, step.reactantSmiles);
    const own = await connectivityOf(step.productSmiles);
    alternatives = outcomes && own && outcomes.includes(own) ? outcomes.length : null;
  }
  return classifyStepSelectivity({
    stepNumber: step.stepNumber,
    ruleId: step.ruleId,
    rule,
    dynamic,
    limitations: step.limitations,
    alternatives,
  });
}

export async function assessRouteSelectivity(
  route: MultistepSynthesisRoute,
  rules: ReactionRule[],
): Promise<RouteSelectivity> {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const findings: StepSelectivityFinding[] = [];
  const counts = emptySelectivityCounts();
  for (const step of route.steps) {
    const finding = await assessStepSelectivity(step, byId.get(step.ruleId));
    findings.push(finding);
    counts[finding.class] += 1;
  }
  return { findings, counts };
}

/** Steps whose outcome is not established as the one that dominates. Unassessed is not counted here. */
export function selectivityConcerns(summary: RouteSelectivity | undefined): { disfavored: number; unranked: number } {
  return { disfavored: summary?.counts.disfavored ?? 0, unranked: summary?.counts.unranked ?? 0 };
}
