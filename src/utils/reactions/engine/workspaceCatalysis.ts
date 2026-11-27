import type { ReactionRule } from "../reactionTypes";
import {
  assessCombination,
  describeRuleRoles,
  type ChemicalRole,
  type CombinationAssessment,
  type CombinationCategory,
  type StepRoleProfile,
} from "./catalystRoles";
import { ISOLATED_STEP_BOUNDARY, type IsolationBoundary } from "./conditionModel";
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
  /**
   * Where one step's product feeds another step. Each boundary is an isolation: the conditions of the
   * two steps never share a vessel as run here. `ifCombined` is the answer to a different question
   * (could the two reactions share a pot?) and is shown so that a contrast, for example an acid-catalyzed
   * step before a base-mediated one, is understood as "needs isolation between", not as a conflict.
   */
  boundaries: Array<{
    from: number;
    to: number;
    asRun: "isolated";
    isolation: IsolationBoundary;
    ifCombined: CombinationCategory;
    reasons: string[];
    /** True when the reactions could NOT share a vessel, so the isolation between them is required. */
    isolationRequired: boolean;
  }>;
  /** Steps the user declared to share one vessel (telescoped). Only these are judged as one-pot. */
  vessels: Array<{
    stepNumbers: number[];
    pairs: Array<CombinationAssessment & { stepNumbers: [number, number] }>;
    documentedConflicts: number;
  }>;
  claims: { tandem: false; cooperative: false };
};

export type CatalysisOptions = {
  /** Groups of committed step numbers the user declares to run in one vessel. */
  sharedVessels?: number[][];
};

export const SEQUENTIAL_ISOLATED_STATEMENT =
  "Each step runs on isolated compounds, one after another. Catalysts of different steps are never present together, so this is sequential (and, where branches join, convergent) synthesis. It does not show, and PocketChem does not claim, a one-pot tandem process or cooperative catalysis.";

export function assessWorkspaceCatalysis(
  workspace: ReactionWorkspace,
  rules: ReactionRule[],
  options: CatalysisOptions = {},
): CatalysisAssessment {
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
  // Boundaries: producer step -> consumer step, from the recorded lot provenance.
  const boundaries: CatalysisAssessment["boundaries"] = [];
  const seenEdges = new Set<string>();
  for (const poolStep of workspace.pool.steps) {
    for (const lotId of poolStep.consumedLotIds) {
      const lot = workspace.pool.lots.find((item) => item.id === lotId);
      if (!lot || lot.provenance.kind !== "product") continue;
      const edge = `${lot.provenance.step}>${poolStep.stepNumber}`;
      if (seenEdges.has(edge)) continue;
      seenEdges.add(edge);
      const ruleA = byId.get(workspace.pool.steps[lot.provenance.step - 1]?.ruleId ?? "");
      const ruleB = byId.get(poolStep.ruleId);
      if (!ruleA || !ruleB) continue;
      const combined = assessCombination(ruleA, ruleB);
      boundaries.push({
        from: lot.provenance.step,
        to: poolStep.stepNumber,
        asRun: "isolated",
        isolation: ISOLATED_STEP_BOUNDARY,
        ifCombined: combined.category,
        reasons: combined.reasons,
        isolationRequired: combined.category === "documented-conflict",
      });
    }
  }

  const vessels: CatalysisAssessment["vessels"] = [];
  for (const group of options.sharedVessels ?? []) {
    const numbers = [...new Set(group)].sort((a, b) => a - b).filter((number) => workspace.records.some((record) => record.step.stepNumber === number));
    const pairs: CatalysisAssessment["vessels"][number]["pairs"] = [];
    for (let left = 0; left < numbers.length; left += 1) {
      for (let right = left + 1; right < numbers.length; right += 1) {
        const ruleA = byId.get(workspace.pool.steps[numbers[left] - 1]?.ruleId ?? "");
        const ruleB = byId.get(workspace.pool.steps[numbers[right] - 1]?.ruleId ?? "");
        if (ruleA && ruleB) pairs.push({ ...assessCombination(ruleA, ruleB), stepNumbers: [numbers[left], numbers[right]] });
      }
    }
    vessels.push({ stepNumbers: numbers, pairs, documentedConflicts: pairs.filter((pair) => pair.category === "documented-conflict").length });
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
    boundaries,
    vessels,
    claims: { tandem: false, cooperative: false },
  };
}
