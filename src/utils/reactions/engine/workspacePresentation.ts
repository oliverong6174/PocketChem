import type { StepSelectivityClass } from "../reactionTypes";
import { COMBINATION_LABEL, type ChemicalRole, type ChemicalRoleKind, type StepRoleProfile } from "./catalystRoles";
import { DIMENSION_LABEL, type StepConditionProfile } from "./conditionModel";
import type { CatalysisAssessment } from "./workspaceCatalysis";
import type { PoolLot } from "./speciesPool";
import type { ReactionWorkspace, WorkspaceOutcome, WorkspaceStep, WorkspaceStepStatus } from "./reactionWorkspace";

/**
 * Wording and small decisions for the Multi-Catalytic workspace UI, kept free of React and
 * RDKit so they can be tested. Nothing here changes chemistry; it only decides how engine
 * results are described, and it never promotes an unranked or unassessed result to "major".
 */

export const STEP_STATUS_CHIP: Record<WorkspaceStepStatus, string> = {
  reaction: "Reaction",
  "needs-selection": "CHOOSE AN OUTCOME",
  "needs-input": "NEEDS INPUT",
  "no-reaction": "NO REACTION",
  unsupported: "UNSUPPORTED",
  "unknown-rule": "UNKNOWN CONDITION",
  "execution-error": "EVALUATION FAILED",
  "invalid-selection": "SELECTION NOT USABLE",
  "dependency-failed": "NOT RUN",
};

export const STEP_STATUS_HEADING: Record<Exclude<WorkspaceStepStatus, "reaction">, string> = {
  "needs-selection": "SEVERAL OUTCOMES OFFERED — NOTHING WAS CONSUMED",
  "needs-input": "ADDITIONAL STRUCTURE REQUIRED — NOTHING WAS CONSUMED",
  "no-reaction": "NO REACTION — NOTHING WAS CONSUMED",
  unsupported: "STRUCTURAL PRODUCT NOT SUPPORTED — NOTHING WAS CONSUMED",
  "unknown-rule": "CONDITION NOT IN REGISTRY — NOTHING WAS CONSUMED",
  "execution-error": "INTERNAL ENGINE ERROR (NOT A CHEMICAL PREDICTION) — NOTHING WAS CONSUMED",
  "invalid-selection": "SELECTION NOT USABLE — NOTHING WAS CONSUMED",
  "dependency-failed": "NOT RUN — A REQUIRED INTERMEDIATE WAS NOT PRODUCED",
};

/** A step that did not produce a product. */
export function isUnresolvedStep(step: Pick<WorkspaceStep, "status">): boolean {
  return step.status !== "reaction";
}

/** Short name of a lot for lists and history lines. */
export function lotLabel(lot: Pick<PoolLot, "provenance" | "role">): string {
  if (lot.provenance.kind === "supplied") {
    return lot.provenance.copy > 1
      ? `Starting molecule ${lot.provenance.startIndex + 1} (copy ${lot.provenance.copy})`
      : `Starting molecule ${lot.provenance.startIndex + 1}`;
  }
  return `Step ${lot.provenance.step} ${lot.role === "coproduct" ? "coproduct" : "product"}`;
}

/** Label for an id that may no longer be (or never was) on the shelf. */
export function lotLabelById(workspace: ReactionWorkspace, id: string): string {
  const lot = workspace.pool.lots.find((item) => item.id === id);
  return lot ? `${lotLabel(lot)} (${id})` : id;
}

const SELECTIVITY_TEXT: Record<StepSelectivityClass, string> = {
  major: "Estimated major product (the rule's own numeric estimate)",
  "single-outcome": "The only outcome the engine offered — not ranked against alternatives",
  disfavored: "Estimated minor or trace product (the rule's own numeric estimate)",
  unranked: "One of several outcomes the engine does not rank",
  unassessed: "Selectivity not assessed",
};

export function selectivityText(selectivityClass: StepSelectivityClass): string {
  return SELECTIVITY_TEXT[selectivityClass];
}

/** True when this class should be shown as a caution rather than as neutral information. */
export function selectivityIsCaution(selectivityClass: StepSelectivityClass): boolean {
  return selectivityClass === "disfavored" || selectivityClass === "unranked" || selectivityClass === "unassessed";
}

export function outcomeSummary(outcome: WorkspaceOutcome): string {
  const parts = [outcome.productLabel || outcome.productSmiles];
  if (outcome.selectivity) parts.push(outcome.selectivity.label);
  if (outcome.mixture) parts.push(`${outcome.mixture.kind} mixture member`);
  if (outcome.productStatus !== "computed") parts.push(`product ${outcome.productStatus}`);
  return parts.join(" · ");
}

export type VerificationWording = {
  headline: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
};

/**
 * Structure replay only. The wording is deliberately narrow: replay shows the steps follow
 * from PocketChem's own rules, not that the chemistry works in a flask.
 */
export function verificationWording(status: "verified" | "connectivity-only" | "failed"): VerificationWording {
  if (status === "verified") {
    return {
      tone: "ok",
      headline: "Structure replay passed",
      detail:
        "Every step was reproduced from the molecules that existed at that point using PocketChem's own reaction rules, including stereochemistry. This is not experimental validation.",
    };
  }
  if (status === "connectivity-only") {
    return {
      tone: "warn",
      headline: "Structure replay passed on connectivity only",
      detail:
        "The steps reproduce the same constitution, but at least one stereochemical or mixture-member match was not exact. This is not experimental validation.",
    };
  }
  return {
    tone: "bad",
    headline: "Structure replay failed",
    detail: "At least one step could not be reproduced from the molecules that existed at that point.",
  };
}

/** Plain-language count line for the advisory selectivity assessment. */
export function selectivityCountsLine(counts: Record<StepSelectivityClass, number>): string {
  const parts: string[] = [];
  if (counts.major) parts.push(`${counts.major} estimated major`);
  if (counts["single-outcome"]) parts.push(`${counts["single-outcome"]} single outcome (unranked)`);
  if (counts.disfavored) parts.push(`${counts.disfavored} estimated minor`);
  if (counts.unranked) parts.push(`${counts.unranked} one of several unranked outcomes`);
  if (counts.unassessed) parts.push(`${counts.unassessed} unassessed`);
  return parts.length > 0 ? parts.join(", ") : "no steps";
}

/**
 * Inventory grouped for display: live molecules first, then everything that was used up, in
 * the order it was created.
 */
export function inventoryGroups(workspace: ReactionWorkspace): { live: PoolLot[]; consumed: PoolLot[] } {
  return {
    live: workspace.pool.lots.filter((lot) => lot.availability === "live"),
    consumed: workspace.pool.lots.filter((lot) => lot.availability === "consumed"),
  };
}

/** Which steps consumed a lot and which produced it, for the "where did this come from" line. */
export function lotOrigin(workspace: ReactionWorkspace, lot: PoolLot): string {
  if (lot.provenance.kind === "supplied") return "Supplied starting material";
  const parents = lot.provenance.consumedLotIds.map((id) => lotLabelById(workspace, id));
  return `Made in step ${lot.provenance.step} (${lot.provenance.ruleId}) from ${parents.join(" + ")}`;
}

/** The pending "choose an outcome" attempt, if the latest attempt stopped for a choice. */
export function pendingSelection(workspace: ReactionWorkspace): WorkspaceStep | null {
  const last = workspace.history[workspace.history.length - 1];
  return last && last.status === "needs-selection" ? last : null;
}

const ROLE_KIND_LABEL: Record<ChemicalRoleKind, string> = {
  "structural-reactant": "Inventory molecule",
  "stoichiometric-reagent": "Consumed reagent",
  reagent: "Reagent (amount not modeled)",
  catalyst: "Catalyst",
  "co-catalyst": "Co-catalyst",
  solvent: "Solvent",
  "reaction-condition": "Condition",
  "workup-reagent": "Workup reagent",
};

export function roleKindLabel(kind: ChemicalRoleKind): string {
  return ROLE_KIND_LABEL[kind];
}

export function roleText(role: ChemicalRole): string {
  const parts = [role.name];
  if (role.kind === "catalyst" || role.kind === "co-catalyst") {
    parts.push(role.identity === "named" ? "(identified)" : "(type only; species not identified)");
  }
  if (role.alternativeGroup) parts.push("— one of the listed alternatives");
  if (role.conditional) parts.push("— only where applicable");
  return parts.join(" ");
}

/** Lines for a step's "Catalysts and reagents" block. Always starts from the rule's own text. */
export function roleLines(profile: StepRoleProfile | undefined): { heading: string; lines: Array<{ label: string; text: string; note?: string }> } {
  if (!profile) {
    return { heading: "Catalyst and reagent roles were not recorded for this step (saved before roles existed); they are unassessed.", lines: [] };
  }
  const lines = profile.roles.map((role) => ({ label: roleKindLabel(role.kind), text: roleText(role), note: role.note }));
  if (!profile.structured) {
    return {
      heading: `Reagent text as written: “${profile.reagentText}”. No catalyst or reagent roles are asserted for this condition (unassessed); that does not mean it uses none.`,
      lines,
    };
  }
  const identity =
    profile.catalystIdentity === "named" ? "Catalyst identified by name."
    : profile.catalystIdentity === "generic" ? "A catalyst is required but only its type is given."
    : "The rule declares no catalyst.";
  return { heading: `Reagent text as written: “${profile.reagentText}”. ${identity}`, lines };
}

export function combinationLabel(category: keyof typeof COMBINATION_LABEL): string {
  return COMBINATION_LABEL[category];
}

/** Summary lines for the catalysis assessment; never mentions tandem or cooperative catalysis as achieved. */
export function catalysisSummaryLines(assessment: CatalysisAssessment): string[] {
  const lines = [assessment.modeStatement];
  const catalytic = assessment.catalyticStepNumbers.length;
  if (catalytic === 0) {
    lines.push("No completed step has a catalyst declared in the registry.");
  } else {
    lines.push(
      `${catalytic} completed step${catalytic === 1 ? " uses" : "s use"} a catalyst declared in the registry; ${assessment.distinctCatalystSystems.length} distinct catalyst system${assessment.distinctCatalystSystems.length === 1 ? "" : "s"}: ${assessment.distinctCatalystSystems.join("; ")}.`,
    );
  }
  if (assessment.genericCatalystStepNumbers.length > 0) {
    lines.push(`Step${assessment.genericCatalystStepNumbers.length === 1 ? "" : "s"} ${assessment.genericCatalystStepNumbers.join(", ")}: the catalyst is named only by type, so which species is used is not established.`);
  }
  const required = assessment.boundaries.filter((boundary) => boundary.isolationRequired);
  for (const boundary of required) {
    lines.push(
      `Steps ${boundary.from} → ${boundary.to}: these reactions could not share a vessel (${boundary.reasons.join(" ")}). They did not: the product of step ${boundary.from} is isolated before step ${boundary.to}, so this is not a conflict here, but it is why that isolation is needed.`,
    );
  }
  for (const vessel of assessment.vessels) {
    lines.push(
      vessel.documentedConflicts > 0
        ? `Steps ${vessel.stepNumbers.join(", ")} were declared to share one vessel and ${vessel.documentedConflicts === 1 ? "1 pair has" : `${vessel.documentedConflicts} pairs have`} a documented conflict of declared conditions.`
        : `Steps ${vessel.stepNumbers.join(", ")} were declared to share one vessel; no documented conflict was found among the declared conditions, which is not evidence that the one-pot sequence works.`,
    );
  }
  if (assessment.unassessedStepNumbers.length > 0) {
    lines.push(`Step${assessment.unassessedStepNumbers.length === 1 ? "" : "s"} ${assessment.unassessedStepNumbers.join(", ")}: catalyst and reagent roles are unassessed.`);
  }
  return lines;
}

/** Lines for a step's "Conditions" block: what the registry states, what it does not, and the isolation boundary. */
export function conditionLines(profile: StepConditionProfile | undefined): { heading: string; lines: string[] } {
  if (!profile) {
    return { heading: "Conditions were not recorded for this step (saved before conditions were modeled); they are unassessed.", lines: [] };
  }
  const lines: string[] = [];
  for (const item of profile.declared) {
    lines.push(`${DIMENSION_LABEL[item.dimension]}: ${item.value}${item.source === "rule-conditions" ? " (declared by the rule)" : ""}`);
  }
  for (const role of profile.workup) lines.push(`Workup: ${role.name} (part of this step, not of the next)`);
  if (profile.intolerances === null) {
    lines.push("In one vessel: the rule declares no conditions, so what it cannot coexist with is unassessed (not the same as tolerant).");
  } else if (profile.intolerances.length === 0) {
    lines.push("In one vessel: no incompatibility follows from the declared conditions.");
  } else {
    lines.push(
      `In one vessel it could not coexist with: ${profile.intolerances.map((item) => item.label).join(", ")} (${[...new Set(profile.intolerances.map((item) => item.condition))].join("; ")}).`,
    );
  }
  if (profile.notStated.length > 0) lines.push(`Not stated by the registry: ${profile.notStated.join(", ")}.`);
  return { heading: `Reagent text as written: “${profile.reagentText}”.`, lines };
}
