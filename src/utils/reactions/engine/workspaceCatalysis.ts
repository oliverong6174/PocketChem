import type { ReactionRule } from "../reactionTypes";
import {
  assessCombination,
  describeRuleRoles,
  type ChemicalRole,
  type CombinationAssessment,
  type StepRoleProfile,
} from "./catalystRoles";
import type { ReactionWorkspace } from "./reactionWorkspace";

/**
 * Catalyst and condition summary for the completed steps of a workspace (Stage 9B-3).
 *
 * Every step of a workspace runs on isolated compounds, one after another. That is sequential
 * (and, when branches join, convergent) synthesis. Catalysts of different steps are never
 * present together, so this summary does not claim a one-pot tandem process or cooperative
 * catalysis, and it does not ask whether two successive catalysts are compatible with each
 * other. The pairwise assessments below answer a different question, only when someone wants to
 * combine two steps: could the declared conditions share a pot?
 */

export type StepCatalysis = {
  stepNumber: number;
  ruleId: string;
  title: string;
  profile: StepRoleProfile;
  catalysts: ChemicalRole[];
};

export type CatalysisAssessment = {
  /** Always "sequential-isolated": the workspace never models simultaneous catalysts. */
  mode: "sequential-isolated";
  modeStatement: string;
  steps: StepCatalysis[];
  /** Steps whose rule names or types at least one catalyst. */
  catalyticStepNumbers: number[];
  /** Distinct catalyst systems, each a sorted list of catalyst names used together in one step. */
  distinctCatalystSystems: string[];
  /** Steps whose reagent text was not assessed, so "no catalyst" is not established for them. */
  unassessedStepNumbers: number[];
  /** Steps whose catalyst is described only by type ("Pd catalyst", "acid"). */
  genericCatalystStepNumbers: number[];
  /** Pairs of completed steps, only where at least one is catalytic. Never implies co-presence. */
  combinations: Array<CombinationAssessment & { stepNumbers: [number, number] }>;
  claims: { tandem: false; cooperative: false };
};

export const SEQUENTIAL_ISOLATED_STATEMENT =
  "Each step runs on isolated compounds, one after another. Catalysts of different steps are never present together, so this is sequential (and, where branches join, convergent) synthesis. It does not show, and PocketChem does not claim, a one-pot tandem process or cooperative catalysis.";

export function assessWorkspaceCatalysis(workspace: ReactionWorkspace, rules: ReactionRule[]): CatalysisAssessment {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const steps: StepCatalysis[] = [];
  for (const record of workspace.records) {
    const rule = byId.get(record.step.ruleId);
    // The profile stored with the step at execution time wins, so a restored workspace is described as saved.
    const stored = workspace.history.find((item) => item.committedStep === record.step.stepNumber)?.roles;
    const profile = stored ?? (rule ? describeRuleRoles(rule) : undefined);
    if (!profile) continue;
    steps.push({
      stepNumber: record.step.stepNumber,
      ruleId: record.step.ruleId,
      title: record.step.title,
      profile,
      catalysts: profile.roles.filter((role) => role.kind === "catalyst" || role.kind === "co-catalyst"),
    });
  }

  const catalytic = steps.filter((step) => step.catalysts.length > 0);
  const systems = new Set(
    catalytic.map((step) => step.catalysts.map((role) => role.name).sort().join(" + ")),
  );
  const combinations: CatalysisAssessment["combinations"] = [];
  for (let left = 0; left < steps.length; left += 1) {
    for (let right = left + 1; right < steps.length; right += 1) {
      const a = steps[left];
      const b = steps[right];
      if (a.catalysts.length === 0 && b.catalysts.length === 0) continue;
      const ruleA = byId.get(a.ruleId);
      const ruleB = byId.get(b.ruleId);
      if (!ruleA || !ruleB) continue;
      combinations.push({ ...assessCombination(ruleA, ruleB), stepNumbers: [a.stepNumber, b.stepNumber] });
    }
  }
  return {
    mode: "sequential-isolated",
    modeStatement: SEQUENTIAL_ISOLATED_STATEMENT,
    steps,
    catalyticStepNumbers: catalytic.map((step) => step.stepNumber),
    distinctCatalystSystems: [...systems].sort(),
    unassessedStepNumbers: steps.filter((step) => !step.profile.structured).map((step) => step.stepNumber),
    genericCatalystStepNumbers: steps.filter((step) => step.profile.catalystIdentity === "generic").map((step) => step.stepNumber),
    combinations,
    claims: { tandem: false, cooperative: false },
  };
}
