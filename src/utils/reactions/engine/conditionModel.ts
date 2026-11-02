import { declaredIntolerances, type DeclaredIntolerance } from "./compatibility";
import { describeRuleRoles, type ChemicalRole, type StepRoleProfile } from "./catalystRoles";
import type { ReactionRule } from "../reactionTypes";

/**
 * Reaction conditions as far as the registry supports them (Stage 9C).
 *
 * Three separate questions, never mixed:
 *
 *  1. What does THIS reaction need? Temperature, light, pressure, medium, atmosphere, workup.
 *     Only what the rule's own conditions or reagent text state: each curated entry below must
 *     appear literally in that text (a test enforces it). Everything else is "not stated".
 *  2. What can THIS reaction not coexist with in one vessel? Derived from the rule's declared
 *     RuleConditions (a strong base or carbanion is quenched by acidic groups, and so on).
 *  3. Are two reactions compatible? Only if someone proposes sharing a vessel (see
 *     catalystRoles.assessCombination). For successive steps the answer is the isolation boundary:
 *     each step's product is isolated before the next step, so one step's acid, base, catalyst,
 *     solvent or workup is not assumed to be present in the next.
 *
 * No loading, yield, poisoning, kinetics or solvent effect is modeled.
 */

export type ConditionDimension = "temperature" | "light" | "pressure" | "medium";

export type DeclaredCondition = {
  dimension: ConditionDimension;
  value: string;
  source: "registry-text" | "rule-conditions";
  /** Literal text in the rule's reagents / reagentNote that states it (registry-text). */
  evidenceText?: string;
};

type CuratedCondition = DeclaredCondition & { source: "registry-text"; evidenceText: string };

const CURATED_CONDITIONS: Record<string, CuratedCondition[]> = {
  "ester-dibal-reduction": [{ dimension: "temperature", value: "−78 °C", source: "registry-text", evidenceText: "−78 °C" }],
  "nitrile-dibal-aldehyde": [{ dimension: "temperature", value: "−78 °C", source: "registry-text", evidenceText: "−78 °C" }],
  "amine-diazotization": [{ dimension: "temperature", value: "0 °C", source: "registry-text", evidenceText: "0°C" }],
  "alcohol-dehydration-ether": [{ dimension: "temperature", value: "about 130–140 °C", source: "registry-text", evidenceText: "130–140 °C" }],
  "alkane-radical-bromination": [{ dimension: "light", value: "light (hν) or heat (Δ)", source: "registry-text", evidenceText: "hν" }],
  "alkane-radical-chlorination": [{ dimension: "light", value: "light (hν) or heat (Δ)", source: "registry-text", evidenceText: "hν" }],
  "alkene-photochemical-2plus2": [{ dimension: "light", value: "UV light", source: "registry-text", evidenceText: "UV light" }],
  "alkene-alkyne-photochemical-2plus2": [{ dimension: "light", value: "UV light", source: "registry-text", evidenceText: "UV light" }],
  "aromatic-catalytic-hydrogenation": [{ dimension: "pressure", value: "high pressure", source: "registry-text", evidenceText: "high pressure" }],
  "haloalkane-grignard-formation-bromide": [{ dimension: "medium", value: "dry ether", source: "registry-text", evidenceText: "dry ether" }],
  "haloalkane-grignard-formation-chloride": [{ dimension: "medium", value: "dry ether", source: "registry-text", evidenceText: "dry ether" }],
  "haloalkane-grignard-formation-iodide": [{ dimension: "medium", value: "dry ether", source: "registry-text", evidenceText: "dry ether" }],
};

export const CURATED_CONDITION_RULE_IDS: readonly string[] = Object.keys(CURATED_CONDITIONS);

export function curatedConditionsFor(ruleId: string): readonly CuratedCondition[] | undefined {
  return CURATED_CONDITIONS[ruleId];
}

/** Where a step's conditions stop applying. Every workspace step is isolated. */
export type IsolationBoundary = {
  kind: "isolated-step";
  statement: string;
};

export const ISOLATED_STEP_BOUNDARY: IsolationBoundary = {
  kind: "isolated-step",
  statement:
    "The product of this step is isolated before the next step runs. This step's reagents, catalyst, solvent, acid or base, and workup are not assumed to be present in any later step, so differing conditions across steps (an acid-catalyzed step followed by a base-mediated one) are not a conflict.",
};

export type StepConditionProfile = {
  ruleId: string;
  reagentText: string;
  /** Temperature, light, pressure and medium that the registry states for this reaction. */
  declared: DeclaredCondition[];
  /** True when the rule declares machine-readable RuleConditions. */
  declaresRuleConditions: boolean;
  /** Dry/anhydrous requirement from RuleConditions. */
  anhydrous: boolean;
  /** Workup reagents the rule's own text lists after the reaction (part of this step, not of the next). */
  workup: ChemicalRole[];
  /** Inside one vessel only. Null = the rule declares no conditions (unassessed). */
  intolerances: DeclaredIntolerance[] | null;
  /** What was NOT established for this reaction. */
  notStated: string[];
  isolation: IsolationBoundary;
};

export function describeStepConditions(rule: ReactionRule, roles: StepRoleProfile = describeRuleRoles(rule)): StepConditionProfile {
  const declared: DeclaredCondition[] = [...(CURATED_CONDITIONS[rule.id] ?? [])];
  if (rule.conditions?.anhydrous) {
    declared.push({ dimension: "medium", value: "water and protic groups not tolerated", source: "rule-conditions" });
  }
  const dimensions = new Set(declared.map((item) => item.dimension));
  const notStated = (["temperature", "light", "pressure", "medium"] as ConditionDimension[])
    .filter((dimension) => !dimensions.has(dimension))
    .map((dimension) => dimension);
  return {
    ruleId: rule.id,
    reagentText: rule.reagents,
    declared,
    declaresRuleConditions: Boolean(rule.conditions),
    anhydrous: Boolean(rule.conditions?.anhydrous),
    workup: roles.roles.filter((role) => role.kind === "workup-reagent"),
    intolerances: declaredIntolerances(rule),
    notStated,
    isolation: ISOLATED_STEP_BOUNDARY,
  };
}

export const DIMENSION_LABEL: Record<ConditionDimension, string> = {
  temperature: "Temperature",
  light: "Light",
  pressure: "Pressure",
  medium: "Medium",
};
