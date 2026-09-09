import { getRDKit } from "../../rdkit";
import type { FunctionalGroupResult } from "../../functionalGroups";
import { REACTION_CONSTRAINTS } from "../constraints/reactionConstraints";
import type {
  ReactionFailureCategory,
  ReactionRule,
  ReactionTrigger,
} from "../reactionTypes";
import { splitReactionComponents } from "./reactionInput";
import { ruleMatchesReactant, triggerMatchesReactant } from "./ruleMatcher";
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
  category: ReactionFailureCategory;
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

function isDielsAlderRule(rule: ReactionRule): boolean {
  if (rule.transform.type !== "customHandler") return false;
  return (
    rule.transform.handler === "pericyclic" &&
    rule.transform.options?.mode === "dielsAlder"
  );
}

async function nonConjugatedDieneDielsAlderOutcome(
  smiles: string,
  successfulRuleIds: Set<string>,
  rules: ReactionRule[],
): Promise<NoReactionOutcome | null> {
  const dielsAlderRules = rules.filter(isDielsAlderRule);
  if (dielsAlderRules.some((rule) => successfulRuleIds.has(rule.id))) return null;

  const components = splitReactionComponents(smiles);
  if (components.length < 2 || dielsAlderRules.length === 0) return null;

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
        componentInfo.push({
          alkeneCount: 0,
          hasAlkyne: false,
          hasConjugatedDiene: false,
        });
        continue;
      }

      try {
        componentInfo.push({
          alkeneCount: substructureMatchCount(mol, alkeneQuery),
          hasAlkyne: substructureMatchCount(mol, alkyneQuery) > 0,
          hasConjugatedDiene:
            substructureMatchCount(mol, conjugatedDieneQuery) > 0,
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
        "One drawn component contains multiple C=C bonds, but they are not arranged as a conjugated C=C–C=C diene. A standard thermal Diels–Alder reaction cannot use a nonconjugated diene directly, even when a valid alkene or alkyne dienophile is present.",
      suggestion:
        "Use a true conjugated 1,3-diene that can adopt s-cis geometry. If a 1,3-diene was intended, correct the double-bond placement rather than forcing a cycloaddition from the nonconjugated isomer.",
      category: "mechanistic",
      ruleIds: dielsAlderRules.map((rule) => rule.id),
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
    organometallicQuery = rdkit.get_qmol(
      GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS,
    );
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
          organometallicQuery &&
            mol.get_substruct_match(organometallicQuery) !== "{}",
        );
        hasUnactivatedPiBond ||= Boolean(
          alkeneQuery && mol.get_substruct_match(alkeneQuery) !== "{}",
        );
        hasClassicalElectrophile ||= Boolean(
          (carbonylQuery && mol.get_substruct_match(carbonylQuery) !== "{}") ||
            (nitrileQuery && mol.get_substruct_match(nitrileQuery) !== "{}") ||
            (epoxideQuery && mol.get_substruct_match(epoxideQuery) !== "{}"),
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
      title:
        "NO REACTION — Grignard/organolithium with an unactivated alkene or diene",
      reagentLabel: GRIGNARD_OR_ORGANOLITHIUM_SHORT_LABEL,
      explanation:
        `${GRIGNARD_OR_ORGANOLITHIUM_LONG_LABEL} does not add across an ordinary unactivated C=C bond in standard O-Chem chemistry. These carbon nucleophiles need an electrophilic site such as a carbonyl, nitrile, epoxide, CO₂, or related polarized functional group.`,
      suggestion:
        "Use a classical electrophile such as a carbonyl, nitrile, epoxide, acyl derivative, or CO₂. An alkene can first be epoxidized and then opened by the organometallic reagent as a separate multistep sequence.",
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

function broadDiagnosticTrigger(rule: ReactionRule): ReactionTrigger | null {
  if (rule.diagnosticTrigger) return rule.diagnosticTrigger;

  const trigger: ReactionTrigger = {
    functionalGroups: rule.trigger.functionalGroups,
    anyFunctionalGroups: rule.trigger.anyFunctionalGroups,
    allFunctionalGroups: rule.trigger.allFunctionalGroups,
    excludedFunctionalGroups: rule.trigger.excludedFunctionalGroups,
  };

  const hasNamedScope = Boolean(
    trigger.functionalGroups?.length ||
      trigger.anyFunctionalGroups?.length ||
      trigger.allFunctionalGroups?.length,
  );
  return hasNamedScope ? trigger : null;
}

async function constraintOutcomeForRule(
  smiles: string,
  rule: ReactionRule,
  functionalGroups: FunctionalGroupResult[] = [],
): Promise<NoReactionOutcome | null> {
  for (const constraintId of rule.constraints ?? []) {
    const constraint = REACTION_CONSTRAINTS[constraintId];
    if (!constraint) continue;

    // Site-aware constraints: a nonreactive site must not veto chemistry at a
    // different compatible site in the same polyfunctional molecule. Example:
    // a tertiary OH can coexist with a secondary OH that PCC oxidizes normally.
    if (
      constraint.satisfiedByTrigger &&
      (await triggerMatchesReactant(
        constraint.satisfiedByTrigger,
        smiles,
        functionalGroups,
      ))
    ) {
      continue;
    }

    if (
      await triggerMatchesReactant(
        constraint.failureTrigger,
        smiles,
        functionalGroups,
      )
    ) {
      const diagnosticKey = constraint.diagnosticGroup ?? `${rule.id}-${constraint.id}`;
      return {
        id: `no-reaction-${diagnosticKey}`,
        title: constraint.title ?? `NO REACTION — ${rule.title}`,
        reagentLabel: constraint.reagentLabel ?? rule.reagents,
        explanation: constraint.explanation,
        suggestion: constraint.suggestion,
        category: constraint.category,
        ruleIds: [rule.id],
      };
    }
  }

  return null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectedNames(functionalGroups: FunctionalGroupResult[]): string[] {
  const names = new Set<string>();
  for (const group of functionalGroups) {
    names.add(normalizeName(group.name));
    for (const equivalent of group.equivalentNames ?? []) {
      names.add(normalizeName(equivalent));
    }
  }
  return [...names];
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
      "which is explicitly excluded by the rule for these conditions.";
  } else if (requiredNames.length > 0) {
    explanation =
      `The relevant functional-group class is present, but this molecule does not satisfy the full structural requirements for ${rule.title}. ` +
      "Check substitution, reactive hydrogens, conjugation, and accessibility of the reacting site.";
  } else {
    explanation =
      "This molecule lacks the specific structural arrangement required by this reaction rule.";
  }

  return {
    id: `no-reaction-${rule.id}`,
    title: `NO REACTION — ${rule.title}`,
    reagentLabel: rule.reagents,
    explanation,
    suggestion:
      "Choose a condition whose substrate requirements match the functional-group class and structural pattern of the molecule you drew.",
    category: "missing-site",
    ruleIds: [rule.id],
  };
}

function normalizedDiagnosticText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse diagnostics that communicate the same mechanistic failure even if
 * they originated from two catalog entries (for example Friedel-Crafts
 * alkylation and acylation on nitrobenzene).  Rule IDs are metadata, not a
 * reason to show the student the same NO REACTION explanation twice.
 */
function dedupeNoReactionOutcomes(
  outcomes: NoReactionOutcome[],
): NoReactionOutcome[] {
  const bySignature = new Map<string, NoReactionOutcome>();
  for (const outcome of outcomes) {
    const signature = [
      normalizedDiagnosticText(outcome.id),
      normalizedDiagnosticText(outcome.title),
      normalizedDiagnosticText(outcome.reagentLabel),
      normalizedDiagnosticText(outcome.explanation),
    ].join("||");
    const semanticSignature = [
      normalizedDiagnosticText(outcome.title),
      normalizedDiagnosticText(outcome.reagentLabel),
      normalizedDiagnosticText(outcome.explanation),
    ].join("||");
    const existing = bySignature.get(signature) ?? bySignature.get(semanticSignature);
    if (existing) {
      existing.ruleIds = [...new Set([...existing.ruleIds, ...outcome.ruleIds])];
      continue;
    }
    bySignature.set(signature, outcome);
    bySignature.set(semanticSignature, outcome);
  }
  return [...new Set(bySignature.values())];
}

/**
 * Returns explicit no-reaction cards for chemically related rules. Specific
 * reusable constraints are checked first. Generic relevance is based on a
 * structured diagnostic trigger rather than family-name keyword heuristics.
 */
export async function predictNoReactionOutcomes(
  smiles: string,
  successfulRuleIds: Iterable<string> = [],
  rules: ReactionRule[] = [],
  functionalGroups: FunctionalGroupResult[] = [],
): Promise<NoReactionOutcome[]> {
  const successful = new Set(successfulRuleIds);

  /*
   * Pair-level NO REACTION diagnostics describe what happens when two drawn
   * structures have no valid reaction with one another.  Once a successful
   * rule that actually requires an additional structural reactant has matched,
   * a broad diagnostic for a different hypothetical interaction must not be
   * displayed alongside it.  This prevents contradictory cards such as
   * “Grignard + alkene: no reaction” next to a valid epoxidation/Grignard
   * sequence, and applies to every future multi-reactant rule without knowing
   * any reaction IDs.
   */
  const hasSuccessfulMultiReactantChemistry = rules.some(
    (rule) =>
      successful.has(rule.id) &&
      (rule.additionalReactants?.some(
        (requirement) => requirement.supplyMode !== "condition-only",
      ) ?? false),
  );

  const multiReactantOutcomes: NoReactionOutcome[] = [];
  if (!hasSuccessfulMultiReactantChemistry) {
    const organometallicNoReaction =
      await organometallicWithUnactivatedPiSystemOutcome(smiles);
    if (organometallicNoReaction) multiReactantOutcomes.push(organometallicNoReaction);

    const dielsAlderNoReaction = await nonConjugatedDieneDielsAlderOutcome(
      smiles,
      successful,
      rules,
    );
    if (dielsAlderNoReaction) multiReactantOutcomes.push(dielsAlderNoReaction);
  }

  if (multiReactantOutcomes.length > 0) return dedupeNoReactionOutcomes(multiReactantOutcomes);
  if (rules.length === 0) return [];

  const outcomes: NoReactionOutcome[] = [];

  for (const rule of rules) {
    if (successful.has(rule.id)) continue;
    if (rule.transform.type === "conceptOnly") continue;

    const specific = await constraintOutcomeForRule(
      smiles,
      rule,
      functionalGroups,
    );
    if (specific) {
      outcomes.push(specific);
      continue;
    }

    // Missing variable co-reactants are input requirements, not chemistry.
    if ((rule.additionalReactants?.length ?? 0) > 0) continue;

    const diagnosticTrigger = broadDiagnosticTrigger(rule);
    if (!diagnosticTrigger) continue;
    if (!(await triggerMatchesReactant(diagnosticTrigger, smiles, functionalGroups))) {
      continue;
    }

    // A matching rule that failed to generate a molecule is an engine support
    // issue, not a chemical no-reaction prediction.
    if (await ruleMatchesReactant(rule, smiles, functionalGroups)) continue;

    outcomes.push(genericNoReactionOutcome(rule, functionalGroups));
  }

  // Several catalog rules can share one mechanistic failure constraint (for
  // example PCC/DMP/Swern/Jones on a tertiary-only alcohol). Collapse those
  // into one diagnostic card instead of repeating the same chemistry under
  // every reagent-specific rule.
  const dedupedById = new Map<string, NoReactionOutcome>();
  for (const outcome of outcomes) {
    const existing = dedupedById.get(outcome.id);
    if (!existing) {
      dedupedById.set(outcome.id, outcome);
      continue;
    }
    existing.ruleIds = [...new Set([...existing.ruleIds, ...outcome.ruleIds])];
  }

  const priorityById = new Map(rules.map((rule) => [rule.id, rule.priority]));
  return dedupeNoReactionOutcomes([...dedupedById.values()]).sort(
    (a, b) =>
      (priorityById.get(a.ruleIds[0] ?? "") ?? 9999) -
        (priorityById.get(b.ruleIds[0] ?? "") ?? 9999) ||
      a.title.localeCompare(b.title),
  );
}

export async function explainNoReactionForRule(
  smiles: string,
  rule: ReactionRule,
): Promise<NoReactionOutcome> {
  const specific = await constraintOutcomeForRule(smiles, rule);
  if (specific) return specific;

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
