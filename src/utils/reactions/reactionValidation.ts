import type {
  ReactionHandlerName,
  ReactionRule,
  ReactionType,
} from "./reactionTypes";

const VALID_REACTION_TYPES = new Set<ReactionType>([
  "addition",
  "substitution",
  "elimination",
  "oxidation",
  "reduction",
  "condensation",
  "rearrangement",
  "acidBase",
  "cleavage",
  "cyclization",
  "ringOpening",
  "coupling",
  "pericyclic",
  "radical",
  "tautomerization",
  "isomerization",
]);

const VALID_CUSTOM_HANDLERS = new Set<ReactionHandlerName>([
  "addition",
  "substitution",
  "elimination",
  "carbonyl",
  "oxidation",
  "reduction",
  "ring",
  "rearrangement",
  "pericyclic",
]);

export type ReactionRegistryIssue = {
  ruleId: string | null;
  message: string;
};

export function validateReactionRegistry(
  rules: ReactionRule[]
): ReactionRegistryIssue[] {
  const issues: ReactionRegistryIssue[] = [];
  const seenIds = new Set<string>();

  for (const rule of rules) {
    const ruleId = rule.id || null;

    if (!rule.id.trim()) {
      issues.push({ ruleId, message: "Rule id is empty." });
    } else if (seenIds.has(rule.id)) {
      issues.push({ ruleId, message: "Duplicate reaction rule id." });
    }
    seenIds.add(rule.id);

    for (const [field, value] of [
      ["family", rule.family],
      ["title", rule.title],
      ["reagents", rule.reagents],
      ["productHint", rule.productHint],
      ["explanation", rule.explanation],
    ] as const) {
      if (!value.trim()) {
        issues.push({ ruleId, message: `${field} is empty.` });
      }
    }

    if (!VALID_REACTION_TYPES.has(rule.reactionType)) {
      issues.push({
        ruleId,
        message: `Unknown reaction type: ${String(rule.reactionType)}`,
      });
    }

    if (!Number.isFinite(rule.priority)) {
      issues.push({ ruleId, message: "Priority must be a finite number." });
    }

    const triggers = [
      rule.trigger,
      ...(rule.additionalReactants ?? []).map((item) => item.trigger),
    ];

    for (const [triggerIndex, trigger] of triggers.entries()) {
      const hasNameTrigger = Boolean(
        trigger.functionalGroups?.length ||
          trigger.anyFunctionalGroups?.length ||
          trigger.allFunctionalGroups?.length
      );
      const hasSmartsTrigger = Boolean(
        trigger.includeSmarts?.length || trigger.excludeSmarts?.length
      );

      if (!hasNameTrigger && !hasSmartsTrigger) {
        issues.push({
          ruleId,
          message: `${triggerIndex === 0 ? "Primary" : "Additional"} reactant trigger is empty.`,
        });
      }
    }


    for (const requirement of rule.additionalReactants ?? []) {
      if (!requirement.label.trim()) {
        issues.push({
          ruleId,
          message: "Additional reactant label is empty.",
        });
      }

      if (
        requirement.equivalents !== undefined &&
        (!Number.isInteger(requirement.equivalents) ||
          requirement.equivalents <= 0)
      ) {
        issues.push({
          ruleId,
          message: "Additional reactant equivalents must be a positive integer.",
        });
      }
    }

    if (rule.transform.type === "reactionSmarts") {
      if (!rule.transform.smarts.includes(">>")) {
        issues.push({
          ruleId,
          message: "Reaction SMARTS is missing the >> separator.",
        });
      }

      if (
        rule.transform.maxProducts !== undefined &&
        (!Number.isInteger(rule.transform.maxProducts) ||
          rule.transform.maxProducts <= 0)
      ) {
        issues.push({
          ruleId,
          message: "maxProducts must be a positive integer.",
        });
      }

      if ((rule.additionalReactants?.length ?? 0) > 0) {
        const reactantTemplateCount = rule.transform.smarts
          .split(">>", 1)[0]
          .split(".")
          .filter(Boolean).length;
        // Count stoichiometric reactant templates, not just distinct drawn
        // reactant roles. A role with `equivalents: 2` is drawn once by the
        // user but is duplicated internally by the matcher, so it occupies
        // two templates in the reaction SMARTS.
        const requiredReactantTemplateCount =
          1 +
          (rule.additionalReactants ?? []).reduce((count, requirement) => {
            const equivalents = requirement.equivalents ?? 1;

            // Invalid equivalents are reported separately above. Count them
            // as one here so this validation does not emit a misleading
            // second error.
            return (
              count +
              (Number.isInteger(equivalents) && equivalents > 0
                ? equivalents
                : 1)
            );
          }, 0);

        if (reactantTemplateCount !== requiredReactantTemplateCount) {
          issues.push({
            ruleId,
            message: `Multi-reactant SMARTS has ${reactantTemplateCount} reactant template(s), but the rule requires ${requiredReactantTemplateCount} stoichiometric reactant template(s).`,
          });
        }
      }
    }

    if (rule.transform.type === "customHandler") {
      if (!VALID_CUSTOM_HANDLERS.has(rule.transform.handler)) {
        issues.push({
          ruleId,
          message: `Unknown custom handler: ${String(rule.transform.handler)}`,
        });
      }
    }

    if (
      rule.transform.type === "conceptOnly" &&
      !rule.transform.reason.trim()
    ) {
      issues.push({
        ruleId,
        message: "Concept-only rules must explain why no exact product is generated.",
      });
    }

    if (
      rule.productStatus === "concept-only" &&
      rule.transform.type !== "conceptOnly"
    ) {
      issues.push({
        ruleId,
        message: "Only conceptOnly transforms may explicitly use concept-only product status.",
      });
    }
  }

  return issues;
}

export function assertValidReactionRegistry(rules: ReactionRule[]): void {
  const issues = validateReactionRegistry(rules);

  if (issues.length === 0) return;

  const message = issues
    .map((issue) => `${issue.ruleId ?? "registry"}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid reaction registry:\n${message}`);
}
