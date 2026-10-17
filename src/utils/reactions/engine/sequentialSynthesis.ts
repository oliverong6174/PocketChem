import type {
  ReactionDisplayMetadata,
  ReactionEngineIssue,
  ReactionPathway,
  ReactionProductMixtureKind,
  ReactionReactantRequirement,
  ReactionRule,
  ReactionSelectivityAssessment,
} from "../reactionTypes";
import { getRDKit } from "../../rdkit";
import { resolveReactantRequirement } from "../profiles/reactants";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { explainNoReactionForRule, type NoReactionOutcome } from "./noReaction";
import { analyzeReactionComponents, splitReactionComponents } from "./reactionInput";
import { ruleMatchesReactant } from "./ruleMatcher";

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

/**
 * Outcome of applying one condition to the current molecule.
 *
 * - reaction:        a product was computed.
 * - no-reaction:     the substrate was evaluated and chemically does not react
 *                    (the molecule carries forward unchanged).
 * - needs-input:     the substrate fits the rule but an additional structural
 *                    reactant must be supplied (never invented).
 * - unsupported:     the rule applies but PocketChem cannot compute a
 *                    structural product (concept-only rule, or the structure
 *                    generator returned nothing for matched reactants).
 * - unknown-rule:    the requested condition id is not in the registry.
 * - execution-error: an internal matcher/SMARTS/handler failure prevented the
 *                    evaluation. This is NOT evidence of nonreactivity.
 *
 * Every status other than "reaction" leaves the molecule unchanged for the
 * next step; only "no-reaction" is a chemical conclusion, so steps that follow
 * any other status carry `inputUnresolved: true`.
 */
export type SequentialSynthesisStepStatus =
  | "reaction"
  | "no-reaction"
  | "needs-input"
  | "unsupported"
  | "unknown-rule"
  | "execution-error";

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
  /** Internal engine failures observed while evaluating this step. */
  issues: string[];
  /**
   * True when an earlier step in this branch was neither a computed reaction
   * nor a chemical NO REACTION, so this step's input molecule is only the
   * unchanged carry-forward of an unresolved step.
   */
  inputUnresolved: boolean;
  /**
   * PocketChem's own per-product selectivity estimate for this step (a
   * heuristic model, not an experimental measurement), or null when the rule
   * has no product-specific estimate.
   */
  selectivity: ReactionSelectivityAssessment | null;
  /**
   * Set when this product is a member of an expected stereochemical mixture.
   * `collapsed` means the equivalent racemic members share one outcome and
   * `productSmiles` shows a single representative.
   */
  mixture: SequentialStepMixture | null;
  /** Every molecular component of the state after this step (coproducts included). */
  productComponents: string[];
  /**
   * Components of the incoming state that this condition did not transform.
   * They are part of the product state, not discarded.
   */
  spectators: string[];
};

export type SequentialStepMixture = {
  kind: ReactionProductMixtureKind;
  groupId: string;
  label: string;
  memberCount: number;
  collapsed: boolean;
  /** Full product states of every member (only filled when collapsed). */
  memberSmiles: string[];
};

export type SequentialBranchRanking = {
  /**
   * "heuristic-selectivity-estimate": ordered by PocketChem's modeled product
   * selectivity. "none": no step carried an estimate, so original engine order
   * was kept. Neither is an experimental result.
   */
  basis: "heuristic-selectivity-estimate" | "none";
  /** Product of the per-step estimated fractions that exist; null if none. */
  cumulativeFraction: number | null;
  /** Sum of per-step planning penalties; lower is preferred. */
  cumulativePenalty: number;
};

export type SequentialSynthesisBranch = {
  id: string;
  startingSmiles: string;
  finalSmiles: string;
  steps: SequentialSynthesisStep[];
  ranking: SequentialBranchRanking;
  /**
   * True when `finalSmiles` is one representative of a racemic mixture whose
   * other members are enantiomers (listed in the last step's `mixture`).
   */
  representsRacemate: boolean;
};

export type SequentialSynthesisOptions = {
  branchLimit?: number;
};

/** A viable outcome dropped only because of the branch limit. */
export type SequentialBranchExclusion = {
  stepNumber: number;
  finalSmiles: string;
  label: string;
  selectivityLabel: string | null;
  reason: "branch-limit";
};

export type SequentialSynthesisReport = {
  branches: SequentialSynthesisBranch[];
  branchLimit: number;
  /** Outcomes removed by the branch limit; empty when nothing was dropped. */
  exclusions: SequentialBranchExclusion[];
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

type StepDescriptor = {
  id: string;
  title: string;
  reagents: string;
  reagentNote: string;
  display: ReactionDisplayMetadata | null;
};

function describeRule(rule: ReactionRule): StepDescriptor {
  return {
    id: rule.id,
    title: rule.title,
    reagents: rule.reagents,
    reagentNote: rule.reagentNote,
    display: rule.display ?? null,
  };
}

function branchHasUnresolvedStep(branch: SequentialSynthesisBranch): boolean {
  return branch.steps.some(
    (step) => step.status !== "reaction" && step.status !== "no-reaction",
  );
}

function appendNonReactionStep(
  branch: SequentialSynthesisBranch,
  stepIndex: number,
  rule: StepDescriptor,
  status: Exclude<SequentialSynthesisStepStatus, "reaction">,
  explanation: string,
  productLabel: string,
  noReaction: NoReactionOutcome | null,
  issues: string[] = [],
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
        display: rule.display,
        issues,
        inputUnresolved: branchHasUnresolvedStep(branch),
        selectivity: null,
        mixture: null,
        productComponents: splitReactionComponents(reactantSmiles),
        spectators: [],
      },
    ],
  };
}

/**
 * Chemically justified state identity: the multiset of molecular components,
 * each as an RDKit canonical isomeric SMILES. Component order and atom
 * ordering do not matter; stereochemistry does (enantiomers stay distinct).
 */
async function componentKeys(smiles: string): Promise<{ raw: string; key: string }[]> {
  const rdkit = await getRDKit();
  return splitReactionComponents(smiles).map((raw) => {
    let molecule: ReturnType<typeof rdkit.get_mol> | null = null;
    try {
      molecule = rdkit.get_mol(raw);
      return { raw, key: molecule?.get_smiles?.() || raw };
    } catch {
      return { raw, key: raw };
    } finally {
      molecule?.delete?.();
    }
  });
}

async function stateKey(smiles: string): Promise<string> {
  return (await componentKeys(smiles)).map((part) => part.key).sort().join(".");
}

/**
 * Components of `state` that a pathway did not consume. Matching is done on
 * canonical SMILES so equivalent spellings are recognised. `resolved` is false
 * when a consumed component cannot be located in the state, in which case the
 * spectator list cannot be trusted.
 */
async function splitSpectators(
  state: string,
  consumed: string[],
): Promise<{ spectators: string[]; resolved: boolean }> {
  const remaining = await componentKeys(state);
  if (remaining.length <= 1) return { spectators: [], resolved: true };

  // Auto-supplied reagents are consumed too but are not part of the state, so
  // a consumed component that is absent is only a problem if none is found.
  let located = 0;
  for (const consumedKey of await Promise.all(consumed.map(stateKey))) {
    const index = remaining.findIndex((part) => part.key === consumedKey);
    if (index !== -1) {
      remaining.splice(index, 1);
      located += 1;
    }
  }
  return { spectators: remaining.map((part) => part.raw), resolved: located > 0 };
}

function rankingFromSteps(steps: SequentialSynthesisStep[]): SequentialBranchRanking {
  let fraction: number | null = null;
  let penalty = 0;
  for (const step of steps) {
    const selectivity = step.selectivity;
    if (!selectivity) continue;
    penalty += selectivity.planningPenalty;
    if (selectivity.estimatedFraction !== null) {
      fraction = (fraction ?? 1) * selectivity.estimatedFraction;
    }
  }
  const hasEvidence = steps.some((step) => step.selectivity !== null);
  return {
    basis: hasEvidence ? "heuristic-selectivity-estimate" : "none",
    cumulativeFraction: fraction,
    cumulativePenalty: penalty,
  };
}

function executionErrorStep(
  branch: SequentialSynthesisBranch,
  stepIndex: number,
  rule: ReactionRule,
  issues: string[],
): SequentialSynthesisBranch {
  return appendNonReactionStep(
    branch,
    stepIndex,
    describeRule(rule),
    "execution-error",
    `PocketChem could not evaluate this condition because of an internal engine problem (${issues.join("; ")}). ` +
      "This is not a chemical prediction: it does not mean the molecule is unreactive under these conditions.",
    "EVALUATION FAILED",
    null,
    issues,
  );
}

function issueMessages(issues: ReactionEngineIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.message))];
}

async function noReactionStep(
  branch: SequentialSynthesisBranch,
  stepIndex: number,
  rule: ReactionRule,
): Promise<SequentialSynthesisBranch> {
  let noReaction: NoReactionOutcome;
  try {
    noReaction = await explainNoReactionForRule(branch.finalSmiles, rule);
  } catch (error) {
    // The explanation generator failing must not be mistaken for the
    // prediction itself, and must not hide that nothing was computed.
    return executionErrorStep(branch, stepIndex, rule, [
      `could not generate the no-reaction explanation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }

  return appendNonReactionStep(
    branch,
    stepIndex,
    describeRule(rule),
    "no-reaction",
    noReaction.explanation,
    "NO REACTION",
    noReaction,
  );
}

/**
 * Decide whether the current molecule satisfies the rule's own substrate
 * requirements. `issues` is filled when the answer could not be established
 * because an engine step failed (as opposed to a chemical "no").
 */
async function substrateFitsRule(
  rule: ReactionRule,
  smiles: string,
  issues: string[],
): Promise<boolean> {
  const components = await analyzeReactionComponents(smiles);
  for (const component of components) {
    if (component.analysisError) {
      issues.push(
        `functional-group analysis failed for "${component.smiles}": ${component.analysisError}`,
      );
    }
  }

  let fits = false;
  for (const component of components) {
    if (
      await ruleMatchesReactant(
        rule,
        component.smiles,
        component.functionalGroups,
        (message) => issues.push(message),
      )
    ) {
      fits = true;
    }
  }
  return fits;
}

async function structureParseProblem(smiles: string): Promise<string | null> {
  try {
    const rdkit = await getRDKit();
    // Use the engine's own component splitting so Ketcher R-group notation is
    // normalized exactly as it is for reaction matching.
    for (const component of splitReactionComponents(smiles)) {
      const molecule = rdkit.get_mol(component);
      if (!molecule) return `RDKit could not parse the structure "${component}".`;
      molecule.delete?.();
    }
    return null;
  } catch (error) {
    return `Structure validation failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runSequentialSynthesis(
  startingSmiles: string,
  selectedRuleIds: string[],
  rules: ReactionRule[],
  options: SequentialSynthesisOptions = {},
): Promise<SequentialSynthesisBranch[]> {
  return (await runSequentialSynthesisDetailed(startingSmiles, selectedRuleIds, rules, options))
    .branches;
}

/**
 * Same computation as `runSequentialSynthesis`, but also reports which
 * outcomes were removed by the branch limit so callers never present a
 * truncated set as complete.
 */
export async function runSequentialSynthesisDetailed(
  startingSmiles: string,
  selectedRuleIds: string[],
  rules: ReactionRule[],
  options: SequentialSynthesisOptions = {},
): Promise<SequentialSynthesisReport> {
  const trimmedStart = startingSmiles.trim();
  const branchLimit = Math.max(1, Math.min(12, options.branchLimit ?? 6));
  if (!trimmedStart || selectedRuleIds.length === 0) {
    return { branches: [], branchLimit, exclusions: [] };
  }
  const exclusions: SequentialBranchExclusion[] = [];
  // Outcomes of one non-racemic stereo-mixture stay together when ranking and
  // pruning, so one reaction mixture never consumes several independent slots.
  const unitKeys = new WeakMap<SequentialSynthesisBranch, string>();

  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));

  let branches: SequentialSynthesisBranch[] = [
    {
      id: "sequence-1",
      startingSmiles: trimmedStart,
      finalSmiles: trimmedStart,
      steps: [],
      ranking: { basis: "none", cumulativeFraction: null, cumulativePenalty: 0 },
      representsRacemate: false,
    },
  ];

  for (let stepIndex = 0; stepIndex < selectedRuleIds.length; stepIndex += 1) {
    const ruleId = selectedRuleIds[stepIndex];
    const rule = ruleMap.get(ruleId);

    if (!rule) {
      // Reagent order is meaningful, so an unknown condition keeps its slot as
      // an explicit, unresolved step instead of silently disappearing.
      branches = branches.map((branch) =>
        appendNonReactionStep(
          branch,
          stepIndex,
          {
            id: ruleId,
            title: "Unknown reaction condition",
            reagents: ruleId,
            reagentNote: "",
            display: null,
          },
          "unknown-rule",
          `Reaction condition "${ruleId}" is not in the reaction registry, so this step was not evaluated. ` +
            "No chemistry was applied; the molecule is carried forward unchanged.",
          "UNKNOWN CONDITION",
          null,
        ),
      );
      continue;
    }

    const reactantInfo = additionalReactantInfo(rule);
    const nextBranches: SequentialSynthesisBranch[] = [];

    for (const branch of branches) {
      const reactantSmiles = branch.finalSmiles;

      if (rule.transform.type === "conceptOnly") {
        nextBranches.push(
          appendNonReactionStep(
            branch,
            stepIndex,
            describeRule(rule),
            "unsupported",
            rule.transform.reason,
            "PRODUCT NOT STRUCTURALLY COMPUTED",
            null,
          ),
        );
        continue;
      }

      // An unparsable structure has no functional groups, so every matcher
      // would quietly report "no match". Surface it instead of calling it
      // chemical nonreactivity.
      const parseProblem = await structureParseProblem(reactantSmiles);
      if (parseProblem) {
        nextBranches.push(executionErrorStep(branch, stepIndex, rule, [parseProblem]));
        continue;
      }

      if (reactantInfo.unresolved.length > 0) {
        // A missing partner is only relevant if the current molecule can
        // actually play the substrate role. Establish that first.
        const fitIssues: string[] = [];
        let fits = false;
        try {
          fits = await substrateFitsRule(rule, reactantSmiles, fitIssues);
        } catch (error) {
          fitIssues.push(error instanceof Error ? error.message : String(error));
        }

        if (fitIssues.length > 0) {
          nextBranches.push(
            executionErrorStep(branch, stepIndex, rule, [...new Set(fitIssues)]),
          );
          continue;
        }

        if (!fits) {
          nextBranches.push(await noReactionStep(branch, stepIndex, rule));
          continue;
        }

        const labels = reactantInfo.unresolved.join(", ");
        nextBranches.push(
          appendNonReactionStep(
            branch,
            stepIndex,
            describeRule(rule),
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
      const engineIssues: ReactionEngineIssue[] = [];
      let rawPathways: ReactionPathway[];
      try {
        rawPathways = await predictReactionPathwaysFromRules(reactionInput, [], [rule], {
          issues: engineIssues,
        });
      } catch (error) {
        nextBranches.push(
          executionErrorStep(branch, stepIndex, rule, [
            error instanceof Error ? error.message : String(error),
          ]),
        );
        continue;
      }

      const pathways = uniqueProducts(rawPathways);
      const issues = issueMessages(engineIssues);

      if (pathways.length === 0) {
        if (rawPathways.some((pathway) => pathway.missingReactants.length > 0)) {
          nextBranches.push(
            appendNonReactionStep(
              branch,
              stepIndex,
              describeRule(rule),
              "needs-input",
              "This reaction needs an additional structural reactant. PocketChem will not invent that structure from a reagent name.",
              "ADDITIONAL REACTANT REQUIRED",
              null,
            ),
          );
          continue;
        }

        if (issues.length > 0) {
          nextBranches.push(executionErrorStep(branch, stepIndex, rule, issues));
          continue;
        }

        if (rawPathways.length > 0) {
          // The rule matched the reactants but the structure generator
          // returned nothing. That is a limitation of PocketChem, not a
          // chemical statement that the substrate is unreactive.
          nextBranches.push(
            appendNonReactionStep(
              branch,
              stepIndex,
              describeRule(rule),
              "unsupported",
              "This condition matches the current molecule, but PocketChem's structure generator did not produce a valid product for it. " +
                "This is a limitation of the model, not a prediction of nonreactivity.",
              "PRODUCT NOT STRUCTURALLY COMPUTED",
              null,
            ),
          );
          continue;
        }

        nextBranches.push(await noReactionStep(branch, stepIndex, rule));
        continue;
      }

      const inputUnresolved = branchHasUnresolvedStep(branch);
      const candidates: { branch: SequentialSynthesisBranch; memberIndex: number }[] = [];
      for (let productIndex = 0; productIndex < pathways.length; productIndex += 1) {
        const pathway = pathways[productIndex];
        if (!pathway.productSmiles) continue;

        // Components the condition did not touch stay in the state.
        const { spectators, resolved } = await splitSpectators(
          reactantSmiles,
          pathway.reactantComponents.length > 0
            ? pathway.reactantComponents
            : [pathway.reactantSmiles],
        );
        const stepIssues = resolved
          ? issues
          : [
              ...issues,
              "Could not match the reacting component to the incoming mixture; other components may be missing from the result.",
            ];
        const finalSmiles = [...spectators, pathway.productSmiles].join(".");
        const mixtureMeta = pathway.productMixture;
        const steps: SequentialSynthesisStep[] = [
          ...branch.steps,
          {
            stepNumber: stepIndex + 1,
            ruleId: rule.id,
            title: pathway.title,
            reagentLabel: pathway.reagentLabel,
            reagentNote: pathway.reagentNote,
            reactantSmiles,
            productSmiles: finalSmiles,
            productLabel: mixtureMeta?.displayName ?? pathway.productLabel,
            status: "reaction",
            explanation: pathway.shortExplanation,
            noReaction: null,
            display: pathway.display,
            issues: stepIssues,
            inputUnresolved,
            selectivity: pathway.selectivityAssessment ?? null,
            mixture: mixtureMeta
              ? {
                  kind: mixtureMeta.kind,
                  groupId: mixtureMeta.groupId,
                  label: mixtureMeta.label,
                  memberCount: mixtureMeta.memberCount,
                  collapsed: false,
                  memberSmiles: [],
                }
              : null,
            productComponents: splitReactionComponents(finalSmiles),
            spectators,
          },
        ];
        const next: SequentialSynthesisBranch = {
          ...branch,
          id: `${branch.id}-s${stepIndex + 1}-p${productIndex + 1}`,
          finalSmiles,
          steps,
          ranking: rankingFromSteps(steps),
          representsRacemate: branch.representsRacemate,
        };
        unitKeys.set(
          next,
          mixtureMeta && mixtureMeta.kind !== "racemic"
            ? `${branch.id}::${mixtureMeta.groupId}`
            : next.id,
        );
        candidates.push({ branch: next, memberIndex: mixtureMeta?.memberIndex ?? 0 });
      }

      // Enantiomers from one racemic mixture are a single outcome: the members
      // behave identically toward achiral reagents, so they share one slot.
      const racemicGroups = new Map<string, typeof candidates>();
      for (const candidate of candidates) {
        const mixture = candidate.branch.steps[candidate.branch.steps.length - 1].mixture;
        if (mixture?.kind !== "racemic") continue;
        const group = racemicGroups.get(mixture.groupId) ?? [];
        group.push(candidate);
        racemicGroups.set(mixture.groupId, group);
      }
      const dropped = new Set<SequentialSynthesisBranch>();
      for (const group of racemicGroups.values()) {
        if (group.length < 2) continue;
        const representative = group.reduce((best, item) =>
          item.memberIndex < best.memberIndex ? item : best,
        );
        const memberSmiles: string[] = [];
        const seenStates = new Set<string>();
        for (const item of group) {
          const key = await stateKey(item.branch.finalSmiles);
          if (seenStates.has(key)) continue;
          seenStates.add(key);
          memberSmiles.push(item.branch.finalSmiles);
          if (item !== representative) dropped.add(item.branch);
        }
        const lastStep = representative.branch.steps[representative.branch.steps.length - 1];
        if (lastStep.mixture) {
          lastStep.mixture.collapsed = true;
          lastStep.mixture.memberSmiles = memberSmiles;
        }
        if (!lastStep.productLabel.toLowerCase().includes("racemic")) {
          lastStep.productLabel = `racemic mixture (one enantiomer shown: ${lastStep.productLabel})`;
        }
        representative.branch.representsRacemate = true;
      }
      for (const candidate of candidates) {
        if (!dropped.has(candidate.branch)) nextBranches.push(candidate.branch);
      }
    }

    // Identity is the canonical component multiset plus the status path, not
    // the raw SMILES text.
    const deduped = new Map<string, SequentialSynthesisBranch>();
    for (const branch of nextBranches) {
      const key = `${await stateKey(branch.finalSmiles)}::${branch.representsRacemate}::${branch.steps
        .map((step) => `${step.ruleId}:${step.status}`)
        .join("|")}`;
      if (!deduped.has(key)) deduped.set(key, branch);
    }

    // Rank (stable) by PocketChem's modeled selectivity before pruning, so the
    // limit removes the least-supported outcomes instead of the latest ones.
    const units = new Map<string, SequentialSynthesisBranch[]>();
    for (const branch of deduped.values()) {
      const unit = unitKeys.get(branch) ?? branch.id;
      const members = units.get(unit) ?? [];
      members.push(branch);
      units.set(unit, members);
    }
    const ranked = [...units.values()]
      .map((members, order) => ({
        members,
        order,
        penalty: Math.min(...members.map((member) => member.ranking.cumulativePenalty)),
      }))
      .sort((a, b) => a.penalty - b.penalty || a.order - b.order);

    for (const unit of ranked.slice(branchLimit)) {
      for (const member of unit.members) {
        const last = member.steps[member.steps.length - 1];
        exclusions.push({
          stepNumber: stepIndex + 1,
          finalSmiles: member.finalSmiles,
          label: last.productLabel,
          selectivityLabel: last.selectivity?.label ?? null,
          reason: "branch-limit",
        });
      }
    }

    branches = ranked.slice(0, branchLimit).flatMap((unit) => unit.members);
    if (branches.length === 0) break;
  }

  return {
    branches: branches.map((branch, index) => ({ ...branch, id: `sequence-${index + 1}` })),
    branchLimit,
    exclusions,
  };
}
